import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import {
  completePasswordReset,
  RESET_LINK_INVALID,
  withPasswordResetTransaction,
} from "@/server/password-reset";
import { guardPgPool, testDatabaseUrl } from "../helpers/pg-test-guard";

const SCHEMA = "mp022_reset_verify";

function assertFixtureSchema(schema: string): void {
  if (schema === "public" || schema === "mp022_capacity" || schema === "manpower_db") {
    throw new Error(`Refusing schema ${schema}`);
  }
}

async function protectedState(pool: Pool): Promise<string> {
  const result = await pool.query(
    `SELECT current_database()::text AS db,
            (SELECT count(*)::text FROM public.users) AS users,
            (SELECT count(*)::text FROM public.password_reset_tokens) AS tokens,
            (SELECT count(*)::text FROM public.sessions) AS sessions,
            (SELECT count(*)::text FROM pg_namespace WHERE nspname = 'mp022_capacity') AS capacity`,
  );
  return JSON.stringify(result.rows[0]);
}

describe("password reset against isolated PostgreSQL", () => {
  let admin: Pool;
  let prisma: PrismaClient;
  let fingerprint = "";
  const expiresSoon = new Date(Date.now() + 30 * 60 * 1000);

  beforeAll(async () => {
    assertFixtureSchema(SCHEMA);
    const connectionString = testDatabaseUrl();
    admin = guardPgPool(new Pool({ connectionString, max: 2, statement_timeout: 15_000 }), { allowedSchemas: [SCHEMA] });
    const current = await admin.query<{ db: string }>(`SELECT current_database()::text AS db`);
    if (current.rows[0]?.db !== "mms_test") throw new Error(`Refusing database ${current.rows[0]?.db ?? ""}`);
    fingerprint = await protectedState(admin);
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.query(`
      CREATE TABLE ${SCHEMA}.users (
        id SERIAL PRIMARY KEY,
        role_id INTEGER,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        avatar VARCHAR(255),
        email_verified_at TIMESTAMPTZ(6),
        password VARCHAR(255) NOT NULL,
        remember_token VARCHAR(100),
        settings TEXT,
        user_type_id INTEGER,
        agent_id INTEGER,
        sub_agent_id INTEGER,
        teacher_id INTEGER,
        employee_id INTEGER,
        candidate_id INTEGER,
        employer_id INTEGER,
        agencier_id INTEGER,
        companier_id INTEGER,
        status CHAR(5),
        created_at TIMESTAMPTZ(6),
        updated_at TIMESTAMPTZ(6)
      )
    `);
    await admin.query(`
      CREATE TABLE ${SCHEMA}.sessions (
        id VARCHAR(64) PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES ${SCHEMA}.users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ(6) NOT NULL,
        absolute_expires_at TIMESTAMPTZ(6) NOT NULL,
        revoked_at TIMESTAMPTZ(6),
        created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ip VARCHAR(64),
        user_agent VARCHAR(400)
      )
    `);
    await admin.query(`
      CREATE TABLE ${SCHEMA}.password_reset_tokens (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES ${SCHEMA}.users(id) ON DELETE CASCADE,
        token_hash VARCHAR(128) NOT NULL,
        expires_at TIMESTAMPTZ(6) NOT NULL,
        used_at TIMESTAMPTZ(6),
        created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString, max: 4, statement_timeout: 15_000, options: `-c search_path=${SCHEMA}` },
        { schema: SCHEMA },
      ),
    });
    const info = await prisma.$queryRaw<Array<{ schema: string | null; path: string; db: string }>>`
      SELECT current_schema() AS schema, current_setting('search_path') AS path, current_database()::text AS db
    `;
    const row = info[0];
    if (!row || row.db !== "mms_test" || row.schema !== SCHEMA || !row.path.includes(SCHEMA)) {
      throw new Error(`Refusing reset SQL outside ${SCHEMA}. schema=${row?.schema ?? ""} path=${row?.path ?? ""} db=${row?.db ?? ""}`);
    }
    await admin.query(
      `INSERT INTO ${SCHEMA}.users (name, email, password) VALUES ('Probe', 'probe-reset@example.com', 'probe-hash')`,
    );
    await admin.query(
      `INSERT INTO ${SCHEMA}.password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (1, 'probe-token-hash', NOW() + interval '30 minutes')`,
    );
    const found = await prisma.passwordResetToken.findFirst({ where: { tokenHash: "probe-token-hash" } });
    expect(found?.tokenHash).toBe("probe-token-hash");
    const publicSample = await admin.query<{ token_hash: string }>(
      `SELECT token_hash FROM public.password_reset_tokens LIMIT 1`,
    );
    if (publicSample.rows[0]) {
      const leaked = await prisma.passwordResetToken.findFirst({ where: { tokenHash: publicSample.rows[0].token_hash } });
      expect(leaked).toBeNull();
    }
    expect(await protectedState(admin)).toBe(fingerprint);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
      if (fingerprint) expect(await protectedState(admin)).toBe(fingerprint);
      await admin.end();
    }
  });

  beforeEach(async () => {
    await admin.query(`DROP TRIGGER IF EXISTS fail_consume ON ${SCHEMA}.password_reset_tokens`);
    await admin.query(`DROP TRIGGER IF EXISTS fail_revoke ON ${SCHEMA}.sessions`);
    await admin.query(`ALTER TABLE ${SCHEMA}.users DROP CONSTRAINT IF EXISTS users_reject_hash`);
    await admin.query(`TRUNCATE ${SCHEMA}.sessions, ${SCHEMA}.password_reset_tokens, ${SCHEMA}.users RESTART IDENTITY CASCADE`);
  });

  function reset(tokenHash: string, passwordHash: string, now = new Date()) {
    return completePasswordReset({
      tokenHash,
      now,
      hashPassword: async () => passwordHash,
      transaction: (run) => withPasswordResetTransaction(prisma, run),
    });
  }

  async function seed(token: { hash: string; expiresAt: Date; usedAt: Date | null }) {
    const user = await admin.query<{ id: number }>(
      `INSERT INTO ${SCHEMA}.users (name, email, password) VALUES ('Reset User', 'reset@example.com', 'old-hash') RETURNING id`,
    );
    const other = await admin.query<{ id: number }>(
      `INSERT INTO ${SCHEMA}.users (name, email, password) VALUES ('Other User', 'other@example.com', 'other-hash') RETURNING id`,
    );
    const userId = user.rows[0]?.id;
    const otherId = other.rows[0]?.id;
    if (!userId || !otherId) throw new Error("fixture user was not inserted");
    const sessionEnd = new Date(Date.now() + 60 * 60 * 1000);
    const alreadyRevoked = new Date(Date.now() - 60 * 60 * 1000);
    await admin.query(
      `INSERT INTO ${SCHEMA}.sessions (id, user_id, expires_at, absolute_expires_at, revoked_at)
       VALUES ('open', $1, $2, $2, NULL), ('closed', $1, $2, $2, $3), ('other-user', $4, $2, $2, NULL)`,
      [userId, sessionEnd, alreadyRevoked, otherId],
    );
    await admin.query(
      `INSERT INTO ${SCHEMA}.password_reset_tokens (user_id, token_hash, expires_at, used_at) VALUES ($1, $2, $3, $4)`,
      [userId, token.hash, token.expiresAt, token.usedAt],
    );
    return { userId, otherId };
  }

  async function state(userId: number) {
    const password = await admin.query<{ password: string }>(`SELECT password FROM ${SCHEMA}.users WHERE id = $1`, [userId]);
    const token = await admin.query<{ used_at: Date | null }>(
      `SELECT used_at FROM ${SCHEMA}.password_reset_tokens WHERE user_id = $1`,
      [userId],
    );
    const sessions = await admin.query<{ id: string; revoked_at: Date | null }>(
      `SELECT id, revoked_at FROM ${SCHEMA}.sessions ORDER BY id`,
    );
    return {
      password: password.rows[0]?.password,
      usedAt: token.rows[0]?.used_at ?? null,
      sessions: new Map(sessions.rows.map((row) => [row.id, row.revoked_at])),
    };
  }

  it("hashes before locking the token, then updates the password, consumes it, and revokes open sessions", async () => {
    const tokenHash = "a".repeat(64);
    const { userId } = await seed({ hash: tokenHash, expiresAt: expiresSoon, usedAt: null });
    const result = await completePasswordReset({
      tokenHash,
      hashPassword: async () => {
        const locks = await admin.query<{ n: number }>(
          `SELECT count(*)::int AS n
           FROM pg_locks l
           JOIN pg_class c ON c.oid = l.relation
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = $1 AND c.relname = 'password_reset_tokens'`,
          [SCHEMA],
        );
        expect(locks.rows[0]?.n).toBe(0);
        return "hashed-password";
      },
      transaction: (run) => withPasswordResetTransaction(prisma, run),
    });
    expect(result).toEqual({ ok: true, userId });
    const after = await state(userId);
    expect(after.password).toBe("hashed-password");
    expect(after.usedAt).not.toBeNull();
    expect(after.sessions.get("open")).not.toBeNull();
    expect(after.sessions.get("closed")).not.toBeNull();
    expect(after.sessions.get("other-user")).toBeNull();
  });

  it("does not change an invalid, expired, or already-used token", async () => {
    const now = new Date();
    const expired = await seed({ hash: "b".repeat(64), expiresAt: new Date(now.getTime() - 60_000), usedAt: null });
    expect(await reset("b".repeat(64), "new-hash", now)).toEqual({ ok: false, error: RESET_LINK_INVALID });
    let after = await state(expired.userId);
    expect(after.password).toBe("old-hash");
    expect(after.usedAt).toBeNull();
    expect(after.sessions.get("open")).toBeNull();

    await admin.query(`TRUNCATE ${SCHEMA}.sessions, ${SCHEMA}.password_reset_tokens, ${SCHEMA}.users RESTART IDENTITY CASCADE`);
    const usedAt = new Date(now.getTime() - 120_000);
    const used = await seed({ hash: "c".repeat(64), expiresAt: expiresSoon, usedAt });
    expect(await reset("c".repeat(64), "new-hash", now)).toEqual({ ok: false, error: RESET_LINK_INVALID });
    after = await state(used.userId);
    expect(after.password).toBe("old-hash");
    expect(after.usedAt?.getTime()).toBe(usedAt.getTime());
    expect(after.sessions.get("open")).toBeNull();

    await admin.query(`TRUNCATE ${SCHEMA}.sessions, ${SCHEMA}.password_reset_tokens, ${SCHEMA}.users RESTART IDENTITY CASCADE`);
    const missing = await seed({ hash: "d".repeat(64), expiresAt: expiresSoon, usedAt: null });
    expect(await reset("e".repeat(64), "new-hash", now)).toEqual({ ok: false, error: RESET_LINK_INVALID });
    after = await state(missing.userId);
    expect(after.password).toBe("old-hash");
    expect(after.usedAt).toBeNull();
    expect(after.sessions.get("open")).toBeNull();
  });

  it("lets exactly one of two concurrent resets consume the token", async () => {
    const tokenHash = "f".repeat(64);
    const { userId } = await seed({ hash: tokenHash, expiresAt: expiresSoon, usedAt: null });
    const results = await Promise.all(
      ["hash-a", "hash-b"].map((passwordHash) => reset(tokenHash, passwordHash)),
    );
    const won = results.filter((result) => result.ok);
    const lost = results.filter((result) => !result.ok);
    expect(won).toHaveLength(1);
    expect(lost).toEqual([{ ok: false, error: RESET_LINK_INVALID }]);
    const after = await state(userId);
    expect(["hash-a", "hash-b"]).toContain(after.password);
    expect(after.usedAt).not.toBeNull();
    expect(after.sessions.get("open")).not.toBeNull();
    expect(after.sessions.get("other-user")).toBeNull();
    const other = await admin.query<{ password: string }>(`SELECT password FROM ${SCHEMA}.users WHERE id <> $1`, [userId]);
    expect(other.rows[0]?.password).toBe("other-hash");
  });

  it("rejects a reset whose token is consumed while its hash is still running", async () => {
    const tokenHash = "1".repeat(64);
    const { userId } = await seed({ hash: tokenHash, expiresAt: expiresSoon, usedAt: null });
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let hashing = false;
    const slow = completePasswordReset({
      tokenHash,
      hashPassword: async () => {
        hashing = true;
        await gate;
        return "slow-hash";
      },
      transaction: (run) => withPasswordResetTransaction(prisma, run),
    });
    const started = Date.now();
    while (!hashing) {
      if (Date.now() > started + 1_000) throw new Error("slow reset did not start hashing");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const fast = await Promise.race([
      reset(tokenHash, "fast-hash"),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("fast reset blocked while the other request was hashing")), 1_000);
      }),
    ]);
    expect(fast.ok).toBe(true);
    release();
    await expect(slow).resolves.toEqual({ ok: false, error: RESET_LINK_INVALID });
    const after = await state(userId);
    expect(after.password).toBe("fast-hash");
    expect(after.usedAt).not.toBeNull();
    expect(after.sessions.get("open")).not.toBeNull();
    expect(after.sessions.get("other-user")).toBeNull();
  });

  it("rolls back the password, token, and sessions when the password update fails", async () => {
    const tokenHash = "2".repeat(64);
    const { userId } = await seed({ hash: tokenHash, expiresAt: expiresSoon, usedAt: null });
    await admin.query(`ALTER TABLE ${SCHEMA}.users ADD CONSTRAINT users_reject_hash CHECK (password <> 'reject-this-hash')`);
    await expect(reset(tokenHash, "reject-this-hash")).rejects.toThrow(/users_reject_hash|reject-this-hash/);
    const after = await state(userId);
    expect(after.password).toBe("old-hash");
    expect(after.usedAt).toBeNull();
    expect(after.sessions.get("open")).toBeNull();
  });

  it("rolls back the password, token, and sessions when token consumption fails", async () => {
    const tokenHash = "3".repeat(64);
    const { userId } = await seed({ hash: tokenHash, expiresAt: expiresSoon, usedAt: null });
    await admin.query(`
      CREATE OR REPLACE FUNCTION ${SCHEMA}.fail_consume()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $fn$
      BEGIN
        IF NEW.used_at IS NOT NULL THEN
          RAISE EXCEPTION 'token consume failed';
        END IF;
        RETURN NEW;
      END;
      $fn$
    `);
    await admin.query(`
      CREATE TRIGGER fail_consume
      BEFORE UPDATE ON ${SCHEMA}.password_reset_tokens
      FOR EACH ROW
      EXECUTE FUNCTION ${SCHEMA}.fail_consume()
    `);
    await expect(reset(tokenHash, "new-hash")).rejects.toThrow(/token consume failed/);
    const after = await state(userId);
    expect(after.password).toBe("old-hash");
    expect(after.usedAt).toBeNull();
    expect(after.sessions.get("open")).toBeNull();
  });

  it("rolls back the password, token, and sessions when session revocation fails", async () => {
    const tokenHash = "4".repeat(64);
    const { userId } = await seed({ hash: tokenHash, expiresAt: expiresSoon, usedAt: null });
    await admin.query(`
      CREATE OR REPLACE FUNCTION ${SCHEMA}.fail_revoke()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $fn$
      BEGIN
        IF NEW.revoked_at IS NOT NULL THEN
          RAISE EXCEPTION 'session revoke failed';
        END IF;
        RETURN NEW;
      END;
      $fn$
    `);
    await admin.query(`
      CREATE TRIGGER fail_revoke
      BEFORE UPDATE ON ${SCHEMA}.sessions
      FOR EACH ROW
      EXECUTE FUNCTION ${SCHEMA}.fail_revoke()
    `);
    await expect(reset(tokenHash, "new-hash")).rejects.toThrow(/session revoke failed/);
    const after = await state(userId);
    expect(after.password).toBe("old-hash");
    expect(after.usedAt).toBeNull();
    expect(after.sessions.get("open")).toBeNull();
  });
});
