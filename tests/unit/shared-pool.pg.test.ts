import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool, type Pool as PgPool } from "pg";
import type { PrismaClient } from "@/generated/prisma/client";
import { LOCKOUT_LIMIT } from "@/lib/auth/lockout";
import { guardPgPool, scopedTestDatabaseUrl, testDatabaseUrl } from "../helpers/pg-test-guard";

const SCHEMA = "mp022_login_pool";

function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function scopedUrl(raw: string, schema: string): string {
  if (schema === "public" || schema === "mp022_capacity") throw new Error(`Refusing schema ${schema}`);
  return scopedTestDatabaseUrl(raw, schema);
}

async function protectedState(pool: PgPool): Promise<string> {
  const tables = await pool.query<{ schema: string; name: string }>(
    `SELECT n.nspname AS schema, c.relname AS name
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('public', 'mp022_capacity') AND c.relkind = 'r'
     ORDER BY 1, 2`,
  );
  const counts: string[] = [];
  for (const table of tables.rows) {
    const count = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${quoteIdent(table.schema)}.${quoteIdent(table.name)}`,
    );
    counts.push(`${table.schema}.${table.name}=${count.rows[0]?.count ?? ""}`);
  }
  const capacity = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM pg_namespace WHERE nspname = 'mp022_capacity'`,
  );
  return JSON.stringify({
    db: "mms_test",
    capacity: capacity.rows[0]?.count ?? "",
    counts,
  });
}

type DbModule = {
  pool: PgPool;
  prisma: PrismaClient;
  closeDb: () => Promise<void>;
};

function adapterPool(prisma: PrismaClient): PgPool | undefined {
  const client = prisma as PrismaClient & { _engineConfig?: { adapter?: { externalPool?: PgPool } } };
  return client._engineConfig?.adapter?.externalPool;
}

function checkedOut(pool: PgPool): number {
  return pool.totalCount - pool.idleCount;
}

