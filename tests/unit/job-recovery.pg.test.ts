import "dotenv/config";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool, type PoolClient } from "pg";
import { CLAIM_CANDIDATE_SQL, LEASE_SECONDS, UNCERTAIN_DELIVERY_ERROR } from "@/server/jobs/lifecycle";
import { createJobStore, processOne, type JobPool, type JobStore, type QueryClient } from "@/server/jobs/runner";
import { guardPgPool, scopedTestDatabaseUrl, testDatabaseUrl } from "../helpers/pg-test-guard";

const SCHEMA = "mp021_verify";
const ADMIN_SQL = { allowedSchemas: [SCHEMA] };
const FIXTURE_SQL = { allowedSchemas: [SCHEMA], allowedUnqualifiedRelations: ["jobs"] };

class FixturePool implements JobPool {
  constructor(private readonly pool: Pool) {}

  async connect(): Promise<QueryClient> {
    const client = await this.pool.connect();
    try {
      await client.query(`SET search_path TO ${SCHEMA}`);
      const found = await client.query(
        `SELECT current_schema() AS schema,
                current_setting('search_path') AS search_path,
                to_regclass('jobs')::oid AS jobs_oid,
                to_regclass('${SCHEMA}.jobs')::oid AS fixture_oid,
                to_regclass('public.jobs')::oid AS public_oid`,
      );
      const row = found.rows[0] as { schema?: string; search_path?: string; jobs_oid?: string; fixture_oid?: string; public_oid?: string };
      const isolated = row.schema === SCHEMA && row.search_path === SCHEMA && row.jobs_oid != null && row.jobs_oid === row.fixture_oid && row.jobs_oid !== row.public_oid;
      if (!isolated) {
        throw new Error(`Refusing job SQL outside ${SCHEMA}. schema=${row.schema ?? ""} search_path=${row.search_path ?? ""}`);
      }
      return client as unknown as QueryClient;
    } catch (error) {
      client.release(error instanceof Error ? error : new Error("fixture setup failed"));
      throw error;
    }
  }
}

