import path from "node:path";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import {
  assignmentCloseSql,
  closeHistoricalAssignment,
  type HistoricalAssignmentRow,
} from "@/lib/historical-party-assignment";
import { guardPgPool, guardPool, testDatabaseUrl } from "../helpers/pg-test-guard";

config({ path: path.join(process.cwd(), ".env") });

const SCHEMA = "a05_hist_assign";
const migrationSql = readFileSync(
  path.join(process.cwd(), "prisma/migrations/20261109120000_historical_party_assignments/migration.sql"),
  "utf8",
);

function qualify(sql: string): string {
  return sql
    .replaceAll(
      "FUNCTION historical_party_assignments_guard",
      `FUNCTION ${SCHEMA}.historical_party_assignments_guard`,
    )
    .replaceAll("ON historical_party_assignments", `ON ${SCHEMA}.historical_party_assignments`)
    .replaceAll("TABLE historical_party_assignments", `TABLE ${SCHEMA}.historical_party_assignments`);
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

describe.skipIf(!ready)("historical assignments on isolated PostgreSQL", () => {
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

  it("rejects direct closure gaps, deletion, snapshot edits, and a second ACTIVE row", async () => {
    const opened = await admin.query<{ id: number; became_active_at: Date; original_address: string | null }>(
      `INSERT INTO ${SCHEMA}.historical_party_assignments
        (candidate_id, party_category, party_id, original_name, original_address, status, became_active_at)
       VALUES (1, 'agencier', 2, 'North Agency', NULL, 'ACTIVE', '2001-01-01T00:00:00Z')
       RETURNING id, became_active_at, original_address`,
    );
    const id = opened.rows[0]?.id;
    expect(id).toBeTruthy();
    expect(opened.rows[0]?.original_address).toBeNull();
    expect(opened.rows[0]?.became_active_at.toISOString()).not.toBe("2001-01-01T00:00:00.000Z");

    await expect(
      admin.query(
        `INSERT INTO ${SCHEMA}.historical_party_assignments
          (candidate_id, party_category, party_id, original_name, status, became_active_at)
         VALUES (1, 'agencier', 9, 'Other Agency', 'ACTIVE', clock_timestamp())`,
      ),
    ).rejects.toThrow(/historical_party_assignments_one_active|duplicate key/i);

    await admin.query(
      `INSERT INTO ${SCHEMA}.historical_party_assignments
        (candidate_id, party_category, party_id, original_name, status, became_active_at,
         present_address_house, permanent_address_house)
       VALUES (1, 'agent', 4, 'Agent One', 'ACTIVE', clock_timestamp(), '', NULL)`,
    );
    const agent = await admin.query<{
      present_address_house: string | null;
      permanent_address_house: string | null;
      original_address: string | null;
    }>(
      `SELECT present_address_house, permanent_address_house, original_address
       FROM ${SCHEMA}.historical_party_assignments
       WHERE party_category = 'agent'`,
    );
    expect(agent.rows[0]).toEqual({
      present_address_house: "",
      permanent_address_house: null,
      original_address: null,
    });

    await expect(
      admin.query(`DELETE FROM ${SCHEMA}.historical_party_assignments WHERE id = $1`, [id]),
    ).rejects.toThrow(/cannot be physically deleted/i);

    await expect(
      admin.query(`UPDATE ${SCHEMA}.historical_party_assignments SET original_name = 'Changed' WHERE id = $1`, [id]),
    ).rejects.toThrow(/snapshots cannot be changed/i);

    await expect(
      admin.query(
        `UPDATE ${SCHEMA}.historical_party_assignments SET became_active_at = clock_timestamp() WHERE id = $1`,
        [id],
      ),
    ).rejects.toThrow(/snapshots cannot be changed/i);

    await expect(
      admin.query(
        `INSERT INTO ${SCHEMA}.historical_party_assignments
          (candidate_id, party_category, party_id, original_name, status, became_active_at, closed_by_user_id, closed_at)
         VALUES (8, 'companier', 1, 'Company', 'CLOSED', clock_timestamp(), 4, clock_timestamp())`,
      ),
    ).rejects.toThrow(/non-empty closure reason/i);

    const closedInsert = await admin.query<{ closed_at: Date }>(
      `INSERT INTO ${SCHEMA}.historical_party_assignments
        (candidate_id, party_category, party_id, original_name, status, became_active_at,
         closure_reason, closed_by_user_id, closed_at)
       VALUES (8, 'companier', 1, 'Company', 'CLOSED', clock_timestamp(), '  Kept  ', 4, '1999-01-01T00:00:00Z')
       RETURNING closed_at`,
    );
    expect(closedInsert.rows[0]?.closed_at.toISOString()).not.toBe("1999-01-01T00:00:00.000Z");
    const storedReason = await admin.query<{ closure_reason: string }>(
      `SELECT closure_reason FROM ${SCHEMA}.historical_party_assignments WHERE candidate_id = 8`,
    );
    expect(storedReason.rows[0]?.closure_reason).toBe("Kept");

    const first = await closeHistoricalAssignment(
      { assignmentId: id, reason: "  Explicit close  ", actorId: 1, role: "admin" },
      {
        resolveUser: async () => ({ id: 21, roleName: "owner" }),
        transaction: (run) => withPgTransaction(admin, run),
      },
    );
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.assignment.closedByUserId).toBe(21);
      expect(first.assignment.closureReason).toBe("Explicit close");
      expect(first.assignment.originalName).toBe("North Agency");
      expect(first.assignment.becameActiveAt.toISOString()).not.toBe("2001-01-01T00:00:00.000Z");
      expect(first.assignment.closedAt?.toISOString()).not.toBe("1999-01-01T00:00:00.000Z");
    }

    await expect(
      admin.query(
        `UPDATE ${SCHEMA}.historical_party_assignments
         SET status = 'ACTIVE', closure_reason = NULL, closed_by_user_id = NULL, closed_at = NULL
         WHERE id = $1`,
        [id],
      ),
    ).rejects.toThrow(/cannot be reopened/i);

    await expect(
      admin.query(`UPDATE ${SCHEMA}.historical_party_assignments SET closure_reason = 'Rewritten' WHERE id = $1`, [id]),
    ).rejects.toThrow(/closure facts cannot be rewritten/i);

    const preserved = await admin.query<{ closure_reason: string; closed_by_user_id: number }>(
      `SELECT closure_reason, closed_by_user_id FROM ${SCHEMA}.historical_party_assignments WHERE id = $1`,
      [id],
    );
    expect(preserved.rows[0]).toEqual({ closure_reason: "Explicit close", closed_by_user_id: 21 });
  });

  it("does not let a second close overwrite the first", async () => {
    const opened = await admin.query<{ id: number }>(
      `INSERT INTO ${SCHEMA}.historical_party_assignments
        (candidate_id, party_category, party_id, original_name, status, became_active_at)
       VALUES (30, 'sub_agent', 6, 'Sub Agent', 'ACTIVE', clock_timestamp())
       RETURNING id`,
    );
    const id = opened.rows[0]?.id ?? 0;
    const other = guardPgPool(new Pool({ connectionString: testDatabaseUrl(), max: 1, statement_timeout: 15_000 }), {
      allowedSchemas: [SCHEMA],
    });
    try {
      const [first, second] = await Promise.all([
        closeHistoricalAssignment(
          { assignmentId: id, reason: "Winner", actorId: 2, role: "sadmin" },
          { resolveUser: async () => ({ id: 21, roleName: "sadmin" }), transaction: (run) => withPgTransaction(admin, run) },
        ),
        closeHistoricalAssignment(
          { assignmentId: id, reason: "Loser", actorId: 21, role: "owner" },
          { resolveUser: async () => ({ id: 22, roleName: "admin" }), transaction: (run) => withPgTransaction(other, run) },
        ),
      ]);
      expect([first, second].filter((result) => result.ok)).toHaveLength(1);
      expect([first, second].filter((result) => !result.ok && result.code === "conflict")).toHaveLength(1);
    } finally {
      await other.end();
    }
    const stored = await admin.query<{ closure_reason: string; status: string }>(
      `SELECT closure_reason, status FROM ${SCHEMA}.historical_party_assignments WHERE id = $1`,
      [id],
    );
    expect(stored.rows[0]?.status).toBe("CLOSED");
    expect(["Winner", "Loser"]).toContain(stored.rows[0]?.closure_reason);
  });
});