describe("shared pool against isolated PostgreSQL", () => {
  let admin: PgPool;
  let db: DbModule;
  let passwordHash = "";
  let fingerprint = "";
  const previousUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    const connectionString = testDatabaseUrl();
    admin = guardPgPool(new Pool({ connectionString, max: 2, statement_timeout: 15_000 }), { allowedSchemas: [SCHEMA] });
    const current = await admin.query<{ db: string }>(`SELECT current_database()::text AS db`);
    if (current.rows[0]?.db !== "mms_test") throw new Error(`Refusing database ${current.rows[0]?.db ?? ""}`);
    fingerprint = await protectedState(admin);
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.query(`
      CREATE TABLE ${SCHEMA}.roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL
      )
    `);
    await admin.query(`
      CREATE TABLE ${SCHEMA}.users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        status VARCHAR(5),
        candidate_id INTEGER,
        role_id INTEGER
      )
    `);
    await admin.query(`
      CREATE TABLE ${SCHEMA}.login_attempts (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        ip VARCHAR(64),
        success BOOLEAN NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      )
    `);
    const globalDb = globalThis as { pool?: unknown; prisma?: unknown };
    delete globalDb.pool;
    delete globalDb.prisma;
    vi.resetModules();
    process.env.DATABASE_URL = scopedUrl(connectionString, SCHEMA);
    db = await import("@/lib/db");
    const located = await db.pool.query<{ schema: string | null; db: string }>(
      `SELECT current_schema() AS schema, current_database()::text AS db`,
    );
    const row = located.rows[0];
    if (!row || row.db !== "mms_test" || row.schema !== SCHEMA) {
      throw new Error(`Refusing shared pool outside ${SCHEMA}. schema=${row?.schema ?? ""} db=${row?.db ?? ""}`);
    }
    const viaPrisma = await db.prisma.$queryRaw<Array<{ schema: string | null; db: string }>>`
      SELECT current_schema() AS schema, current_database()::text AS db
    `;
    const prismaRow = viaPrisma[0];
    if (!prismaRow || prismaRow.db !== "mms_test" || prismaRow.schema !== SCHEMA) {
      throw new Error(`Refusing Prisma outside ${SCHEMA}. schema=${prismaRow?.schema ?? ""} db=${prismaRow?.db ?? ""}`);
    }
    const afterPrisma = await db.pool.query<{ schema: string | null }>(`SELECT current_schema() AS schema`);
    if (afterPrisma.rows[0]?.schema !== SCHEMA) {
      throw new Error(`Prisma changed the shared connection schema to ${afterPrisma.rows[0]?.schema ?? ""}`);
    }
    expect(adapterPool(db.prisma)).toBe(db.pool);
    expect(db.pool.options.max).toBe(10);
    expect(db.pool.totalCount).toBeLessThanOrEqual(10);
    const { hashPassword } = await import("@/lib/auth/password");
    passwordHash = await hashPassword("correct-password");
    expect(await protectedState(admin)).toBe(fingerprint);
  }, 60_000);

  beforeEach(async () => {
    await admin.query(`TRUNCATE ${SCHEMA}.login_attempts, ${SCHEMA}.users RESTART IDENTITY`);
    await admin.query(`INSERT INTO ${SCHEMA}.users (email, password, status) VALUES ('serial@example.com', $1, 'A'), ('overlap@example.com', $1, 'A')`, [
      passwordHash,
    ]);
  });

  afterAll(async () => {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    await db?.closeDb();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
      if (fingerprint) expect(await protectedState(admin)).toBe(fingerprint);
      await admin.end();
    }
  });

  async function failureCount(email: string): Promise<number> {
    const result = await admin.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${SCHEMA}.login_attempts WHERE email = $1 AND success = false`,
      [email],
    );
    return result.rows[0]?.count ?? 0;
  }

  it("keeps login bcrypt off a checked-out connection and locks after five failures", async () => {
    const { applyLoginAttempt } = await import("@/lib/auth/lockout");
    const { createLoginAttemptStore } = await import("@/server/login-lock");
    const { verifyPassword } = await import("@/lib/auth/password");
    const email = "serial@example.com";
    let compares = 0;
    for (let index = 0; index < LOCKOUT_LIMIT; index += 1) {
      const outcome = await applyLoginAttempt({
        email,
        atMs: Date.parse("2026-11-07T00:00:00.000Z") + index,
        store: createLoginAttemptStore("203.0.113.8"),
        verifyPassword: async (hash) => {
          compares += 1;
          expect(checkedOut(db.pool)).toBe(0);
          expect(db.pool.waitingCount).toBe(0);
          return verifyPassword("wrong-password", hash);
        },
      });
      expect(outcome.kind).toBe("failure");
    }
    let comparedWhileLocked = false;
    const locked = await applyLoginAttempt({
      email,
      atMs: Date.parse("2026-11-07T00:00:00.000Z") + LOCKOUT_LIMIT,
      store: createLoginAttemptStore("203.0.113.8"),
      verifyPassword: async () => {
        comparedWhileLocked = true;
        return true;
      },
    });
    expect(locked.kind).toBe("locked");
    expect(comparedWhileLocked).toBe(false);
    expect(compares).toBe(LOCKOUT_LIMIT);
    expect(await failureCount(email)).toBe(LOCKOUT_LIMIT);
    expect(checkedOut(db.pool)).toBe(0);
    expect(db.pool.totalCount).toBeLessThanOrEqual(10);
  }, 60_000);

  it("lets overlapping bcrypt checks share the pool without holding a login connection", async () => {
    const { applyLoginAttempt } = await import("@/lib/auth/lockout");
    const { createLoginAttemptStore } = await import("@/server/login-lock");
    const email = "overlap@example.com";
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let inBcrypt = 0;
    let maxCheckedOut = 0;
    const attempts = Array.from({ length: LOCKOUT_LIMIT + 3 }, () =>
      applyLoginAttempt({
        email,
        atMs: Date.parse("2026-11-07T00:10:00.000Z"),
        store: createLoginAttemptStore("203.0.113.9"),
        verifyPassword: async () => {
          inBcrypt += 1;
          await gate;
          return false;
        },
      }),
    );
    const started = Date.now();
    while (inBcrypt < LOCKOUT_LIMIT + 3) {
      maxCheckedOut = Math.max(maxCheckedOut, checkedOut(db.pool));
      if (Date.now() - started > 20_000) throw new Error("overlapping login checks did not release the shared pool");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(checkedOut(db.pool)).toBe(0);
    expect(db.pool.waitingCount).toBe(0);
    expect(maxCheckedOut).toBeGreaterThan(0);
    expect(maxCheckedOut).toBeLessThanOrEqual(10);
    release?.();
    const results = await Promise.all(attempts);
    expect(results.filter((result) => result.kind === "failure")).toHaveLength(LOCKOUT_LIMIT);
    expect(results.filter((result) => result.kind === "locked")).toHaveLength(3);
    expect(await failureCount(email)).toBe(LOCKOUT_LIMIT);
    expect(checkedOut(db.pool)).toBe(0);
    expect(db.pool.totalCount).toBeLessThanOrEqual(10);
  }, 60_000);
});
