import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertSafeDestructiveSql,
  assertSafeTestDatabaseUrl,
  scopedTestDatabaseUrl,
  testDatabaseUrl,
  UnsafeTestDatabaseError,
} from "../helpers/pg-test-guard";

const SAFE = "postgresql://mms:change-me@127.0.0.1:54329/mms_test";
const PRIMARY = "postgresql://mms:change-me@127.0.0.1:5432/manpower_db";

const INTEGRATION_FILES = [
  "tests/unit/job-recovery.pg.test.ts",
  "tests/unit/candidate-passport.test.ts",
  "tests/unit/foreign-key-integrity.test.ts",
  "tests/unit/dashboard-read-path.pg.test.ts",
  "tests/unit/perf-instrumentation.pg.test.ts",
  "tests/unit/shared-pool.pg.test.ts",
  "tests/unit/password-reset.pg.test.ts",
];

describe("PostgreSQL test database guard", () => {
  it("accepts mms_test on 127.0.0.1:54329", () => {
    expect(assertSafeTestDatabaseUrl(SAFE)).toBe(SAFE);
    expect(testDatabaseUrl({ DATABASE_URL_TEST: SAFE })).toBe(SAFE);
  });

  it("rejects manpower_db on port 5432", () => {
    expect(() => assertSafeTestDatabaseUrl(PRIMARY)).toThrow(UnsafeTestDatabaseError);
    expect(() => assertSafeTestDatabaseUrl(PRIMARY)).toThrow(/manpower_db/);
    expect(() => testDatabaseUrl({ DATABASE_URL_TEST: PRIMARY })).toThrow(/5432\/manpower_db/);
  });

  it("rejects a missing or malformed test URL", () => {
    expect(() => testDatabaseUrl({})).toThrow(/DATABASE_URL_TEST is not set/);
    expect(() => testDatabaseUrl({ DATABASE_URL_TEST: "   " })).toThrow(/DATABASE_URL_TEST is not set/);
    expect(() => assertSafeTestDatabaseUrl("not a url")).toThrow(/malformed/);
    expect(() => assertSafeTestDatabaseUrl("postgresql://mms:change-me@127.0.0.1:54329/")).toThrow(/malformed/);
    expect(() => assertSafeTestDatabaseUrl("http://127.0.0.1:54329/mms_test")).toThrow(/malformed/);
  });

  it("rejects every unexpected host, port, database, and public search_path", () => {
    expect(() => assertSafeTestDatabaseUrl("postgresql://mms:change-me@localhost:54329/mms_test")).toThrow(/Refusing database target/);
    expect(() => assertSafeTestDatabaseUrl("postgresql://mms:change-me@127.0.0.1:5432/mms_test")).toThrow(/5432\/mms_test/);
    expect(() => assertSafeTestDatabaseUrl("postgresql://mms:change-me@127.0.0.1:54329/mms_dev")).toThrow(/mms_dev/);
    expect(() => assertSafeTestDatabaseUrl("postgresql://mms:change-me@127.0.0.1:54329/mms_ci")).toThrow(/mms_ci/);
    expect(() => assertSafeTestDatabaseUrl(`${SAFE}?options=-c%20search_path%3Dpublic`)).toThrow(/schema public/);
    expect(() => assertSafeTestDatabaseUrl(`${SAFE}?schema=public`)).toThrow(/schema public/);
  });

  it("does not fall back to DATABASE_URL", () => {
    const env = { DATABASE_URL: SAFE, DATABASE_URL_TEST: undefined };
    expect(() => testDatabaseUrl(env)).toThrow(/DATABASE_URL_TEST is not set/);
    expect(testDatabaseUrl({ DATABASE_URL: PRIMARY, DATABASE_URL_TEST: SAFE } as { DATABASE_URL_TEST?: string })).toBe(SAFE);
    expect(testDatabaseUrl({ DATABASE_URL: SAFE, DATABASE_URL_TEST: SAFE } as { DATABASE_URL_TEST?: string })).not.toContain("manpower_db");
  });

  it("pins search_path only to a test schema on the same database", () => {
    const scoped = scopedTestDatabaseUrl(SAFE, "mp021_verify", "-c statement_timeout=15000");
    const url = new URL(scoped);
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.port).toBe("54329");
    expect(url.pathname).toBe("/mms_test");
    expect(url.searchParams.get("options")).toContain("search_path=mp021_verify");
    expect(() => scopedTestDatabaseUrl(SAFE, "public")).toThrow(/schema public/);
    expect(() => scopedTestDatabaseUrl(PRIMARY, "mp021_verify")).toThrow(/manpower_db/);
  });

  it("rejects public-schema and unqualified destructive SQL, and allows test-owned SQL", () => {
    const policy = { allowedSchemas: ["mp021_verify"] };
    expect(() => assertSafeDestructiveSql("DROP SCHEMA public CASCADE", policy)).toThrow(/public/);
    expect(() => assertSafeDestructiveSql("DROP TABLE public.jobs", policy)).toThrow(/public/);
    expect(() => assertSafeDestructiveSql("DELETE FROM public.users", policy)).toThrow(/public/);
    expect(() => assertSafeDestructiveSql("TRUNCATE public.jobs", policy)).toThrow(/public/);
    expect(() => assertSafeDestructiveSql("DROP TABLE mp020_passport_guard", policy)).toThrow(/unqualified DROP TABLE/);
    expect(() => assertSafeDestructiveSql("CREATE TABLE candidates (id integer)", policy)).toThrow(/unqualified CREATE TABLE/);
    expect(() => assertSafeDestructiveSql("DELETE FROM users", policy)).toThrow(/unqualified destructive SQL/);
    expect(() => assertSafeDestructiveSql("DROP SCHEMA other_schema CASCADE", policy)).toThrow(/schema other_schema/);
    expect(() => assertSafeDestructiveSql("DROP DATABASE manpower_db", policy)).toThrow(/DROP DATABASE|manpower_db/);

    expect(() => assertSafeDestructiveSql("DROP SCHEMA IF EXISTS mp021_verify CASCADE", policy)).not.toThrow();
    expect(() => assertSafeDestructiveSql("CREATE SCHEMA mp021_verify", policy)).not.toThrow();
    expect(() => assertSafeDestructiveSql('DROP SCHEMA IF EXISTS "mp022e_perf" CASCADE', { allowedSchemas: ["mp022e_perf"] })).not.toThrow();
    expect(() => assertSafeDestructiveSql("TRUNCATE mp021_verify.jobs RESTART IDENTITY", policy)).not.toThrow();
    expect(() => assertSafeDestructiveSql("UPDATE mp021_verify.jobs SET run_after = NOW()", policy)).not.toThrow();
    expect(() => assertSafeDestructiveSql("DELETE FROM mp022q2_dash.candidates WHERE id = ANY($1::int[])", { allowedSchemas: ["mp022q2_dash"] })).not.toThrow();
    expect(() => assertSafeDestructiveSql(
      "TRUNCATE mp022_reset_verify.sessions, mp022_reset_verify.password_reset_tokens, mp022_reset_verify.users RESTART IDENTITY CASCADE",
      { allowedSchemas: ["mp022_reset_verify"] },
    )).not.toThrow();
    expect(() => assertSafeDestructiveSql(
      "DROP TRIGGER IF EXISTS fail_consume ON mp022_reset_verify.password_reset_tokens",
      { allowedSchemas: ["mp022_reset_verify"] },
    )).not.toThrow();
    expect(() => assertSafeDestructiveSql(
      "ALTER TABLE mp022_reset_verify.users DROP CONSTRAINT IF EXISTS users_reject_hash",
      { allowedSchemas: ["mp022_reset_verify"] },
    )).not.toThrow();
    expect(() => assertSafeDestructiveSql("SELECT count(*)::text AS count FROM public.users", policy)).not.toThrow();
    expect(() => assertSafeDestructiveSql(
      "CREATE TEMP TABLE mp019_parent (id integer PRIMARY KEY) ON COMMIT DROP",
      { allowedSchemas: [] },
    )).not.toThrow();
    expect(() => assertSafeDestructiveSql("DELETE FROM mp019_parent WHERE id = 1", {
      allowedSchemas: [],
      allowedUnqualifiedRelations: ["mp019_parent", "mp019_child", "mp019_required"],
    })).not.toThrow();
    expect(() => assertSafeDestructiveSql(
      `CREATE TABLE mp022_reset_verify.sessions (
        id VARCHAR(64) PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES mp022_reset_verify.users(id) ON DELETE CASCADE
      )`,
      { allowedSchemas: ["mp022_reset_verify"] },
    )).not.toThrow();
    expect(() => assertSafeDestructiveSql(
      `CREATE TABLE mp021_verify.jobs (
        id BIGSERIAL PRIMARY KEY,
        updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      { allowedSchemas: ["mp021_verify"] },
    )).not.toThrow();
    expect(() => assertSafeDestructiveSql("UPDATE jobs SET status = 'running'", {
      allowedSchemas: ["mp021_verify"],
      allowedUnqualifiedRelations: ["jobs"],
    })).not.toThrow();
    expect(() => assertSafeDestructiveSql("SELECT id FROM jobs WHERE status = 'queued' FOR UPDATE SKIP LOCKED", {
      allowedSchemas: ["mp021_verify"],
      allowedUnqualifiedRelations: ["jobs"],
    })).not.toThrow();
    expect(() => assertSafeDestructiveSql(
      `CREATE OR REPLACE FUNCTION mp022_reset_verify.fail_consume()
       RETURNS trigger LANGUAGE plpgsql AS $fn$
       BEGIN
         IF NEW.used_at IS NOT NULL OR OLD.revoked_at IS NOT NULL THEN
           RAISE EXCEPTION 'failed';
         END IF;
         RETURN NEW;
       END;
       $fn$`,
      { allowedSchemas: ["mp022_reset_verify"] },
    )).not.toThrow();
    expect(() => assertSafeDestructiveSql("DELETE FROM new.users", policy)).toThrow(/schema new/);
    expect(() => assertSafeDestructiveSql("UPDATE old.sessions SET revoked_at = NOW()", policy)).toThrow(/schema old/);
    expect(() => assertSafeDestructiveSql(
      "CREATE TRIGGER fail_consume BEFORE UPDATE ON mp022_reset_verify.password_reset_tokens FOR EACH ROW EXECUTE FUNCTION mp022_reset_verify.fail_consume()",
      { allowedSchemas: ["mp022_reset_verify"] },
    )).not.toThrow();
    expect(() => assertSafeDestructiveSql(
      "CREATE TRIGGER fail_consume BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION mp022_reset_verify.fail_consume()",
      { allowedSchemas: ["mp022_reset_verify"] },
    )).toThrow(/unqualified destructive SQL on users/);
    expect(() => assertSafeDestructiveSql(
      `CREATE FUNCTION mp022_reset_verify.leak() RETURNS trigger LANGUAGE plpgsql AS $fn$
       BEGIN
         DELETE FROM public.users;
         RETURN NEW;
       END;
       $fn$`,
      { allowedSchemas: ["mp022_reset_verify"] },
    )).toThrow(/public/);
  });

  it("keeps integration tests on DATABASE_URL_TEST and off the primary URL", () => {
    for (const file of INTEGRATION_FILES) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source, file).toContain("testDatabaseUrl");
      expect(source, file).not.toMatch(/process\.env\.DATABASE_URL_TEST\s*\|\|\s*process\.env\.DATABASE_URL\b/);
      expect(source, file).not.toMatch(/process\.env\.DATABASE_URL\s*\|\|/);
      expect(source, file).not.toMatch(/connectionString\s*=\s*process\.env\.DATABASE_URL\b/);
      expect(source, file).not.toMatch(/connectionString:\s*process\.env\.DATABASE_URL\b/);
      expect(source, file).not.toMatch(/assertLocalTarget\(\s*process\.env\.DATABASE_URL\b/);
      expect(source, file).not.toMatch(/5432\/manpower_db/);
    }
  });
});
