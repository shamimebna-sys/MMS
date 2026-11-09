import "dotenv/config";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type Pool as PgPool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { flushPerfLogs, instrumentPool, poolMetrics, setPerfSink, stopPerfRuntime } from "@/server/perf/runtime";
import { guardPgPool, scopedTestDatabaseUrl, testDatabaseUrl } from "../helpers/pg-test-guard";

const SCHEMA = "mp022e_perf";
const PROTECTED = ["public", "mp022_capacity", "mp022c_capacity"] as const;

function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function scopedUrl(raw: string, schema: string): string {
  if ((PROTECTED as readonly string[]).includes(schema)) throw new Error(`Refusing schema ${schema}`);
  return scopedTestDatabaseUrl(raw, schema);
}

async function protectedState(pool: PgPool): Promise<string> {
  const tables = await pool.query<{ schema: string; name: string }>(
    `SELECT n.nspname AS schema, c.relname AS name
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY($1::text[]) AND c.relkind = 'r'
     ORDER BY 1, 2`,
    [PROTECTED],
  );
  const counts: string[] = [];
  for (const table of tables.rows) {
    const count = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${quoteIdent(table.schema)}.${quoteIdent(table.name)}`,
    );
    counts.push(`${table.schema}.${table.name}=${count.rows[0]?.count ?? ""}`);
  }
  const namespaces = await pool.query<{ name: string; count: string }>(
    `SELECT nspname AS name, count(*)::text AS count
     FROM pg_namespace
     WHERE nspname = ANY($1::text[])
     GROUP BY nspname
     ORDER BY nspname`,
    [PROTECTED],
  );
  return JSON.stringify({ db: "mms_test", namespaces: namespaces.rows, counts });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("performance instrumentation against isolated PostgreSQL", () => {
  let admin: PgPool;
  let connectionString = "";
  let fingerprint = "";

  beforeAll(async () => {
    stopPerfRuntime();
    const raw = testDatabaseUrl();
    admin = guardPgPool(new Pool({ connectionString: raw, max: 2, statement_timeout: 15_000 }), { allowedSchemas: [SCHEMA] });
    const current = await admin.query<{ db: string }>(`SELECT current_database()::text AS db`);
    if (current.rows[0]?.db !== "mms_test") throw new Error(`Refusing database ${current.rows[0]?.db ?? ""}`);
    fingerprint = await protectedState(admin);
    await admin.query(`DROP SCHEMA IF EXISTS ${quoteIdent(SCHEMA)} CASCADE`);
    await admin.query(`CREATE SCHEMA ${quoteIdent(SCHEMA)}`);
    connectionString = scopedUrl(raw, SCHEMA);
    const located = await admin.query<{ schema: string | null }>(`SELECT current_schema() AS schema`);
    if (located.rows[0]?.schema === SCHEMA) throw new Error("Admin pool is using the instrumentation schema.");
  }, 60_000);

  afterAll(async () => {
    stopPerfRuntime();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${quoteIdent(SCHEMA)} CASCADE`);
      if (fingerprint) expect(await protectedState(admin)).toBe(fingerprint);
      await admin.end();
    }
  });

  async function withPool<T>(max: number, run: (pool: PgPool) => Promise<T>): Promise<T> {
    const pool = guardPgPool(new Pool({ connectionString, max, statement_timeout: 15_000 }), { allowedSchemas: [SCHEMA] });
    instrumentPool(pool);
    try {
      expect(pool.options.max).toBe(max);
      return await run(pool);
    } finally {
      await pool.end();
    }
  }

  it("measures checkout wait separately from a new connection", async () => {
    await withPool(1, async (pool) => {
      const first = await pool.connect();
      const started = performance.now();
      const pending = pool.connect();
      await delay(120);
      first.release();
      const second = await pending;
      try {
        const measured = poolMetrics(pool)?.checkoutWait.max ?? 0;
        expect(poolMetrics(pool)?.connectionSetup.count).toBe(1);
        expect(poolMetrics(pool)?.checkoutWait.count).toBe(1);
        expect(measured).toBeGreaterThanOrEqual(80);
        expect(measured).toBeLessThanOrEqual(performance.now() - started + 50);
      } finally {
        second.release();
      }
      expect(poolMetrics(pool)?.inFlight).toBe(0);
      expect(poolMetrics(pool)?.acquires).toBe(poolMetrics(pool)?.releases);
      expect(pool.options.max).toBe(1);
    });
  }, 30_000);

  it("measures query execution separately from checkout", async () => {
    await withPool(1, async (pool) => {
      await pool.query("SELECT 1");
      const started = performance.now();
      await pool.query("SELECT pg_sleep(0.05)");
      const elapsed = performance.now() - started;
      const metrics = poolMetrics(pool);
      expect(metrics?.query.count).toBe(2);
      expect(metrics?.prisma.count).toBe(0);
      expect(metrics?.query.max ?? 0).toBeGreaterThanOrEqual(40);
      expect(metrics?.query.max ?? 0).toBeLessThanOrEqual(elapsed);
      expect(metrics?.acquires).toBe(2);
      expect(metrics?.releases).toBe(2);
    });
  }, 30_000);

  it("counts pool saturation, overlapping checkouts, release, and a single client for nested work", async () => {
    await withPool(1, async (pool) => {
      const first = await pool.connect();
      const pending = [pool.connect(), pool.connect(), pool.connect()];
      let finished = false;
      try {
        expect(pool.waitingCount).toBe(3);
        expect(poolMetrics(pool)?.maxWaiting).toBeGreaterThanOrEqual(3);
        expect(poolMetrics(pool)?.saturatedSamples).toBeGreaterThan(0);
        expect(pool.totalCount).toBeLessThanOrEqual(1);
        first.release();
        for (const next of pending) {
          const client = await next;
          client.release();
        }
        expect(pool.waitingCount).toBe(0);
        expect(poolMetrics(pool)?.inFlight).toBe(0);
        expect(poolMetrics(pool)?.acquires).toBe(4);
        expect(poolMetrics(pool)?.releases).toBe(4);
        finished = true;
      } finally {
        if (!finished) {
          try {
            first.release();
          } catch {
            // The client was already returned to the pool.
          }
          for (const next of pending) {
            const client = await next;
            try {
              client.release();
            } catch {
              // Already released by the loop above.
            }
          }
        }
      }
    });

    await withPool(2, async (pool) => {
      let connects = 0;
      let acquires = 0;
      let releases = 0;
      pool.on("connect", () => {
        connects += 1;
      });
      pool.on("acquire", () => {
        acquires += 1;
      });
      pool.on("release", () => {
        releases += 1;
      });
      await Promise.all([pool.query("SELECT pg_sleep(0.05)"), pool.query("SELECT pg_sleep(0.05)"), pool.query("SELECT pg_sleep(0.05)")]);
      const metrics = poolMetrics(pool);
      expect(metrics?.maxInFlight).toBeGreaterThan(1);
      expect(metrics?.maxInFlight).toBeLessThanOrEqual(2);
      expect(metrics?.inFlight).toBe(0);
      expect(metrics?.acquires).toBe(metrics?.releases);
      expect(metrics?.acquires).toBe(3);
      expect(acquires).toBe(3);
      expect(releases).toBe(3);
      expect(connects).toBe(metrics?.connects);
      expect(connects).toBeLessThanOrEqual(2);
      expect(pool.totalCount).toBeLessThanOrEqual(2);
      expect(pool.waitingCount).toBe(0);

      const before = metrics?.acquires ?? 0;
      const beforeQueries = metrics?.query.count ?? 0;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SAVEPOINT mp022e_nested");
        await client.query("SELECT 1");
        await client.query("RELEASE SAVEPOINT mp022e_nested");
        await client.query("COMMIT");
      } finally {
        client.release();
      }
      expect(poolMetrics(pool)?.acquires).toBe(before + 1);
      expect(poolMetrics(pool)?.query.count).toBe(beforeQueries + 5);
      expect(poolMetrics(pool)?.releases).toBe(poolMetrics(pool)?.acquires);
      expect(poolMetrics(pool)?.inFlight).toBe(0);
    });
  }, 30_000);

  it("counts query errors once, hides parameters, and does not double-count pool.query", async () => {
    await withPool(1, async (pool) => {
      setPerfSink(() => undefined);
      await expect(pool.query("SELECT * FROM mp022e_missing_relation WHERE email = $1", ["person@example.com"])).rejects.toThrow(/mp022e_missing_relation/);
      expect(poolMetrics(pool)?.query.errors).toBe(1);
      expect(poolMetrics(pool)?.query.count).toBe(1);
      expect(poolMetrics(pool)?.acquires).toBe(1);
      expect(poolMetrics(pool)?.releases).toBe(1);
      await pool.query("SELECT $1::text AS kept", ["person@example.com"]);
      expect(poolMetrics(pool)?.query.count).toBe(2);
      expect(poolMetrics(pool)?.query.errors).toBe(1);
      const text = flushPerfLogs().join("\n");
      setPerfSink(null);
      expect(text.includes("person@example.com")).toBe(false);
      expect(text.includes("mp022e_missing_relation")).toBe(false);
      expect(text.includes("SELECT")).toBe(false);
      const password = new URL(connectionString).password;
      if (password) expect(text.includes(password)).toBe(false);
      expect(pool.options.max).toBe(1);
    });
  }, 30_000);

  it("records Prisma adapter round-trips without a checkout per nested statement", async () => {
    const pool = guardPgPool(new Pool({ connectionString, max: 2, statement_timeout: 15_000 }), { allowedSchemas: [SCHEMA] });
    instrumentPool(pool);
    const prisma = new PrismaClient({
      adapter: new PrismaPg(pool as unknown as ConstructorParameters<typeof PrismaPg>[0]),
    });
    try {
      expect(pool.options.max).toBe(2);
      const beforePrisma = poolMetrics(pool)?.prisma.count ?? 0;
      const beforeQueries = poolMetrics(pool)?.query.count ?? 0;
      const beforeAcquires = poolMetrics(pool)?.acquires ?? 0;
      await prisma.$queryRawUnsafe("SELECT 1");
      const prismaQueries = (poolMetrics(pool)?.prisma.count ?? 0) - beforePrisma;
      const queries = (poolMetrics(pool)?.query.count ?? 0) - beforeQueries;
      expect(prismaQueries).toBeGreaterThanOrEqual(1);
      expect(queries).toBeGreaterThanOrEqual(prismaQueries);
      expect((poolMetrics(pool)?.acquires ?? 0) - beforeAcquires).toBeGreaterThanOrEqual(1);

      const rawBefore = poolMetrics(pool)?.prisma.count ?? 0;
      await pool.query("SELECT 1");
      expect(poolMetrics(pool)?.prisma.count).toBe(rawBefore);

      const txBeforeAcquires = poolMetrics(pool)?.acquires ?? 0;
      const txBeforeQueries = poolMetrics(pool)?.query.count ?? 0;
      await prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe("SELECT 1");
        await tx.$transaction(async (inner) => {
          await inner.$queryRawUnsafe("SELECT 2");
        });
      });
      const checkouts = (poolMetrics(pool)?.acquires ?? 0) - txBeforeAcquires;
      const txQueries = (poolMetrics(pool)?.query.count ?? 0) - txBeforeQueries;
      expect(checkouts).toBeGreaterThanOrEqual(1);
      expect(checkouts).toBeLessThan(txQueries);
      expect(poolMetrics(pool)?.releases).toBe(poolMetrics(pool)?.acquires);
      expect(poolMetrics(pool)?.inFlight).toBe(0);
      expect(pool.totalCount).toBeLessThanOrEqual(2);
    } finally {
      await prisma.$disconnect();
      await pool.end();
    }
  }, 30_000);
});
