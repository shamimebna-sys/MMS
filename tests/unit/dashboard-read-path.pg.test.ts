import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool, type Pool as PgPool, type PoolClient, type QueryResult } from "pg";
import type { PrismaClient } from "@/generated/prisma/client";
import type { AccessUser } from "@/lib/auth/permissions";
import type { DashboardData } from "@/server/dashboard";
import { guardPgPool, scopedTestDatabaseUrl, testDatabaseUrl } from "../helpers/pg-test-guard";

/**
 * PostgreSQL integration test.
 * Uses DATABASE_URL_TEST, database mms_test, schema mp022q2_dash only.
 * It does not connect to manpower_db and does not write the public schema.
 */

const SCHEMA = "mp022q2_dash";
const APP_NAME = "mp022q2_dash";
const PROTECTED = ["public", "mp022_capacity", "mp022c_capacity"] as const;
const WRITE = /\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|copy|comment|vacuum|reindex|merge)\b/i;

function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function scopedUrl(raw: string, schema: string): string {
  if ((PROTECTED as readonly string[]).includes(schema)) throw new Error(`Refusing schema ${schema}`);
  return scopedTestDatabaseUrl(raw, schema, `-c statement_timeout=15000 -c application_name=${APP_NAME}`);
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

type DbModule = {
  pool: PgPool;
  prisma: PrismaClient;
  closeDb: () => Promise<void>;
};

type SessionTrace = { queries: string[]; releases: number };

function user(partial: Partial<AccessUser> & Pick<AccessUser, "roleName">): AccessUser {
  return {
    id: 1,
    name: "Tester",
    roleName: partial.roleName,
    permissions: partial.permissions ?? [],
    agentId: partial.agentId ?? null,
    subAgentId: partial.subAgentId ?? null,
    candidateId: partial.candidateId ?? null,
    agencierId: partial.agencierId ?? null,
    companierId: partial.companierId ?? null,
    status: "A",
  };
}

function moneyPairs(data: DashboardData): Array<[string, string]> {
  return data.money.map((row) => [row.type, row.total]);
}

const SEVEN_COUNT_TABLES = [
  ["selection", "selected_candidates"],
  ["labour", "labour_contracts"],
  ["police", "police_clearances"],
  ["medical", "medicals"],
  ["visa", "visa_immigrations"],
  ["manpower", "manpower_trainings"],
  ["flight", "flight_schedules"],
] as const;

function expectSevenTableUnion(sql: string) {
  const childAt = sql.indexOf("child_counts AS");
  const baseAt = sql.indexOf("base_counts AS");
  expect(childAt).toBeGreaterThan(-1);
  expect(baseAt).toBeGreaterThan(childAt);
  const unionBody = sql.slice(childAt, baseAt);
  expect(unionBody.match(/UNION ALL/g)).toHaveLength(SEVEN_COUNT_TABLES.length - 1);
  for (const [kind, table] of SEVEN_COUNT_TABLES) {
    expect(unionBody).toContain(`FROM ${table}`);
    expect(unionBody).toContain(`COUNT(*) FILTER (WHERE kind = '${kind}')`);
  }
  expect(unionBody).toContain("JOIN scoped ON scoped.id = child.candidate_id");
  expect(unionBody).not.toContain("exam_results");
  expect(sql).toContain("(SELECT COUNT(*)::int FROM exam_results t WHERE t.candidate_id IN (SELECT id FROM scoped)) AS exams");
  expect(sql.indexOf("FROM exam_results")).toBeGreaterThan(baseAt);
  expect(sql).toContain("FROM base_counts");
  expect(sql).toContain("CROSS JOIN child_counts");
}

const EMPTY_PIPELINE = {
  registration: 0,
  profileCv: 0,
  grouped: 0,
  selection: 0,
  labour: 0,
  police: 0,
  medical: 0,
  visa: 0,
  manpower: 0,
  flight: 0,
  exams: 0,
};

describe("dashboard metric read path (PostgreSQL integration, isolated mms_test schema)", () => {
  let admin: PgPool;
  let db: DbModule;
  let loadDashboard: (account: AccessUser) => Promise<DashboardData>;
  let fingerprint = "";
  let schemaReady = false;
  let connects = 0;
  let poolQueries = 0;
  const sessions: SessionTrace[] = [];
  const previousUrl = process.env.DATABASE_URL;
  const schema = quoteIdent(SCHEMA);

  beforeAll(async () => {
    const raw = testDatabaseUrl();
    admin = guardPgPool(
      new Pool({ connectionString: raw, max: 2, statement_timeout: 15_000, application_name: "mp022q2_dash_admin" }),
      { allowedSchemas: [SCHEMA] },
    );
    const current = await admin.query<{ db: string }>(`SELECT current_database()::text AS db`);
    if (current.rows[0]?.db !== "mms_test") throw new Error(`Refusing database ${current.rows[0]?.db ?? ""}`);
    fingerprint = await protectedState(admin);
    const located = await admin.query<{ schema: string | null }>(`SELECT current_schema() AS schema`);
    if (located.rows[0]?.schema === SCHEMA) throw new Error("Admin pool is using the dashboard schema.");
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
    schemaReady = true;
    await admin.query(`
      CREATE TABLE ${schema}.roles (id integer PRIMARY KEY, name text NOT NULL);
      CREATE TABLE ${schema}.users (id integer PRIMARY KEY, status text, role_id integer);
      CREATE TABLE ${schema}.agents (id integer PRIMARY KEY, balance integer, deleted_at timestamptz);
      CREATE TABLE ${schema}.sub_agents (id integer PRIMARY KEY, agent_id integer, balance integer, deleted_at timestamptz);
      CREATE TABLE ${schema}.candidates (
        id integer PRIMARY KEY,
        name text,
        passport_no text,
        position text,
        half_photo_file_path text,
        full_photo_file_path text,
        cv_file_path text,
        class_group_id integer,
        agent_id integer,
        sub_agent_id integer,
        agencier_id integer,
        companier_id integer,
        deleted_at timestamptz
      );
      CREATE TABLE ${schema}.selected_candidates (id integer PRIMARY KEY, candidate_id integer, position text);
      CREATE TABLE ${schema}.labour_contracts (id integer PRIMARY KEY, candidate_id integer);
      CREATE TABLE ${schema}.police_clearances (id integer PRIMARY KEY, candidate_id integer);
      CREATE TABLE ${schema}.medicals (id integer PRIMARY KEY, candidate_id integer);
      CREATE TABLE ${schema}.visa_immigrations (id integer PRIMARY KEY, candidate_id integer);
      CREATE TABLE ${schema}.manpower_trainings (id integer PRIMARY KEY, candidate_id integer);
      CREATE TABLE ${schema}.exam_results (id integer PRIMARY KEY, candidate_id integer);
      CREATE TABLE ${schema}.flight_schedules (
        id integer PRIMARY KEY,
        candidate_id integer,
        airlinece_name text,
        flight_date date,
        flight_time text
      );
      CREATE TABLE ${schema}.class_schedules (
        id integer PRIMARY KEY,
        subject text,
        week_day text,
        start_time text,
        end_time text
      );
      CREATE TABLE ${schema}.exams (id integer PRIMARY KEY, name text, exam_date date, exam_time text);
      CREATE TABLE ${schema}.announcements (id integer PRIMARY KEY, topic text, anounce_date date, file_path text);
      CREATE TABLE ${schema}.payments (
        id integer PRIMARY KEY,
        type text,
        amount integer,
        candidate_id integer,
        agent_id integer
      );
    `);
    await admin.query(`
      INSERT INTO ${schema}.roles (id, name) VALUES (1, 'Teacher'), (2, 'Employee');
      INSERT INTO ${schema}.users (id, status, role_id) VALUES
        (1, 'A', 1), (2, 'Active', 1), (3, 'B', 1), (4, 'A', 2), (5, 'B', 2);
      INSERT INTO ${schema}.agents (id, balance, deleted_at) VALUES
        (1, 10, NULL), (2, 25, NULL), (3, 100, NOW());
      INSERT INTO ${schema}.sub_agents (id, agent_id, balance, deleted_at) VALUES
        (10, 1, 7, NULL), (11, 1, 1, NOW()), (12, 2, 3, NULL);
      INSERT INTO ${schema}.candidates (
        id, name, passport_no, position, half_photo_file_path, full_photo_file_path,
        cv_file_path, class_group_id, agent_id, sub_agent_id, agencier_id, companier_id, deleted_at
      ) VALUES
        (1, 'Ada', 'P1', 'Welder', 'ada.jpg', NULL, 'cv.pdf', 1, 1, 10, 4, NULL, NULL),
        (2, 'Bea', NULL, 'Clerk', NULL, NULL, NULL, NULL, 1, NULL, NULL, NULL, NULL),
        (3, 'Cy', NULL, 'Doctor', NULL, NULL, NULL, NULL, 2, 12, NULL, NULL, NULL),
        (4, 'Gone', 'PX', 'Old', 'gone.jpg', NULL, 'gone.pdf', 1, 1, 10, 4, NULL, NOW()),
        (5, 'Dee', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 4, NULL, NULL),
        (6, 'Eve', NULL, 'Pupil', NULL, NULL, 'eve.pdf', 2, NULL, NULL, NULL, NULL, NULL),
        (7, 'Fay', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 8, NULL);
      INSERT INTO ${schema}.selected_candidates (id, candidate_id, position) VALUES
        (200, 1, 'New'), (150, 1, 'Old'), (140, 2, ''), (130, 3, 'Nurse'), (120, 4, 'Gone'), (110, 6, 'Student');
      INSERT INTO ${schema}.labour_contracts (id, candidate_id) VALUES (1, 1);
      INSERT INTO ${schema}.police_clearances (id, candidate_id) VALUES (1, 2);
      INSERT INTO ${schema}.medicals (id, candidate_id) VALUES (1, 1);
      INSERT INTO ${schema}.visa_immigrations (id, candidate_id) VALUES (1, 3);
      INSERT INTO ${schema}.manpower_trainings (id, candidate_id) VALUES (1, 6);
      INSERT INTO ${schema}.exam_results (id, candidate_id) VALUES (1, 1);
      INSERT INTO ${schema}.flight_schedules (id, candidate_id, airlinece_name, flight_date, flight_time) VALUES
        (1, 1, 'Future Air', CURRENT_DATE, '09:00'),
        (2, 1, 'Open Air', NULL, NULL),
        (3, 1, 'Past Air', CURRENT_DATE - 1, '09:00'),
        (4, 3, 'Other Air', CURRENT_DATE, '11:00'),
        (5, 4, 'Gone Air', CURRENT_DATE, '12:00');
      INSERT INTO ${schema}.exams (id, name, exam_date, exam_time) VALUES
        (1, 'Panel', CURRENT_DATE, '10:00'),
        (2, 'Old panel', CURRENT_DATE - 1, '10:00');
      INSERT INTO ${schema}.announcements (id, topic, anounce_date, file_path)
      SELECT g, 'Topic ' || g, DATE '2026-01-01' + g, 'note-' || g FROM generate_series(1, 9) AS g;
      INSERT INTO ${schema}.payments (id, type, amount, candidate_id, agent_id) VALUES
        (1, 'fee', 10, 1, 1),
        (2, 'fee', 5, 3, 2),
        (3, 'bonus', 2, 5, NULL),
        (4, '', 1, 6, NULL),
        (5, 'adjust', 4, 4, 1),
        (6, 'company', 8, 7, NULL);
    `);
    const day = await admin.query<{ day_name: string }>(`SELECT to_char(CURRENT_DATE, 'FMDay') AS day_name`);
    const dayName = day.rows[0]?.day_name ?? "";
    if (!dayName) throw new Error("PostgreSQL did not return the current day name.");
    await admin.query(
      `INSERT INTO ${schema}.class_schedules (id, subject, week_day, start_time, end_time) VALUES ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)`,
      [1, "Morning drill", dayName, "09:00", "10:00", 2, "Wrong day", "Notaday", "08:00", "08:30"],
    );

    const globalDb = globalThis as { pool?: unknown; prisma?: unknown };
    delete globalDb.pool;
    delete globalDb.prisma;
    vi.resetModules();
    process.env.DATABASE_URL = scopedUrl(raw, SCHEMA);
    db = await import("@/lib/db");
    ({ loadDashboard } = await import("@/server/dashboard"));
    const probe = await db.pool.query<{ schema: string | null; db: string; app: string; searchPath: string }>(
      `SELECT current_schema() AS schema,
              current_database()::text AS db,
              current_setting('application_name') AS app,
              current_setting('search_path') AS "searchPath"`,
    );
    const row = probe.rows[0];
    if (row?.db !== "mms_test" || row.schema !== SCHEMA || row.app !== APP_NAME || row.searchPath !== SCHEMA) {
      throw new Error(
        `Refusing app connection ${row?.db ?? ""} schema ${row?.schema ?? ""} search_path ${row?.searchPath ?? ""} app ${row?.app ?? ""}`,
      );
    }
    if (db.pool.options.max !== 10) throw new Error("Dashboard test expected the shared pool max to stay 10.");

    const originalConnect = db.pool.connect.bind(db.pool) as () => Promise<PoolClient>;
    const originalQuery = db.pool.query.bind(db.pool) as (sql: string, params?: unknown[]) => Promise<QueryResult>;
    db.pool.connect = ((callback?: unknown) => {
      connects += 1;
      const checkout = originalConnect().then((client) => {
        const session: SessionTrace = { queries: [], releases: 0 };
        sessions.push(session);
        const originalClientQuery = client.query.bind(client) as (...args: unknown[]) => unknown;
        const originalRelease = client.release.bind(client);
        client.query = ((...args: unknown[]) => {
          const statement = args[0];
          const sql =
            typeof statement === "string"
              ? statement
              : statement !== null &&
                  typeof statement === "object" &&
                  "text" in statement &&
                  typeof statement.text === "string"
                ? statement.text
                : undefined;
          if (sql !== undefined) session.queries.push(sql);
          return originalClientQuery(...args);
        }) as PoolClient["query"];
        client.release = ((error?: Error | boolean) => {
          session.releases += 1;
          originalRelease(error);
        }) as PoolClient["release"];
        return client;
      });
      if (typeof callback !== "function") return checkout;
      const notify = callback as (error: unknown, client?: PoolClient, release?: PoolClient["release"]) => void;
      checkout.then(
        (client) => notify(undefined, client, client.release),
        (error: unknown) => notify(error),
      );
      return undefined;
    }) as PgPool["connect"];
    db.pool.query = (async (sql: string, params?: unknown[]) => {
      poolQueries += 1;
      return originalQuery(sql, params);
    }) as PgPool["query"];
  }, 60_000);

  afterAll(async () => {
    try {
      if (db) await db.closeDb();
    } finally {
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
      if (admin) {
        try {
          if (schemaReady) await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
          if (fingerprint) expect(await protectedState(admin)).toBe(fingerprint);
        } finally {
          await admin.end();
        }
      }
    }
  }, 60_000);

  async function snapshot(): Promise<string> {
    const result = await admin.query<{ snapshot: string }>(`
      SELECT json_build_object(
        'agents', (SELECT count(*) FROM ${schema}.agents),
        'agent_balance', (SELECT COALESCE(sum(balance), 0) FROM ${schema}.agents),
        'sub_agents', (SELECT count(*) FROM ${schema}.sub_agents),
        'sub_balance', (SELECT COALESCE(sum(balance), 0) FROM ${schema}.sub_agents),
        'candidates', (SELECT count(*) FROM ${schema}.candidates),
        'payments', (SELECT count(*) FROM ${schema}.payments),
        'payment_amount', (SELECT COALESCE(sum(amount), 0) FROM ${schema}.payments),
        'selected', (SELECT count(*) FROM ${schema}.selected_candidates),
        'classes', (SELECT count(*) FROM ${schema}.class_schedules),
        'exams', (SELECT count(*) FROM ${schema}.exams),
        'flights', (SELECT count(*) FROM ${schema}.flight_schedules),
        'announcements', (SELECT count(*) FROM ${schema}.announcements),
        'labour', (SELECT count(*) FROM ${schema}.labour_contracts),
        'police', (SELECT count(*) FROM ${schema}.police_clearances),
        'medicals', (SELECT count(*) FROM ${schema}.medicals),
        'visas', (SELECT count(*) FROM ${schema}.visa_immigrations),
        'manpower', (SELECT count(*) FROM ${schema}.manpower_trainings),
        'exam_results', (SELECT count(*) FROM ${schema}.exam_results),
        'users', (SELECT count(*) FROM ${schema}.users),
        'roles', (SELECT count(*) FROM ${schema}.roles)
      )::text AS snapshot
    `);
    return result.rows[0]?.snapshot ?? "";
  }

  async function openTransactions(): Promise<number> {
    const result = await admin.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM pg_stat_activity
       WHERE datname = current_database()
         AND application_name = $1
         AND state LIKE 'idle in transaction%'`,
      [APP_NAME],
    );
    return result.rows[0]?.count ?? 0;
  }

  async function read(account: AccessUser, dataQueries: number): Promise<DashboardData> {
    const connectsBefore = connects;
    const poolQueriesBefore = poolQueries;
    const sessionsBefore = sessions.length;
    expect(db.pool.totalCount - db.pool.idleCount).toBe(0);
    const data = await loadDashboard(account);
    expect(connects).toBe(connectsBefore + 1);
    expect(poolQueries).toBe(poolQueriesBefore);
    expect(sessions).toHaveLength(sessionsBefore + 1);
    const session = sessions.at(-1);
    expect(session?.releases).toBe(1);
    expect(session?.queries[0]).toBe("BEGIN READ ONLY");
    expect(session?.queries.at(-1)).toBe("COMMIT");
    expect(session?.queries).toHaveLength(dataQueries + 2);
    expect(session?.queries.some((sql) => sql === "ROLLBACK")).toBe(false);
    expect(session?.queries.some((sql) => WRITE.test(sql.replace(/'(?:''|[^'])*'/g, "''")))).toBe(false);
    expect(session?.queries.some((sql) => /serializable|repeatable\s+read/i.test(sql))).toBe(false);
    expect(db.pool.waitingCount).toBe(0);
    expect(db.pool.totalCount - db.pool.idleCount).toBe(0);
    expect(db.pool.options.max).toBe(10);
    expect(await openTransactions()).toBe(0);
    return data;
  }

  it("preserves dashboard metrics, visibility, and one checkout per request", async () => {
    const before = await snapshot();
    const full = await read(user({ roleName: "sadmin" }), 8);
    expect(full.pipeline).toEqual({
      registration: 6,
      profileCv: 2,
      grouped: 2,
      selection: 5,
      labour: 1,
      police: 1,
      medical: 1,
      visa: 1,
      manpower: 1,
      flight: 4,
      exams: 1,
    });
    expect(full.pipeline.selection).not.toBe(full.selected.length);
    expect(full.pipeline.flight).not.toBe(full.flights.length);
    expect(full.selected).toEqual([
      { id: 1, name: "Ada", position: "New", passportNo: "P1", photo: "ada.jpg" },
      { id: 2, name: "Bea", position: "Clerk", passportNo: "", photo: "" },
      { id: 3, name: "Cy", position: "Nurse", passportNo: "", photo: "" },
      { id: 6, name: "Eve", position: "Student", passportNo: "", photo: "" },
    ]);
    expect(full.selected.some((banner) => banner.name === "Gone")).toBe(false);
    expect(moneyPairs(full)).toEqual([
      ["", "1"],
      ["adjust", "4"],
      ["bonus", "2"],
      ["company", "8"],
      ["fee", "15"],
    ]);
    expect(full.agentBalance).toBe("35");
    expect(full.totalAgents).toBe(2);
    expect(full.totalCandidates).toBe(full.pipeline.registration);
    expect(full.roster).toEqual({ students: 6, teachers: 2, agents: 2, employees: 1 });
    expect(full.classes.map((row) => row.title)).toEqual(["Morning drill"]);
    expect(full.interviews.map((row) => row.title)).toEqual(["Panel"]);
    expect(full.flights.map((row) => row.title).sort()).toEqual(["Future Air", "Open Air", "Other Air"]);
    expect(full.announcements).toHaveLength(8);
    expect(full.announcements[0]?.topic).toBe("Topic 9");
    expect(full.announcements.some((row) => row.topic === "Topic 1")).toBe(false);
    expect(full.pipeline.profileCv).toBe(2);
    expect(full.pipeline.labour).toBe(1);
    expect(full.pipeline.police).toBe(1);
    expect(full.pipeline.exams).toBe(1);
    const fullScoped = sessions.at(-1)?.queries.find((sql) => sql.includes("WITH scoped AS MATERIALIZED")) ?? "";
    expect(fullScoped.match(/FROM candidates/g)).toEqual(["FROM candidates"]);
    expect(fullScoped).toContain("DISTINCT ON (c.id)");
    expectSevenTableUnion(fullScoped);
    expect(fullScoped).not.toContain("COUNT(DISTINCT");
    const fullBannerAt = fullScoped.indexOf("DISTINCT ON (c.id)");
    const fullFlightAt = fullScoped.indexOf("FROM flight_schedules f");
    expect(fullScoped.slice(fullBannerAt, fullFlightAt)).not.toMatch(/LIMIT/i);
    expect(sessions.at(-1)?.queries.filter((sql) => sql.includes("WITH scoped"))).toHaveLength(1);

    const agent = await read(user({ roleName: "Agent", agentId: 1 }), 7);
    expect(agent.pipeline).toEqual({
      registration: 2,
      profileCv: 1,
      grouped: 1,
      selection: 3,
      labour: 1,
      police: 1,
      medical: 1,
      visa: 0,
      manpower: 0,
      flight: 3,
      exams: 1,
    });
    expect(agent.selected.map((banner) => banner.name)).toEqual(["Ada", "Bea"]);
    expect(agent.pipeline.selection).not.toBe(agent.selected.length);
    expect(moneyPairs(agent)).toEqual([
      ["adjust", "4"],
      ["fee", "10"],
    ]);
    expect(agent.agentBalance).toBe("10");
    expect(agent.totalAgents).toBe(1);
    expect(agent.roster).toBeNull();
    expect(agent.flights.map((row) => row.title).sort()).toEqual(["Future Air", "Open Air"]);
    expect(sessions.at(-1)?.queries.some((sql) => sql.includes("AS teachers"))).toBe(false);
    const agentQueries = sessions.at(-1)?.queries ?? [];
    const agentScoped = agentQueries.find((sql) => sql.includes("WITH scoped AS MATERIALIZED")) ?? "";
    expect(agentScoped.match(/FROM candidates/g)).toEqual(["FROM candidates"]);
    expect(agentScoped).toContain(`"deleted_at" IS NULL AND "agent_id" = $1`);
    const agentMoney = agentQueries.find((sql) => sql.includes("FROM payments")) ?? "";
    expect(agentMoney).toContain("FROM candidates");
    expect(agentMoney).not.toContain("WITH scoped");
    expect(agentQueries.find((sql) => sql.includes("AS balance"))).toBe(
      `SELECT COALESCE(balance, 0)::text AS balance FROM agents WHERE id = $1 AND deleted_at IS NULL`,
    );

    const sub = await read(user({ roleName: "Sub Agent", subAgentId: 10 }), 7);
    expect(sub.pipeline.registration).toBe(1);
    expect(sub.pipeline.selection).toBe(2);
    expect(sub.selected.map((banner) => banner.name)).toEqual(["Ada"]);
    expect(moneyPairs(sub)).toEqual([["fee", "10"]]);
    expect(sub.agentBalance).toBe("7");
    expect(sub.totalAgents).toBe(1);
    expect(sub.roster).toBeNull();
    expect(sessions.at(-1)?.queries.some((sql) => sql === "SELECT 1::int AS count")).toBe(true);

    const missingSub = await read(user({ roleName: "Sub Agent", subAgentId: 999 }), 7);
    expect(missingSub.pipeline.registration).toBe(0);
    expect(missingSub.agentBalance).toBe("0");
    expect(missingSub.totalAgents).toBe(1);
    expect(missingSub.money).toEqual([]);
    expect(missingSub.selected).toEqual([]);

    const agency = await read(user({ roleName: "Agency", agencierId: 4 }), 7);
    expect(agency.pipeline.registration).toBe(2);
    expect(agency.pipeline.selection).toBe(2);
    expect(agency.selected.map((banner) => banner.name)).toEqual(["Ada"]);
    expect(moneyPairs(agency)).toEqual([
      ["bonus", "2"],
      ["fee", "10"],
    ]);
    expect(agency.agentBalance).toBe("35");
    expect(agency.totalAgents).toBe(2);
    expect(agency.roster).toBeNull();
    const agencyBalance = sessions.at(-1)?.queries.find((sql) => sql.includes("AS balance"));
    expect(agencyBalance).toBe(`SELECT COALESCE(SUM(balance), 0)::text AS balance FROM agents WHERE deleted_at IS NULL`);
    expect(agencyBalance).not.toContain("candidate");
    expect(sessions.at(-1)?.queries.find((sql) => sql.includes("WITH scoped AS MATERIALIZED"))).toContain(
      `"agencier_id" = $1`,
    );

    const office = await read(user({ roleName: "Employee", permissions: ["browse_candidates"] }), 7);
    expect(office.pipeline.registration).toBe(0);
    expect(office.pipeline.selection).toBe(0);
    expect(office.selected).toEqual([]);
    expect(office.flights).toEqual([]);
    expect(sessions.at(-1)?.queries.find((sql) => sql.includes("WITH scoped AS MATERIALIZED"))).toContain("WHERE FALSE");
    expect(office.money).toEqual([]);
    expect(office.agentBalance).toBe("35");
    expect(office.totalAgents).toBe(2);
    expect(office.roster).toBeNull();
    expect(office.classes.map((row) => row.title)).toEqual(["Morning drill"]);
    expect(office.interviews.map((row) => row.title)).toEqual(["Panel"]);
    expect(office.announcements).toHaveLength(8);

    const candidate = await read(user({ roleName: "Candidate", candidateId: 6 }), 7);
    expect(candidate.pipeline).toMatchObject({
      registration: 1,
      profileCv: 1,
      grouped: 1,
      selection: 1,
      labour: 0,
      police: 0,
      medical: 0,
      visa: 0,
      manpower: 1,
      flight: 0,
      exams: 0,
    });
    expect(candidate.selected.map((banner) => [banner.id, banner.name, banner.position])).toEqual([[6, "Eve", "Student"]]);
    expect(moneyPairs(candidate)).toEqual([["", "1"]]);
    expect(candidate.agentBalance).toBe("35");
    expect(candidate.totalAgents).toBe(2);
    expect(candidate.roster).toBeNull();

    const company = await read(user({ roleName: "Company", companierId: 8 }), 7);
    expect(company.pipeline.registration).toBe(1);
    expect(company.pipeline.selection).toBe(0);
    expect(moneyPairs(company)).toEqual([["company", "8"]]);
    expect(company.agentBalance).toBe("35");
    expect(company.totalAgents).toBe(2);
    expect(company.selected).toEqual([]);
    expect(company.roster).toBeNull();

    const missingAgent = await read(user({ roleName: "Agent" }), 7);
    expect(missingAgent.agentBalance).toBe("0");
    expect(missingAgent.pipeline.registration).toBe(0);
    expect(missingAgent.money).toEqual([]);
    expect(missingAgent.totalAgents).toBe(2);
    expect(missingAgent.roster).toBeNull();
    expect(sessions.at(-1)?.queries.find((sql) => sql.includes("AS balance"))).toBe(`SELECT 0::text AS balance`);
    expect(sessions.at(-1)?.queries.some((sql) => sql.includes("SUM(balance)"))).toBe(false);

    const subWithAgent = await read(user({ roleName: "Sub Agent", agentId: 1 }), 7);
    expect(subWithAgent.agentBalance).toBe("0");
    expect(subWithAgent.pipeline.registration).toBe(0);
    expect(subWithAgent.money).toEqual([]);
    expect(subWithAgent.totalAgents).toBe(2);
    expect(sessions.at(-1)?.queries.find((sql) => sql.includes("AS balance"))).toBe(`SELECT 0::text AS balance`);
    expect(sessions.at(-1)?.queries.some((sql) => sql.includes("SUM(balance)"))).toBe(false);
    expect(sessions.at(-1)?.queries.some((sql) => sql.includes("FROM agents WHERE id"))).toBe(false);

    const partyLessSub = await read(user({ roleName: "Sub Agent" }), 7);
    expect(partyLessSub.agentBalance).toBe("0");
    expect(partyLessSub.pipeline.registration).toBe(0);
    expect(partyLessSub.money).toEqual([]);
    expect(partyLessSub.totalAgents).toBe(2);
    expect(sessions.at(-1)?.queries.find((sql) => sql.includes("AS balance"))).toBe(`SELECT 0::text AS balance`);
    expect(sessions.at(-1)?.queries.some((sql) => sql.includes("SUM(balance)"))).toBe(false);

    expect(await snapshot()).toBe(before);
    expect(await openTransactions()).toBe(0);
  }, 60_000);

  it("returns every eligible banner past a page limit and still hides duplicates and deleted candidates", async () => {
    const ids = Array.from({ length: 9 }, (_, index) => 101 + index);
    const selectionIds = ids.flatMap((id) => [2000 + id, 3000 + id]).concat(9000);
    const selectionCandidates = ids.flatMap((id) => [id, id]).concat(110);
    const selectionPositions = ids.flatMap((id) => [`Old ${id}`, `Seat ${id}`]).concat("Hidden");
    try {
      await admin.query(
        `INSERT INTO ${schema}.candidates (id, name, passport_no, position, deleted_at)
         SELECT id, 'Banner ' || id::text, 'B' || id::text, 'Trade', NULL
         FROM unnest($1::int[]) AS id
         UNION ALL
         SELECT 110, 'Hidden Banner', 'HX', 'Trade', NOW()`,
        [ids],
      );
      await admin.query(
        `INSERT INTO ${schema}.selected_candidates (id, candidate_id, position)
         SELECT id, candidate_id, position
         FROM unnest($1::int[], $2::int[], $3::text[]) AS row(id, candidate_id, position)`,
        [selectionIds, selectionCandidates, selectionPositions],
      );

      const data = await read(user({ roleName: "sadmin" }), 8);
      expect(data.pipeline.registration).toBe(15);
      expect(data.pipeline.selection).toBe(23);
      expect(data.pipeline.profileCv).toBe(2);
      expect(data.pipeline.labour).toBe(1);
      expect(data.pipeline.police).toBe(1);
      expect(data.pipeline.exams).toBe(1);
      expect(data.selected).toHaveLength(13);
      expect(data.selected.map((banner) => banner.name)).toEqual([
        ...[...ids].reverse().map((id) => `Banner ${id}`),
        "Ada",
        "Bea",
        "Cy",
        "Eve",
      ]);
      expect(data.selected.map((banner) => banner.position)).toEqual([
        ...[...ids].reverse().map((id) => `Seat ${id}`),
        "New",
        "Clerk",
        "Nurse",
        "Student",
      ]);
      expect(data.selected.some((banner) => banner.name === "Hidden Banner" || banner.position.startsWith("Old"))).toBe(false);
      expect(data.pipeline.selection).not.toBe(data.selected.length);
      const scoped = sessions.at(-1)?.queries.find((sql) => sql.includes("WITH scoped AS MATERIALIZED")) ?? "";
      const bannerAt = scoped.indexOf("DISTINCT ON (c.id)");
      const flightAt = scoped.indexOf("FROM flight_schedules f");
      expect(scoped.slice(bannerAt, flightAt)).not.toMatch(/LIMIT/i);
      expect(scoped.match(/FROM candidates/g)).toEqual(["FROM candidates"]);

      const agent = await read(user({ roleName: "Agent", agentId: 1 }), 7);
      expect(agent.pipeline.registration).toBe(2);
      expect(agent.pipeline.selection).toBe(3);
      expect(agent.selected.map((banner) => banner.name)).toEqual(["Ada", "Bea"]);

      const agency = await read(user({ roleName: "Agency", agencierId: 4 }), 7);
      expect(agency.agentBalance).toBe("35");
      expect(agency.totalAgents).toBe(2);
      expect(agency.selected.map((banner) => banner.name)).toEqual(["Ada"]);
      expect(sessions.at(-1)?.queries.find((sql) => sql.includes("AS balance"))).toBe(
        `SELECT COALESCE(SUM(balance), 0)::text AS balance FROM agents WHERE deleted_at IS NULL`,
      );

      const missing = await read(user({ roleName: "Candidate", candidateId: 999 }), 7);
      expect(missing.pipeline.registration).toBe(0);
      expect(missing.pipeline.selection).toBe(0);
      expect(missing.selected).toEqual([]);
      expect(missing.flights).toEqual([]);
      expect(missing.agentBalance).toBe("35");
      expect(missing.money).toEqual([]);
    } finally {
      await admin.query(`DELETE FROM ${schema}.selected_candidates WHERE id = ANY($1::int[])`, [selectionIds]);
      await admin.query(`DELETE FROM ${schema}.candidates WHERE id = ANY($1::int[])`, [[...ids, 110]]);
    }
  }, 60_000);

  it("ignores null and deleted-parent labour rows and still returns every pipeline count", async () => {
    const before = await snapshot();
    try {
      await admin.query(`INSERT INTO ${schema}.labour_contracts (id, candidate_id) VALUES (90, NULL), (91, 4)`);
      const full = await read(user({ roleName: "sadmin" }), 8);
      expect(full.pipeline).toEqual({
        registration: 6,
        profileCv: 2,
        grouped: 2,
        selection: 5,
        labour: 1,
        police: 1,
        medical: 1,
        visa: 1,
        manpower: 1,
        flight: 4,
        exams: 1,
      });
      expect(full.pipeline.selection).not.toBe(full.selected.length);
      expect(full.pipeline.flight).toBeGreaterThan(full.flights.length);
      expect(full.flights.map((row) => row.title).sort()).toEqual(["Future Air", "Open Air", "Other Air"]);
      expect(full.selected.some((banner) => banner.name === "Gone")).toBe(false);
      expect(full.pipeline.profileCv).toBe(2);
      expect(full.pipeline.labour).toBe(1);
      expect(full.pipeline.police).toBe(1);
      expect(full.pipeline.exams).toBe(1);

      const agent = await read(user({ roleName: "Agent", agentId: 1 }), 7);
      expect(agent.pipeline.registration).toBe(2);
      expect(agent.pipeline.labour).toBe(1);
      expect(agent.pipeline.exams).toBe(1);

      const office = await read(user({ roleName: "Employee" }), 7);
      expect(office.pipeline).toEqual(EMPTY_PIPELINE);
      expect(office.selected).toEqual([]);
      expect(office.flights).toEqual([]);
      expect(office.agentBalance).toBe("35");
      expect(office.money).toEqual([]);
      expect(sessions.at(-1)?.queries.find((sql) => sql.includes("WITH scoped AS MATERIALIZED"))).toContain("WHERE FALSE");
    } finally {
      await admin.query(`DELETE FROM ${schema}.labour_contracts WHERE id IN (90, 91)`);
    }
    expect(await snapshot()).toBe(before);
  }, 60_000);

  it("rolls back a failed read-only transaction and releases the only checkout", async () => {
    const before = await snapshot();
    const connectsBefore = connects;
    const sessionsBefore = sessions.length;
    await admin.query(`ALTER TABLE ${schema}.announcements RENAME TO announcements_hidden`);
    try {
      await expect(loadDashboard(user({ roleName: "sadmin" }))).rejects.toMatchObject({ code: "42P01" });
    } finally {
      await admin.query(`ALTER TABLE ${schema}.announcements_hidden RENAME TO announcements`);
    }
    expect(connects).toBe(connectsBefore + 1);
    expect(sessions).toHaveLength(sessionsBefore + 1);
    const session = sessions.at(-1);
    expect(session?.releases).toBe(1);
    expect(session?.queries[0]).toBe("BEGIN READ ONLY");
    expect(session?.queries.at(-1)).toBe("ROLLBACK");
    expect(session?.queries).not.toContain("COMMIT");
    expect(session?.queries.some((sql) => WRITE.test(sql.replace(/'(?:''|[^'])*'/g, "''")))).toBe(false);
    expect(db.pool.totalCount - db.pool.idleCount).toBe(0);
    expect(db.pool.waitingCount).toBe(0);
    const probe = await db.pool.query<{ read_only: string }>(`SELECT current_setting('transaction_read_only') AS read_only`);
    expect(probe.rows[0]?.read_only).toBe("off");
    expect(await openTransactions()).toBe(0);
    expect(await snapshot()).toBe(before);
  }, 60_000);
});