describe("job recovery against local PostgreSQL", () => {
  let admin: Pool;
  let raw: Pool;
  let store: JobStore;
  let fixture: FixturePool;
  let publicJobs = "";
  const silent = () => {};

  beforeAll(async () => {
    const connectionString = testDatabaseUrl();
    admin = guardPgPool(new Pool({ connectionString, max: 2, statement_timeout: 15000 }), ADMIN_SQL);
    raw = guardPgPool(
      new Pool({ connectionString: scopedTestDatabaseUrl(connectionString, SCHEMA), max: 4, statement_timeout: 15000 }),
      FIXTURE_SQL,
    );
    fixture = new FixturePool(raw);
    store = createJobStore(fixture);
    publicJobs = await publicSnapshot(admin);
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.query(`
      CREATE TABLE ${SCHEMA}.jobs (
        id BIGSERIAL PRIMARY KEY,
        type VARCHAR(80) NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'queued',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        run_after TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        locked_at TIMESTAMPTZ(6),
        last_error TEXT,
        result JSONB,
        created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    expect(await publicSnapshot(admin)).toBe(publicJobs);
  });

  afterAll(async () => {
    if (raw) await raw.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
      expect(await publicSnapshot(admin)).toBe(publicJobs);
      await admin.end();
    }
  });

  beforeEach(async () => {
    await admin.query(`TRUNCATE ${SCHEMA}.jobs RESTART IDENTITY`);
    await assertIsolated(fixture);
  });

  afterEach(async () => {
    expect(await publicSnapshot(admin)).toBe(publicJobs);
  });

  it("lets one transaction skip a row locked by another instead of waiting", async () => {
    await insertQueued(admin, 1);
    const first = await checkout(fixture);
    const second = await checkout(fixture);
    try {
      await first.query("BEGIN");
      await second.query("BEGIN");
      await second.query("SET LOCAL statement_timeout = '2s'");
      const locked = await first.query(CLAIM_CANDIDATE_SQL, [LEASE_SECONDS]);
      expect(locked.rows).toHaveLength(1);
      const started = Date.now();
      const skipped = await second.query(CLAIM_CANDIDATE_SQL, [LEASE_SECONDS]);
      expect(Date.now() - started).toBeLessThan(1500);
      expect(skipped.rows).toHaveLength(0);
    } finally {
      await first.query("ROLLBACK");
      await second.query("ROLLBACK");
      first.release();
      second.release();
    }
    expect((await fixtureRows(admin))[0]?.status).toBe("queued");
  });

  it("gives two concurrent claims two different jobs", async () => {
    await insertQueued(admin, 2);
    const [left, right] = await Promise.all([store.claim(), store.claim()]);
    expect(left?.kind).toBe("execute");
    expect(right?.kind).toBe("execute");
    if (left?.kind === "execute" && right?.kind === "execute") expect(left.id).not.toBe(right.id);
    const rows = await fixtureRows(admin);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === "running" && row.attempts === 1)).toBe(true);
  });

  it("recovers a lease that the database clock says is expired", async () => {
    await admin.query(
      `INSERT INTO ${SCHEMA}.jobs (type, payload, status, attempts, max_attempts, run_after, locked_at)
       VALUES ('export_excel', '{"resource":"candidates"}'::jsonb, 'running', 1, 5, NOW(), NOW() - interval '301 seconds')`,
    );
    const recovered = await store.claim();
    expect(recovered?.kind).toBe("execute");
    if (recovered?.kind === "execute") expect(recovered.attempts).toBe(2);
    const fresh = await admin.query(
      `INSERT INTO ${SCHEMA}.jobs (type, payload, status, attempts, max_attempts, run_after, locked_at)
       VALUES ('export_excel', '{"resource":"candidates"}'::jsonb, 'running', 1, 5, NOW(), NOW() - interval '299 seconds')
       RETURNING id::text`,
    );
    const again = await store.claim();
    const freshId = String(fresh.rows[0]?.id);
    expect(again).toBeNull();
    const held = (await fixtureRows(admin)).find((row) => row.id === freshId);
    expect(held?.status).toBe("running");
    expect(held?.attempts).toBe(1);
  });

  it("refuses an old lease token after the database has issued a new one", async () => {
    await insertQueued(admin, 1);
    const first = await store.claim();
    expect(first?.kind).toBe("execute");
    if (first?.kind !== "execute") return;
    await admin.query(`UPDATE ${SCHEMA}.jobs SET locked_at = NOW() - interval '301 seconds' WHERE id = $1::bigint`, [first.id]);
    const second = await store.claim();
    expect(second?.kind).toBe("execute");
    if (second?.kind !== "execute") return;
    expect(second.lockedAt.getTime()).not.toBe(first.lockedAt.getTime());
    expect(await store.finish(first, { file: "stale.xlsx", rows: 1 }, null, false)).toBe(false);
    const row = (await fixtureRows(admin))[0];
    expect(row?.status).toBe("running");
    expect(row?.attempts).toBe(2);
    expect(row?.result).toBeNull();
    expect(await store.finish(second, { file: "fresh.xlsx", rows: 1 }, null, false)).toBe(true);
    const saved = (await fixtureRows(admin))[0];
    expect(saved?.status).toBe("done");
    expect(saved?.result).toMatchObject({ file: "fresh.xlsx", rows: 1 });
  });

  it("refreshes locked_at from PostgreSQL NOW() rather than the application clock", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2099-01-01T00:00:00.000Z").getTime());
    await admin.query(
      `INSERT INTO ${SCHEMA}.jobs (type, payload, run_after)
       VALUES ('export_excel', '{}'::jsonb, NOW() + interval '2 hours')`,
    );
    expect(await store.claim()).toBeNull();
    await admin.query(`UPDATE ${SCHEMA}.jobs SET run_after = NOW()`);
    const claimed = await store.claim();
    expect(claimed?.kind).toBe("execute");
    if (claimed?.kind !== "execute") return;
    const dbYear = await admin.query("SELECT EXTRACT(YEAR FROM NOW())::int AS year");
    expect(claimed.lockedAt.getUTCFullYear()).toBe(Number(dbYear.rows[0]?.year));
    expect(Number(dbYear.rows[0]?.year)).not.toBe(2099);
    await new Promise((resolve) => setTimeout(resolve, 40));
    const refreshed = await store.heartbeat(claimed);
    expect(refreshed).not.toBeNull();
    expect(refreshed && refreshed.getTime()).toBeGreaterThan(claimed.lockedAt.getTime());
    expect(await store.heartbeat({ ...claimed, lockedAt: claimed.lockedAt })).toBeNull();
    const dbNow = await admin.query("SELECT NOW() AS now");
    const databaseNow = new Date(instant(dbNow.rows[0]?.now));
    expect(Math.abs((refreshed?.getTime() ?? 0) - databaseNow.getTime())).toBeLessThan(5000);
    expect(refreshed?.getUTCFullYear()).not.toBe(2099);

    const client = await admin.connect();
    try {
      await client.query("BEGIN");
      const first = await client.query("SELECT NOW() AS now");
      await client.query("SELECT pg_sleep(0.2)");
      const second = await client.query("SELECT NOW() AS now, clock_timestamp() AS clock");
      await client.query("COMMIT");
      const firstNow = instant(first.rows[0]?.now);
      const secondNow = instant(second.rows[0]?.now);
      const clock = instant(second.rows[0]?.clock);
      expect(firstNow).toBe(secondNow);
      expect(clock).toBeGreaterThan(secondNow);
    } finally {
      client.release();
    }
  });

  it("does not retry an email whose delivery already started", async () => {
    await admin.query(
      `INSERT INTO ${SCHEMA}.jobs (type, payload, status, attempts, max_attempts, run_after, locked_at, result)
       VALUES (
         'send_email',
         '{"to":"person@example.com","subject":"Hello","text":"Body"}'::jsonb,
         'running',
         1,
         5,
         NOW(),
         NOW() - interval '301 seconds',
         '{"protocol":"mp021","external":"started","idempotencyKey":"job:fixture:send_email"}'::jsonb
       )`,
    );
    let sends = 0;
    const worked = await processOne(store, async () => {
      sends += 1;
      throw new Error("should not send");
    }, silent);
    expect(worked).toBe(true);
    expect(sends).toBe(0);
    const row = (await fixtureRows(admin))[0];
    expect(row?.status).toBe("failed");
    expect(row?.attempts).toBe(1);
    expect(row?.last_error).toContain(UNCERTAIN_DELIVERY_ERROR);
    expect(row?.result).toMatchObject({ external: "started" });
  });
});

function instant(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(String(value)).getTime();
  if (Number.isNaN(parsed)) throw new Error("PostgreSQL timestamp could not be read.");
  return parsed;
}

async function publicSnapshot(pool: Pool): Promise<string> {
  const relations = await pool.query(
    `SELECT c.relname AS name, c.relkind AS kind
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
     ORDER BY c.relname`,
  );
  return JSON.stringify(relations.rows);
}

async function assertIsolated(pool: FixturePool): Promise<void> {
  const client = await pool.connect();
  client.release();
}

async function checkout(pool: FixturePool): Promise<PoolClient> {
  return (await pool.connect()) as unknown as PoolClient;
}

async function insertQueued(pool: Pool, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await pool.query(
      `INSERT INTO ${SCHEMA}.jobs (type, payload, status, run_after) VALUES ('export_excel', '{"resource":"candidates"}'::jsonb, 'queued', NOW())`,
    );
  }
}

type FixtureJob = {
  id: string;
  status: string;
  attempts: number;
  last_error: string | null;
  result: unknown;
  locked_at: Date | null;
};

async function fixtureRows(pool: Pool): Promise<FixtureJob[]> {
  const result = await pool.query(
    `SELECT id::text, status, attempts, last_error, result, locked_at FROM ${SCHEMA}.jobs ORDER BY id`,
  );
  return result.rows as FixtureJob[];
}
