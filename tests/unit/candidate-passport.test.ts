import path from "node:path";
import { config } from "dotenv";
import pg from "pg";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessUser } from "@/lib/auth/permissions";
import type { SqlClient } from "@/lib/payment-ledger";
import { guardPool, scopedTestDatabaseUrl, testDatabaseUrl } from "../helpers/pg-test-guard";

config({ path: path.join(process.cwd(), ".env") });

const query = vi.hoisted(() => vi.fn());
const candidateCreate = vi.hoisted(() => vi.fn(async () => ({ id: 50 })));
const queryRaw = vi.hoisted(() => vi.fn(async (_sql: string, ..._params: unknown[]) => [] as Record<string, unknown>[]));
const transaction = vi.hoisted(() =>
  vi.fn(async (work: (tx: { $queryRawUnsafe: typeof queryRaw; candidate: { create: typeof candidateCreate } }) => Promise<{ id: number }>) =>
    work({ $queryRawUnsafe: queryRaw, candidate: { create: candidateCreate } }),
  ),
);

vi.mock("@/lib/db", () => ({
  pool: { query },
  prisma: {
    $transaction: transaction,
    candidate: { create: candidateCreate },
  },
}));

vi.mock("@/server/audit", () => ({
  writeAudit: vi.fn(async () => undefined),
}));

vi.mock("@/server/payment-ledger", () => ({
  withPgTransaction: async (work: (db: SqlClient) => Promise<number>) => work({ query }),
  readPaymentFacts: vi.fn(),
  syncPaymentChange: vi.fn(),
}));

import {
  assertPassportAvailable,
  assignedPassportKey,
  DUPLICATE_PASSPORT_MESSAGE,
  normalizePassportNo,
  passportGuardSql,
  retainPassportHistory,
} from "@/lib/candidate-passport";
import type { CandidateInput } from "@/features/candidates/schema";
import { createCandidateRecord } from "@/server/mutations";
import { saveBreadRecord } from "@/server/bread-form";

const admin: AccessUser = {
  id: 1,
  name: "Admin",
  roleName: "admin",
  permissions: [],
  agentId: null,
  subAgentId: null,
  candidateId: null,
  agencierId: null,
  companierId: null,
  status: "A",
};

const TABLE = "mp020_passport_guard";
const HISTORY = "mp020_passport_history";