type SqlRunner = {
  query: Pool["query"];
  release?: () => void;
};

async function withPgTransaction<T>(pool: Pool, run: (db: ReturnType<typeof adapter>) => Promise<T>): Promise<T> {
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

function adapter(runner: SqlRunner) {
  const statements = assignmentCloseSql(`${SCHEMA}.historical_party_assignments`);
  return {
    lock: async (id: number) => {
      const result = await runner.query(statements.lock, [id]);
      return result.rows[0] ? mapRow(result.rows[0] as Record<string, unknown>) : null;
    },
    closeActive: async (id: number, reason: string, closedByUserId: number) => {
      const result = await runner.query(statements.close, [reason, closedByUserId, id]);
      return result.rows[0] ? mapRow(result.rows[0] as Record<string, unknown>) : null;
    },
  };
}

function mapRow(row: Record<string, unknown>): HistoricalAssignmentRow {
  return {
    id: Number(row.id),
    candidateId: Number(row.candidateId),
    partyCategory: row.partyCategory as HistoricalAssignmentRow["partyCategory"],
    partyId: Number(row.partyId),
    originalName: String(row.originalName),
    originalAddress: textOrNull(row.originalAddress),
    presentAddressHouse: textOrNull(row.presentAddressHouse),
    presentAddressRoad: textOrNull(row.presentAddressRoad),
    presentAddressVillage: textOrNull(row.presentAddressVillage),
    presentAddressPost: textOrNull(row.presentAddressPost),
    presentAddressThanaId: intOrNull(row.presentAddressThanaId),
    presentAddressDistrictId: intOrNull(row.presentAddressDistrictId),
    presentAddressDivisionId: intOrNull(row.presentAddressDivisionId),
    permanentAddressHouse: textOrNull(row.permanentAddressHouse),
    permanentAddressRoad: textOrNull(row.permanentAddressRoad),
    permanentAddressVillage: textOrNull(row.permanentAddressVillage),
    permanentAddressPost: textOrNull(row.permanentAddressPost),
    permanentAddressThanaId: intOrNull(row.permanentAddressThanaId),
    permanentAddressDistrictId: intOrNull(row.permanentAddressDistrictId),
    permanentAddressDivisionId: intOrNull(row.permanentAddressDivisionId),
    status: row.status as HistoricalAssignmentRow["status"],
    becameActiveAt: asDate(row.becameActiveAt),
    closureReason: textOrNull(row.closureReason),
    closedByUserId: intOrNull(row.closedByUserId),
    closedAt: row.closedAt == null ? null : asDate(row.closedAt),
  };
}

function asDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function textOrNull(value: unknown): string | null {
  return value == null ? null : String(value);
}

function intOrNull(value: unknown): number | null {
  return value == null ? null : Number(value);
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
