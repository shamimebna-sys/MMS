import path from "node:path";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { assignmentCloseSql, type HistoricalAssignmentRow, type SplitAddressSource } from "@/lib/historical-party-assignment";
import {
  assignmentActiveLockSql,
  assignmentInsertSql,
  assignmentInsertValues,
  createHistoricalAssignment,
  HistoricalAssignmentWriteError,
  reassignHistoricalAssignment,
  type HistoricalAssignmentCreateDb,
  type HistoricalAssignmentReassignDb,
  type NewActiveAssignment,
  type PartySnapshotSource,
} from "@/lib/historical-party-assignment-write";
import { guardPgPool, guardPool, testDatabaseUrl } from "../helpers/pg-test-guard";

config({ path: path.join(process.cwd(), ".env") });

const SCHEMA = "a05_hist_write";
const migrationSql = readFileSync(
  path.join(process.cwd(), "prisma/migrations/20261109120000_historical_party_assignments/migration.sql"),
  "utf8",
);
const table = `${SCHEMA}.historical_party_assignments`;

function qualify(sql: string): string {
  return sql
    .replaceAll("FUNCTION historical_party_assignments_guard", `FUNCTION ${SCHEMA}.historical_party_assignments_guard`)
    .replaceAll("ON historical_party_assignments", `ON ${table}`)
    .replaceAll("TABLE historical_party_assignments", `TABLE ${table}`);
}

async function databaseReady(): Promise<boolean> {
  let url: string;
  try {
    url = testDatabaseUrl();
  } catch {
    return false;
  }
  const probe = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 2_000 });
  try {
    const result = await probe.query<{ db: string }>("SELECT current_database()::text AS db");
    return result.rows[0]?.db === "mms_test";
  } catch {
    return false;
  } finally {
    await probe.end();
  }
}

const ready = await databaseReady();