function compact(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

describe("passport normalization", () => {
  it("trims the edges and keeps internal spaces and letter case", () => {
    expect(normalizePassportNo("  A12074719  ")).toBe("A12074719");
    expect(normalizePassportNo(" A 12074719 ")).toBe("A 12074719");
    expect(normalizePassportNo("abC")).toBe("abC");
    expect(normalizePassportNo("   ")).toBeNull();
    expect(normalizePassportNo(null)).toBeNull();
    expect(normalizePassportNo(12)).toBeNull();
    expect(assignedPassportKey([{ column: "name", value: "A" }, { column: "passport_no", value: "  EK1 " }])).toBe("EK1");
    expect(assignedPassportKey([{ column: "name", value: "A" }])).toBeNull();
  });

  it("compares the trimmed text only and keeps history on the same candidate", () => {
    const sql = passportGuardSql();
    expect(sql.conflict).toContain("btrim(passport_no) = btrim($1::text)");
    expect(sql.conflict).toContain("id IS DISTINCT FROM $2::int");
    expect(sql.historyConflict).toContain("candidate_id IS DISTINCT FROM $2::int");
    expect(sql.lock).toContain("pg_advisory_xact_lock");
    expect(sql.archive).toContain("passport_issue_date");
    expect(sql.archive).toContain("passport_expire_date");
    expect(sql.archive).toContain("passport_file_path");
    expect(`${sql.conflict} ${sql.historyConflict}`).not.toMatch(/deleted_at|replaced_by_candidate|status/i);
  });
});

describe("candidate passport saves", () => {
  let storedPassport: string | null;
  let conflict: boolean;
  let historyConflict: boolean;

  beforeEach(() => {
    storedPassport = "EK1";
    conflict = false;
    historyConflict = false;
    query.mockReset();
    queryRaw.mockReset();
    candidateCreate.mockClear();
    transaction.mockClear();
    query.mockImplementation(async (sql: unknown, params?: unknown[]) => {
      const statement = compact(String(sql));
      const bound = params ?? [];
      if (statement.includes("FROM data_types")) {
        return { rows: [{ id: 1, slug: "candidates", name: "candidates", display_name_singular: "Candidate" }], rowCount: 1 };
      }
      if (statement.includes("FROM data_rows")) {
        return {
          rows: [
            { field: "name", type: "text", display_name: "Name", required: 1, details: null },
            { field: "passport_no", type: "text", display_name: "Passport No", required: 0, details: null },
          ],
          rowCount: 2,
        };
      }
      if (statement.includes("information_schema.columns")) {
        const requested = Array.isArray(bound[0]) ? bound[0].map(String) : [String(bound[0] ?? "")];
        const columns = [
          ["id", "integer"],
          ["name", "character varying"],
          ["passport_no", "character varying"],
          ["updated_at", "timestamp with time zone"],
          ["created_at", "timestamp with time zone"],
        ];
        const rows = requested.flatMap((table_name) => columns.map(([column_name, data_type]) => ({ table_name, column_name, data_type })));
        return { rows, rowCount: rows.length };
      }
      if (statement.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              passport_no: storedPassport,
              passport_issue_date: "2020-02-02",
              passport_expire_date: "2030-03-03",
              passport_file_path: "old-passport.pdf",
            },
          ],
          rowCount: 1,
        };
      }
      if (statement.includes("pg_advisory_xact_lock")) return { rows: [{ locked: "1" }], rowCount: 1 };
      if (statement.includes("IS DISTINCT FROM")) {
        const historical = statement.includes("candidate_passports");
        const hit = historical ? historyConflict : conflict;
        return { rows: hit ? [{ id: historical ? 8 : 4 }] : [], rowCount: hit ? 1 : 0 };
      }
      if (/^(update|insert)\b/i.test(statement)) {
        return { rows: statement.includes("RETURNING") ? [{ id: 41 }] : [], rowCount: 1 };
      }
      if (statement.includes('FROM "candidates"')) {
        return { rows: [{ id: "9", name: "Amina", passport_no: "EK1" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    queryRaw.mockImplementation(async (sql: unknown) => {
      const statement = compact(String(sql));
      if (statement.includes("pg_advisory_xact_lock")) return [{ locked: "1" }];
      if (statement.includes("IS DISTINCT FROM")) return conflict ? [{ id: 4 }] : [];
      return [];
    });
  });

  function writes(): string[] {
    return query.mock.calls.map((call) => compact(String(call[0]))).filter((sql) => /^(update|insert)\b/i.test(sql));
  }

  it("rejects a second candidate with the same trimmed passport and does not insert", async () => {
    conflict = true;
    await expect(saveBreadRecord(admin, "candidates", null, { name: "Second", passport_no: "  EK1  " }, null)).rejects.toThrow(DUPLICATE_PASSPORT_MESSAGE);
    expect(writes()).toEqual([]);
    const conflictCall = query.mock.calls.find((call) => compact(String(call[0])).includes("IS DISTINCT FROM"));
    expect(conflictCall?.[1]).toEqual(["EK1", null]);
  });

  it("stores a passport that differs by an internal space or by letter case", async () => {
    const spaced = await saveBreadRecord(admin, "candidates", null, { name: "Spaced", passport_no: "A 12074719" }, null);
    const cased = await saveBreadRecord(admin, "candidates", null, { name: "Cased", passport_no: "ek1" }, null);
    expect(spaced).toBe(41);
    expect(cased).toBe(41);
    expect(writes().some((sql) => sql.startsWith('INSERT INTO "candidates"'))).toBe(true);
    const params = query.mock.calls.filter((call) => compact(String(call[0])).startsWith("INSERT")).map((call) => call[1]);
    expect(params.some((bound) => (bound as unknown[]).includes("A 12074719"))).toBe(true);
    expect(params.some((bound) => (bound as unknown[]).includes("ek1"))).toBe(true);
  });

  it("allows an empty passport and does not lock", async () => {
    await saveBreadRecord(admin, "candidates", null, { name: "No Passport", passport_no: "   " }, null);
    expect(query.mock.calls.some((call) => String(call[0]).includes("pg_advisory_xact_lock"))).toBe(false);
    expect(writes().some((sql) => sql.startsWith('INSERT INTO "candidates"'))).toBe(true);
  });

  it("allows an update that keeps a passport already shared with another candidate", async () => {
    conflict = true;
    historyConflict = true;
    const saved = await saveBreadRecord(admin, "candidates", 9, { name: "Amina", passport_no: "EK1" }, null);
    expect(saved).toBe(9);
    expect(query.mock.calls.some((call) => compact(String(call[0])).includes("IS DISTINCT FROM"))).toBe(false);
    expect(writes().some((sql) => sql.includes("candidate_passports"))).toBe(false);
    expect(writes().some((sql) => sql.startsWith('UPDATE "candidates"'))).toBe(true);
  });

  it("archives the previous passport and saves the new number as current", async () => {
    const saved = await saveBreadRecord(admin, "candidates", 9, { name: "Amina", passport_no: "NEW9" }, null);
    expect(saved).toBe(9);
    const history = query.mock.calls.find((call) => compact(String(call[0])).includes("INSERT INTO candidate_passports"));
    expect(history?.[1]).toEqual([9, "EK1", "2020-02-02", "2030-03-03", "old-passport.pdf"]);
    const update = query.mock.calls.find((call) => compact(String(call[0])).startsWith('UPDATE "candidates"'));
    expect(update?.[1]).toContain("NEW9");
    const historyAt = query.mock.calls.findIndex((call) => compact(String(call[0])).includes("INSERT INTO candidate_passports"));
    const updateAt = query.mock.calls.findIndex((call) => compact(String(call[0])).startsWith('UPDATE "candidates"'));
    expect(historyAt).toBeGreaterThan(-1);
    expect(updateAt).toBeGreaterThan(historyAt);
  });

  it("rejects a new number that another candidate holds only as history", async () => {
    historyConflict = true;
    await expect(saveBreadRecord(admin, "candidates", 9, { name: "Amina", passport_no: "OLD9" }, null)).rejects.toThrow(DUPLICATE_PASSPORT_MESSAGE);
    expect(writes()).toEqual([]);
  });

  it("rejects an update that moves a candidate onto another candidate's passport", async () => {
    conflict = true;
    await expect(saveBreadRecord(admin, "candidates", 9, { name: "Amina", passport_no: "OTHER1" }, null)).rejects.toThrow(DUPLICATE_PASSPORT_MESSAGE);
    expect(writes()).toEqual([]);
    const conflictCall = query.mock.calls.find((call) => compact(String(call[0])).includes("IS DISTINCT FROM"));
    expect(conflictCall?.[1]).toEqual(["OTHER1", 9]);
  });

  function candidateInput(passportNo: string): CandidateInput {
    return {
      name: "Second",
      code: "",
      mobile: "",
      email: "",
      passportNo,
      gender: "",
      agentId: null,
      position: "",
      status: "A",
    } as unknown as CandidateInput;
  }

  it("rejects a direct create when the passport is already stored", async () => {
    conflict = true;
    await expect(createCandidateRecord(admin, candidateInput("  EK1 "), null)).rejects.toThrow(DUPLICATE_PASSPORT_MESSAGE);
    expect(candidateCreate).not.toHaveBeenCalled();
    const conflictCall = queryRaw.mock.calls.find((call) => compact(String(call[0])).includes("IS DISTINCT FROM"));
    expect(conflictCall?.[1]).toBe("EK1");
  });

  it("creates a candidate when the passport is free", async () => {
    const id = await createCandidateRecord(admin, candidateInput("NEW9"), null);
    expect(id).toBe(50);
    expect(transaction).toHaveBeenCalledOnce();
    expect(candidateCreate).toHaveBeenCalledOnce();
    expect(queryRaw.mock.calls.some((call) => compact(String(call[0])).includes("pg_advisory_xact_lock"))).toBe(true);
  });

  it("creates a candidate when the passport is empty without taking the lock", async () => {
    const id = await createCandidateRecord(admin, candidateInput("  "), null);
    expect(id).toBe(50);
    expect(transaction).not.toHaveBeenCalled();
    expect(candidateCreate).toHaveBeenCalledOnce();
  });
});

describe("passport guard against stored rows", () => {
  const SCHEMA = "mp020_passport_it";
  const passportSql = {
    allowedSchemas: [SCHEMA],
    allowedUnqualifiedRelations: [TABLE, HISTORY],
  };
  let connectionString = "";
  let client: pg.Client | undefined;
  function pgClient(): pg.Client {
    if (!client) throw new Error("PostgreSQL test client is not open.");
    return client;
  }
  const db: SqlClient = {
    query: async (sql, params) => {
      const result = await pgClient().query(sql, params);
      return { rows: result.rows, rowCount: result.rowCount };
    },
  };

  beforeAll(async () => {
    connectionString = scopedTestDatabaseUrl(testDatabaseUrl(), SCHEMA);
    client = guardPool(new pg.Client({ connectionString }), passportSql);
    await pgClient().connect();
    const opened = await pgClient().query<{ db: string }>(`SELECT current_database()::text AS db`);
    if (opened.rows[0]?.db !== "mms_test") {
      throw new Error(`Refusing passport fixture database ${opened.rows[0]?.db ?? ""}`);
    }
    await pgClient().query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await pgClient().query(`CREATE SCHEMA ${SCHEMA}`);
    await pgClient().query(`SET search_path TO ${SCHEMA}`);
    const located = await pgClient().query<{ schema: string | null }>(`SELECT current_schema() AS schema`);
    if (located.rows[0]?.schema !== SCHEMA) {
      throw new Error(`Refusing passport fixture schema ${located.rows[0]?.schema ?? ""}`);
    }
    await pgClient().query(`
      CREATE TABLE ${SCHEMA}.${TABLE} (
        id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        name varchar(100),
        passport_no varchar(250),
        passport_issue_date date,
        passport_expire_date date,
        passport_file_path text,
        deleted_at timestamptz,
        replaced_by_candidate_id integer,
        status char(5)
      )
    `);
    await pgClient().query(`
      CREATE TABLE ${SCHEMA}.${HISTORY} (
        id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        candidate_id integer NOT NULL,
        passport_no varchar(250) NOT NULL,
        passport_issue_date date,
        passport_expire_date date,
        passport_file_path text,
        replaced_at timestamptz NOT NULL DEFAULT NOW()
      )
    `);
  });

  beforeEach(async () => {
    await pgClient().query(`DELETE FROM ${SCHEMA}.${HISTORY}`);
    await pgClient().query(`DELETE FROM ${SCHEMA}.${TABLE}`);
  });

  afterAll(async () => {
    if (client) {
      await pgClient().query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
      await client.end();
    }
  });

  function guard(passport: string, exceptId: number | null) {
    return assertPassportAvailable(db, passport, exceptId, TABLE, HISTORY);
  }

  async function insert(
    passport: string | null,
    extra?: { deleted?: boolean; replaced?: number; status?: string; expire?: string; issue?: string; file?: string; name?: string },
  ): Promise<number> {
    const result = await pgClient().query(
      `INSERT INTO ${TABLE}
         (name, passport_no, passport_issue_date, passport_expire_date, passport_file_path, deleted_at, replaced_by_candidate_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        extra?.name ?? "Candidate",
        passport,
        extra?.issue ?? null,
        extra?.expire ?? null,
        extra?.file ?? null,
        extra?.deleted ? new Date("2020-01-01T00:00:00Z") : null,
        extra?.replaced ?? null,
        extra?.status ?? "A",
      ],
    );
    return Number(result.rows[0].id);
  }

  it("blocks a new row, keeps an existing shared number editable, and ignores expiry, status, replacement, and deletion", async () => {
    const first = await insert("SHARED1");
    const second = await insert("SHARED1");
    await guard("SHARED1", first);
    await guard("SHARED1", second);
    await expect(guard("SHARED1", null)).rejects.toThrow(DUPLICATE_PASSPORT_MESSAGE);
    await expect(guard("  SHARED1  ", null)).rejects.toThrow(DUPLICATE_PASSPORT_MESSAGE);

    await insert("A12074719");
    await expect(guard("A 12074719", null)).resolves.toBeUndefined();
    await insert("AbC1");
    await expect(guard("abc1", null)).resolves.toBeUndefined();

    await insert("EXP1", { expire: "2000-01-01" });
    await insert("REP1", { replaced: 1 });
    await insert("INA1", { status: "I" });
    await insert("DEL1", { deleted: true });
    await expect(guard("EXP1", null)).rejects.toThrow(DUPLICATE_PASSPORT_MESSAGE);
    await expect(guard("REP1", null)).rejects.toThrow(DUPLICATE_PASSPORT_MESSAGE);
    await expect(guard("INA1", null)).rejects.toThrow(DUPLICATE_PASSPORT_MESSAGE);
    await expect(guard("DEL1", null)).rejects.toThrow(DUPLICATE_PASSPORT_MESSAGE);

    const moving = await insert("FREE1");
    await expect(guard("SHARED1", moving)).rejects.toThrow(DUPLICATE_PASSPORT_MESSAGE);
    await expect(guard("UNUSED1", moving)).resolves.toBeUndefined();
    const stillShared = await pgClient().query(`SELECT passport_no FROM ${TABLE} WHERE id = $1`, [second]);
    expect(stillShared.rows[0].passport_no).toBe("SHARED1");
  });

  it("keeps the old passport as history and the new number as current for the same candidate", async () => {
    const id = await insert("OLD100", { issue: "2018-01-15", expire: "2028-01-14", file: "scan-old.pdf", name: "Amina" });
    await retainPassportHistory(db, "NEW200", id, { candidates: TABLE, history: HISTORY });
    await pgClient().query(
      `UPDATE ${TABLE}
       SET passport_no = $2, passport_issue_date = $3, passport_expire_date = $4, passport_file_path = $5
       WHERE id = $1`,
      [id, "NEW200", "2024-06-01", "2034-06-01", "scan-new.pdf"],
    );

    const current = await pgClient().query(
      `SELECT name, passport_no, to_char(passport_issue_date, 'YYYY-MM-DD') AS issued, to_char(passport_expire_date, 'YYYY-MM-DD') AS expires, passport_file_path
       FROM ${TABLE} WHERE id = $1`,
      [id],
    );
    expect(current.rows[0]).toEqual({
      name: "Amina",
      passport_no: "NEW200",
      issued: "2024-06-01",
      expires: "2034-06-01",
      passport_file_path: "scan-new.pdf",
    });
    const history = await pgClient().query(
      `SELECT candidate_id, passport_no, to_char(passport_issue_date, 'YYYY-MM-DD') AS issued, to_char(passport_expire_date, 'YYYY-MM-DD') AS expires, passport_file_path
       FROM ${HISTORY} WHERE candidate_id = $1`,
      [id],
    );
    expect(history.rows).toEqual([
      {
        candidate_id: id,
        passport_no: "OLD100",
        issued: "2018-01-15",
        expires: "2028-01-14",
        passport_file_path: "scan-old.pdf",
      },
    ]);

    await expect(retainPassportHistory(db, "THIRD300", id, { candidates: TABLE, history: HISTORY })).resolves.toBeUndefined();
    await expect(guard("OLD100", null)).rejects.toThrow(DUPLICATE_PASSPORT_MESSAGE);
    const other = await insert("OTHER1");
    await expect(retainPassportHistory(db, "OLD100", other, { candidates: TABLE, history: HISTORY })).rejects.toThrow(DUPLICATE_PASSPORT_MESSAGE);
    await expect(retainPassportHistory(db, "FRESH1", other, { candidates: TABLE, history: HISTORY })).resolves.toBeUndefined();
    const otherRow = await pgClient().query(`SELECT passport_no FROM ${TABLE} WHERE id = $1`, [other]);
    expect(otherRow.rows[0].passport_no).toBe("OTHER1");
  });

  it("lets the first of two concurrent creates commit and rejects the second", async () => {
    const holder = guardPool(new pg.Client({ connectionString }), passportSql);
    const waiter = guardPool(new pg.Client({ connectionString }), passportSql);
    await holder.connect();
    await waiter.connect();
    try {
      await holder.query(`SET search_path TO ${SCHEMA}`);
      await waiter.query(`SET search_path TO ${SCHEMA}`);
      await holder.query("BEGIN");
      await waiter.query("BEGIN");
      await waiter.query("SET LOCAL statement_timeout = '5000ms'");
      await holder.query(passportGuardSql(TABLE).lock, ["MP020GUARDCONCUR"]);
      await holder.query(`INSERT INTO ${TABLE} (passport_no) VALUES ($1)`, ["MP020GUARDCONCUR"]);
      const second = assertPassportAvailable(
        {
          query: async (sql, params) => {
            const result = await waiter.query(sql, params);
            return { rows: result.rows, rowCount: result.rowCount };
          },
        },
        "MP020GUARDCONCUR",
        null,
        TABLE,
        HISTORY,
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      await holder.query("COMMIT");
      await expect(second).rejects.toThrow(DUPLICATE_PASSPORT_MESSAGE);
      await waiter.query("ROLLBACK");
    } finally {
      await holder.query("ROLLBACK").catch(() => undefined);
      await waiter.query("ROLLBACK").catch(() => undefined);
      await holder.end();
      await waiter.end();
    }
    const stored = await pgClient().query(`SELECT COUNT(*)::int AS count FROM ${TABLE} WHERE passport_no = 'MP020GUARDCONCUR'`);
    expect(stored.rows[0].count).toBe(1);
  });
});