describe.skipIf(!ready)("historical assignment reassignment on isolated PostgreSQL", () => {
  let admin: Pool;
  let fingerprint = "";

  beforeAll(async () => {
    const connectionString = testDatabaseUrl();
    admin = guardPgPool(new Pool({ connectionString, max: 4, statement_timeout: 15_000 }), {
      allowedSchemas: [SCHEMA],
    });
    const current = await admin.query<{ db: string }>("SELECT current_database()::text AS db");
    if (current.rows[0]?.db !== "mms_test") throw new Error(`Refusing database ${current.rows[0]?.db ?? ""}`);
    fingerprint = await protectedState(admin);
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.query(qualify(migrationSql));
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    if (fingerprint) expect(await protectedState(admin)).toBe(fingerprint);
    await admin.end();
  });

  it("keeps one ACTIVE row when two reassignments race", async () => {
    await admin.query(
      `INSERT INTO ${table}
        (candidate_id, party_category, party_id, original_name, original_address, status, became_active_at)
       VALUES (11, 'agencier', 3, 'North Agency', NULL, 'ACTIVE', clock_timestamp())`,
    );
    const opened = await admin.query<{ id: number }>(`SELECT id FROM ${table} WHERE status = 'ACTIVE'`);
    const id = opened.rows[0]?.id;
    if (!id) throw new Error("missing active row");

    const other = guardPgPool(new Pool({ connectionString: testDatabaseUrl(), max: 2, statement_timeout: 15_000 }), {
      allowedSchemas: [SCHEMA],
    });
    try {
      const [first, second] = await Promise.all([
        reassignHistoricalAssignment(
          { assignmentId: id, partyId: 8, reason: "Winner", actorId: 2, role: "owner", originalName: "Forged" },
          {
            resolveUser: async () => ({ id: 21, roleName: "sadmin", status: "A" }),
            transaction: (run) => withPgTransaction(admin, run),
          },
        ),
        reassignHistoricalAssignment(
          { assignmentId: id, partyId: 9, reason: "Loser", actorId: 21, role: "sadmin", originalAddress: "Forged" },
          {
            resolveUser: async () => ({ id: 22, roleName: "admin", status: "A" }),
            transaction: (run) => withPgTransaction(other, run),
          },
        ),
      ]);
      expect([first, second].filter((result) => result.ok)).toHaveLength(1);
      expect([first, second].filter((result) => !result.ok && result.code === "conflict")).toHaveLength(1);
    } finally {
      await other.end();
    }

    const stored = await admin.query<{
      status: string;
      party_id: number;
      original_name: string;
      original_address: string | null;
      present_address_house: string | null;
      permanent_address_house: string | null;
      permanent_address_road: string | null;
    }>(
      `SELECT status, party_id, original_name, original_address,
              present_address_house, permanent_address_house, permanent_address_road
       FROM ${table} ORDER BY id`,
    );
    const active = stored.rows.filter((item) => item.status === "ACTIVE");
    const closed = stored.rows.filter((item) => item.status === "CLOSED");
    expect(active).toHaveLength(1);
    expect(closed).toHaveLength(1);
    expect(closed[0]?.original_name).toBe("North Agency");
    expect(closed[0]?.original_address).toBeNull();
    expect(closed[0]?.present_address_house).toBeNull();
    expect(closed[0]?.permanent_address_house).toBeNull();
    expect(active[0]?.present_address_house).toBeNull();
    expect(active[0]?.permanent_address_road).toBeNull();
    expect([8, 9]).toContain(active[0]?.party_id);
    expect(["Eight House", "Nine House"]).toContain(active[0]?.original_name);
    if (active[0]?.party_id === 9) expect(active[0]?.original_address).toBe("  Side road  ");
    if (active[0]?.party_id === 8) expect(active[0]?.original_address).toBe("");
  });

  it("rolls back the closure when the replacement insert fails", async () => {
    const before = await admin.query<{ id: number; status: string; closure_reason: string | null }>(
      `SELECT id, status, closure_reason FROM ${table} ORDER BY id`,
    );
    const active = before.rows.find((item) => item.status === "ACTIVE");
    if (!active) throw new Error("missing active row");
    const client = guardPool(await admin.connect(), { allowedSchemas: [SCHEMA] });
    try {
      await client.query("BEGIN");
      const forced: HistoricalAssignmentReassignDb = {
        ...adapter(client),
        insertActive: async () => {
          await client.query(
            `INSERT INTO ${table}
              (candidate_id, party_category, party_id, original_name, status, became_active_at)
             VALUES (11, 'agencier', 10, '', 'ACTIVE', clock_timestamp())`,
          );
          throw new Error("blank name insert should fail before this line");
        },
      };
      const result = await reassignHistoricalAssignment(
        { assignmentId: active.id, partyId: 8, reason: "Should roll back", actorId: 1, role: "sadmin" },
        {
          resolveUser: async () => ({ id: 21, roleName: "owner", status: "A" }),
          transaction: async (run) => run(forced),
        },
      );
      expect(result).toEqual({ ok: false, code: "conflict" });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    const after = await admin.query<{ id: number; status: string; closure_reason: string | null }>(
      `SELECT id, status, closure_reason FROM ${table} ORDER BY id`,
    );
    expect(after.rows).toEqual(before.rows);
  });

  it("stores agent and sub-agent present and permanent parts separately", async () => {
    const agent = splitParts({
      presentAddressHouse: null,
      presentAddressRoad: "",
      presentAddressVillage: "  Village  ",
      presentAddressPost: "Post",
      presentAddressThanaId: null,
      presentAddressDistrictId: 0,
      presentAddressDivisionId: 4,
      permanentAddressHouse: "",
      permanentAddressRoad: null,
      permanentAddressVillage: "West",
      permanentAddressPost: "  ",
      permanentAddressThanaId: 9,
      permanentAddressDistrictId: null,
      permanentAddressDivisionId: 2,
    });
    const replacement = splitParts({
      presentAddressHouse: "House",
      presentAddressRoad: null,
      presentAddressVillage: "",
      presentAddressPost: null,
      presentAddressThanaId: 3,
      presentAddressDistrictId: null,
      presentAddressDivisionId: null,
      permanentAddressHouse: null,
      permanentAddressRoad: "",
      permanentAddressVillage: null,
      permanentAddressPost: "Lane",
      permanentAddressThanaId: null,
      permanentAddressDistrictId: 8,
      permanentAddressDivisionId: null,
    });
    const parties = new Map<string, PartySnapshotSource>([
      ["agent:31", { name: "  Agent One  ", ...agent }],
      ["agent:32", { name: "Agent Two", ...replacement }],
      ["sub_agent:41", { name: "Sub One", ...agent }],
    ]);
    const created = await createHistoricalAssignment(
      {
        candidateId: 40,
        partyCategory: "agent",
        partyId: 31,
        role: "owner",
        status: "I",
        originalAddress: "Joined",
        presentAddress: { presentAddressHouse: "CLIENT" },
        permanentAddress: { permanentAddressHouse: "CLIENT" },
      },
      {
        resolveUser: async () => ({ id: 21, roleName: "sadmin", status: "A" }),
        transaction: (run) => withPgWrite(admin, run, parties),
      },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.assignment.originalAddress).toBeNull();
    expect(created.assignment.presentAddressRoad).toBe("");
    expect(created.assignment.presentAddressHouse).toBeNull();
    expect(created.assignment.permanentAddressHouse).toBe("");
    expect(created.assignment.presentAddressDistrictId).toBe(0);

    const denied = await createHistoricalAssignment(
      { candidateId: 41, partyCategory: "sub_agent", partyId: 41 },
      {
        resolveUser: async () => ({ id: 21, roleName: "sadmin", status: "I" }),
        transaction: (run) => withPgWrite(admin, run, parties),
      },
    );
    expect(denied).toEqual({ ok: false, code: "forbidden" });

    const blank = await reassignHistoricalAssignment(
      { assignmentId: created.assignment.id, partyId: 32, reason: "   " },
      {
        resolveUser: async () => ({ id: 21, roleName: "admin", status: "A" }),
        transaction: (run) => withPgWrite(admin, run, parties),
      },
    );
    expect(blank).toEqual({ ok: false, code: "invalid_reason" });

    const replaced = await reassignHistoricalAssignment(
      { assignmentId: created.assignment.id, partyId: 32, reason: "  Moved  ", originalAddress: "Forged" },
      {
        resolveUser: async () => ({ id: 22, roleName: "owner", status: "A" }),
        transaction: (run) => withPgWrite(admin, run, parties),
      },
    );
    expect(replaced.ok).toBe(true);
    if (!replaced.ok || !replaced.closed) return;
    expect(replaced.closed.presentAddressVillage).toBe("  Village  ");
    expect(replaced.closed.permanentAddressPost).toBe("  ");
    expect(replaced.closed.originalAddress).toBeNull();
    expect(replaced.closed.closedByUserId).toBe(22);
    expect(replaced.assignment.presentAddressHouse).toBe("House");
    expect(replaced.assignment.permanentAddressRoad).toBe("");
    expect(replaced.assignment.originalAddress).toBeNull();

    const stored = await admin.query<{
      status: string;
      party_id: number;
      original_address: string | null;
      present_address_road: string | null;
      present_address_village: string | null;
      permanent_address_house: string | null;
      permanent_address_post: string | null;
      present_address_district_id: number | null;
    }>(
      `SELECT status, party_id, original_address, present_address_road, present_address_village,
              permanent_address_house, permanent_address_post, present_address_district_id
       FROM ${table}
       WHERE candidate_id = 40 AND party_category = 'agent'
       ORDER BY id`,
    );
    expect(stored.rows).toHaveLength(2);
    expect(stored.rows[0]).toMatchObject({
      status: "CLOSED",
      original_address: null,
      present_address_road: "",
      present_address_village: "  Village  ",
      permanent_address_house: "",
      permanent_address_post: "  ",
      present_address_district_id: 0,
    });
    expect(stored.rows[1]).toMatchObject({
      status: "ACTIVE",
      party_id: 32,
      original_address: null,
      present_address_road: null,
      permanent_address_house: null,
    });

    const sub = await createHistoricalAssignment(
      { candidateId: 40, partyCategory: "sub_agent", partyId: 41 },
      {
        resolveUser: async () => ({ id: 21, roleName: "sadmin", status: "A" }),
        transaction: (run) => withPgWrite(admin, run, parties),
      },
    );
    expect(sub.ok).toBe(true);
    if (!sub.ok) return;
    expect(sub.assignment.originalAddress).toBeNull();
    expect(sub.assignment.presentAddressRoad).toBe("");
    expect(sub.assignment.permanentAddressHouse).toBe("");

    const other = guardPgPool(new Pool({ connectionString: testDatabaseUrl(), max: 2, statement_timeout: 15_000 }), {
      allowedSchemas: [SCHEMA],
    });
    try {
      const [first, second] = await Promise.all([
        reassignHistoricalAssignment(
          { assignmentId: sub.assignment.id, partyId: 41, reason: "Winner" },
          {
            resolveUser: async () => ({ id: 23, roleName: "sadmin", status: "A" }),
            transaction: (run) => withPgWrite(admin, run, parties),
          },
        ),
        reassignHistoricalAssignment(
          { assignmentId: sub.assignment.id, partyId: 41, reason: "Loser" },
          {
            resolveUser: async () => ({ id: 24, roleName: "admin", status: "A" }),
            transaction: (run) => withPgWrite(other, run, parties),
          },
        ),
      ]);
      expect([first, second].filter((result) => result.ok)).toHaveLength(1);
      expect([first, second].filter((result) => !result.ok && result.code === "conflict")).toHaveLength(1);
    } finally {
      await other.end();
    }
    const subRows = await admin.query<{ status: string }>(
      `SELECT status FROM ${table} WHERE candidate_id = 40 AND party_category = 'sub_agent'`,
    );
    expect(subRows.rows.filter((item) => item.status === "ACTIVE")).toHaveLength(1);
    expect(subRows.rows.filter((item) => item.status === "CLOSED")).toHaveLength(1);

    const before = await admin.query<{ id: number; status: string; closure_reason: string | null; present_address_road: string | null }>(
      `SELECT id, status, closure_reason, present_address_road
       FROM ${table} WHERE candidate_id = 40 AND party_category = 'agent' ORDER BY id`,
    );
    const active = before.rows.find((item) => item.status === "ACTIVE");
    if (!active) throw new Error("missing agent row");
    const client = guardPool(await admin.connect(), { allowedSchemas: [SCHEMA] });
    try {
      await client.query("BEGIN");
      const forced: HistoricalAssignmentReassignDb = {
        ...writeAdapter(client, parties),
        insertActive: async () => {
          throw new HistoricalAssignmentWriteError();
        },
      };
      const result = await reassignHistoricalAssignment(
        { assignmentId: active.id, partyId: 31, reason: "Should roll back" },
        {
          resolveUser: async () => ({ id: 21, roleName: "owner", status: "A" }),
          transaction: async (run) => run(forced),
        },
      );
      expect(result).toEqual({ ok: false, code: "conflict" });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    const after = await admin.query<{ id: number; status: string; closure_reason: string | null; present_address_road: string | null }>(
      `SELECT id, status, closure_reason, present_address_road
       FROM ${table} WHERE candidate_id = 40 AND party_category = 'agent' ORDER BY id`,
    );
    expect(after.rows).toEqual(before.rows);
  });
});

type SqlRunner = {
  query: Pool["query"];
};

async function withPgTransaction<T>(pool: Pool, run: (db: HistoricalAssignmentReassignDb) => Promise<T>): Promise<T> {
  const client = guardPool(await pool.connect(), { allowedSchemas: [SCHEMA] });
  try {
    await client.query("BEGIN");
    const result = await run(adapter(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function adapter(runner: SqlRunner): HistoricalAssignmentReassignDb {
  const statements = assignmentCloseSql(table);
  const parties = new Map<number, { name: string; address: string | null }>([
    [8, { name: "Eight House", address: "" }],
    [9, { name: "Nine House", address: "  Side road  " }],
  ]);
  return {
    lockAssignment: async (id) => {
      const result = await runner.query(statements.lock, [id]);
      return result.rows[0] ? mapRow(result.rows[0] as Record<string, unknown>) : null;
    },
    candidateExists: async (id) => id === 11,
    readParty: async (category, partyId) => (category === "agencier" ? (parties.get(partyId) ?? null) : null),
    closeActive: async (id, reason, closedByUserId) => {
      const result = await runner.query(statements.close, [reason, closedByUserId, id]);
      return result.rows[0] ? mapRow(result.rows[0] as Record<string, unknown>) : null;
    },
    insertActive: async (input: NewActiveAssignment) => insertActive(runner, input),
  };
}

function mapRow(record: Record<string, unknown>): HistoricalAssignmentRow {
  return {
    id: Number(record.id),
    candidateId: Number(record.candidateId),
    partyCategory: record.partyCategory as HistoricalAssignmentRow["partyCategory"],
    partyId: Number(record.partyId),
    originalName: String(record.originalName),
    originalAddress: nullableText(record.originalAddress),
    presentAddressHouse: nullableText(record.presentAddressHouse),
    presentAddressRoad: nullableText(record.presentAddressRoad),
    presentAddressVillage: nullableText(record.presentAddressVillage),
    presentAddressPost: nullableText(record.presentAddressPost),
    presentAddressThanaId: nullableInt(record.presentAddressThanaId),
    presentAddressDistrictId: nullableInt(record.presentAddressDistrictId),
    presentAddressDivisionId: nullableInt(record.presentAddressDivisionId),
    permanentAddressHouse: nullableText(record.permanentAddressHouse),
    permanentAddressRoad: nullableText(record.permanentAddressRoad),
    permanentAddressVillage: nullableText(record.permanentAddressVillage),
    permanentAddressPost: nullableText(record.permanentAddressPost),
    permanentAddressThanaId: nullableInt(record.permanentAddressThanaId),
    permanentAddressDistrictId: nullableInt(record.permanentAddressDistrictId),
    permanentAddressDivisionId: nullableInt(record.permanentAddressDivisionId),
    status: record.status as HistoricalAssignmentRow["status"],
    becameActiveAt: record.becameActiveAt instanceof Date ? record.becameActiveAt : new Date(String(record.becameActiveAt)),
    closureReason: record.closureReason == null ? null : String(record.closureReason),
    closedByUserId: record.closedByUserId == null ? null : Number(record.closedByUserId),
    closedAt:
      record.closedAt == null ? null : record.closedAt instanceof Date ? record.closedAt : new Date(String(record.closedAt)),
  };
}

async function withPgWrite<T>(
  pool: Pool,
  run: (db: HistoricalAssignmentCreateDb & HistoricalAssignmentReassignDb) => Promise<T>,
  parties: Map<string, PartySnapshotSource>,
): Promise<T> {
  const client = guardPool(await pool.connect(), { allowedSchemas: [SCHEMA] });
  try {
    await client.query("BEGIN");
    const result = await run(writeAdapter(client, parties));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function writeAdapter(
  runner: SqlRunner,
  parties: Map<string, PartySnapshotSource>,
): HistoricalAssignmentCreateDb & HistoricalAssignmentReassignDb {
  const statements = assignmentCloseSql(table);
  const lockSql = assignmentActiveLockSql(table);
  return {
    candidateExists: async (id) => id === 11 || id === 40 || id === 41,
    readParty: async (category, partyId) => parties.get(`${category}:${partyId}`) ?? null,
    lockAssignment: async (id) => {
      const result = await runner.query(statements.lock, [id]);
      return result.rows[0] ? mapRow(result.rows[0] as Record<string, unknown>) : null;
    },
    lockActive: async (candidateId, category) => {
      const result = await runner.query(lockSql, [candidateId, category]);
      return result.rows[0] ? mapRow(result.rows[0] as Record<string, unknown>) : null;
    },
    closeActive: async (id, reason, closedByUserId) => {
      const result = await runner.query(statements.close, [reason, closedByUserId, id]);
      return result.rows[0] ? mapRow(result.rows[0] as Record<string, unknown>) : null;
    },
    insertActive: (input) => insertActive(runner, input),
  };
}

async function insertActive(runner: SqlRunner, input: NewActiveAssignment): Promise<HistoricalAssignmentRow> {
  const result = await runner.query(assignmentInsertSql(table), assignmentInsertValues(input));
  const inserted = result.rows[0];
  if (!inserted) throw new Error("insert returned no row");
  return mapRow(inserted as Record<string, unknown>);
}

function splitParts(source: SplitAddressSource): SplitAddressSource {
  return source;
}

function nullableText(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}

function nullableInt(value: unknown): number | null {
  if (value == null) return null;
  return Number(value);
}

async function protectedState(pool: Pool): Promise<string> {
  const result = await pool.query(`
    SELECT current_database()::text AS db,
           to_regclass('public.agencies')::text AS agencies,
           to_regclass('public.companies')::text AS companies,
           CASE WHEN to_regclass('public.agencies') IS NULL THEN NULL
                ELSE (SELECT count(*)::text FROM public.agencies) END AS agency_rows,
           CASE WHEN to_regclass('public.companies') IS NULL THEN NULL
                ELSE (SELECT count(*)::text FROM public.companies) END AS company_rows
  `);
  return JSON.stringify(result.rows[0]);
}
