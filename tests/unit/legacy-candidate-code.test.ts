import path from "node:path";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessUser } from "@/lib/auth/permissions";
import type { SqlClient } from "@/lib/payment-ledger";
import {
  assignLegacyCandidateCode,
  CANDIDATE_CODE_AGENT_MESSAGE,
  CANDIDATE_CODE_PREFIX_MESSAGE,
  CANDIDATE_CODE_TAKEN_MESSAGE,
  CANDIDATE_CODE_WIDTH_MESSAGE,
  legacyCandidateCode,
  legacyCandidateCodeWidth,
} from "@/lib/legacy-candidate-code";
import { guardPool, scopedTestDatabaseUrl, testDatabaseUrl } from "../helpers/pg-test-guard";

config({ path: path.join(process.cwd(), ".env") });

describe("legacy candidate code rule", () => {
  it("joins the trimmed agent code to the candidate id with the historical width", () => {
    expect(legacyCandidateCode("107", 41)).toBe("1070041");
    expect(legacyCandidateCode("113", 45)).toBe("1130045");
    expect(legacyCandidateCode("102", 560)).toBe("1020560");
    expect(legacyCandidateCode("104", 574)).toBe("1040574");
    expect(legacyCandidateCode("110", 676)).toBe("1100676");
    expect(legacyCandidateCode("110", 4405)).toBe("1104405");
    expect(legacyCandidateCode("101", 4406)).toBe("101004406");
    expect(legacyCandidateCode("110", 4802)).toBe("110004802");
    expect(legacyCandidateCode("101", 4820)).toBe("101004820");
    expect(legacyCandidateCode("1029", 4823)).toBe("1029004823");
    expect(legacyCandidateCode("116 ", 50)).toBe("1160050");
    expect(legacyCandidateCodeWidth(4405)).toBe(4);
    expect(legacyCandidateCodeWidth(4406)).toBe(6);
  });

  it("does not invent a prefix, a wider suffix, or the next number", () => {
    expect(() => legacyCandidateCode("", 41)).toThrow(CANDIDATE_CODE_PREFIX_MESSAGE);
    expect(() => legacyCandidateCode("   ", 41)).toThrow(CANDIDATE_CODE_PREFIX_MESSAGE);
    expect(() => legacyCandidateCode("AB", 41)).toThrow(CANDIDATE_CODE_PREFIX_MESSAGE);
    expect(() => legacyCandidateCode("110", 1_000_000)).toThrow(CANDIDATE_CODE_WIDTH_MESSAGE);
    expect(legacyCandidateCodeWidth(0)).toBeNull();
    const source = readFileSync(path.join(process.cwd(), "src/lib/legacy-candidate-code.ts"), "utf8");
    expect(source).not.toMatch(/MAX\s*\(/i);
    expect(source).toContain("pg_advisory_xact_lock");
    expect(source).toContain("FOR UPDATE");
  });
});

const query = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  pool: { query },
}));

vi.mock("@/server/audit", () => ({
  writeAudit: vi.fn(async () => undefined),
}));

vi.mock("@/server/payment-ledger", () => ({
  withPgTransaction: async (work: (db: SqlClient) => Promise<number>) => work({ query }),
  readPaymentFacts: vi.fn(),
  syncPaymentChange: vi.fn(),
}));

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

function compact(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

const candidateRows = [
  { field: "name", type: "text", display_name: "Name", required: 1, details: null },
  { field: "code", type: "text", display_name: "Code", required: 1, details: null },
  {
    field: "candidate_belongsto_agent_relationship",
    type: "relationship",
    display_name: "Agent",
    required: 1,
    details: JSON.stringify({ table: "agents", type: "belongsTo", column: "agent_id", key: "id", label: "name" }),
  },
];

const columns = [
  ["id", "integer"],
  ["name", "character varying"],
  ["code", "character varying"],
  ["agent_id", "integer"],
  ["updated_at", "timestamp with time zone"],
  ["created_at", "timestamp with time zone"],
];

describe("candidate create allocates the legacy code", () => {
  let agentCode: string | null;
  let taken: boolean;
  let insertedId: number;

  beforeEach(() => {
    agentCode = "1029";
    taken = false;
    insertedId = 4823;
    query.mockReset();
    query.mockImplementation(async (sql: unknown, params?: unknown[]) => {
      const statement = compact(String(sql));
      const bound = params ?? [];
      if (statement.includes("FROM data_types")) {
        return { rows: [{ id: 1, slug: "candidates", name: "candidates", display_name_singular: "Candidate" }], rowCount: 1 };
      }
      if (statement.includes("FROM data_rows")) return { rows: candidateRows, rowCount: candidateRows.length };
      if (statement.includes("information_schema.columns")) {
        const requested = Array.isArray(bound[0]) ? bound[0].map(String) : [String(bound[0] ?? "")];
        const rows = requested.flatMap((table_name) => columns.map(([column_name, data_type]) => ({ table_name, column_name, data_type })));
        return { rows, rowCount: rows.length };
      }
      if (statement.startsWith("SELECT id::text AS value")) return { rows: [], rowCount: 0 };
      if (statement.includes("FROM agents") && statement.includes("FOR UPDATE")) {
        return { rows: agentCode == null ? [] : [{ code: agentCode }], rowCount: agentCode == null ? 0 : 1 };
      }
      if (statement.includes("pg_advisory_xact_lock")) return { rows: [{ locked: "1" }], rowCount: 1 };
      if (statement.includes("FROM candidates") && statement.includes("btrim(code")) {
        return { rows: taken ? [{ id: 1 }] : [], rowCount: taken ? 1 : 0 };
      }
      if (/^INSERT INTO "candidates"/i.test(statement)) return { rows: [{ id: insertedId }], rowCount: 1 };
      if (/^UPDATE candidates SET code/i.test(statement)) return { rows: [{ id: insertedId }], rowCount: 1 };
      if (/^UPDATE "candidates"/i.test(statement)) return { rows: [], rowCount: 1 };
      if (statement.includes('FROM "candidates"')) {
        return {
          rows: [{ id: "9", name: "Existing", code: "1070041", agent_id: "7", updated_at: "2026-01-01", created_at: "2026-01-01" }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });
  });

  function statements(): string[] {
    return query.mock.calls.map((call) => compact(String(call[0])));
  }

  it("stores the code from the inserted id and ignores a submitted code", async () => {
    const id = await saveBreadRecord(admin, "candidates", null, { name: "New candidate", code: "PREVIEW", agent_id: "29" }, null);
    expect(id).toBe(4823);
    const insert = query.mock.calls.find((call) => /^INSERT INTO "candidates"/i.test(compact(String(call[0]))));
    expect(compact(String(insert?.[0]))).not.toContain('"code"');
    expect(insert?.[1]).not.toContain("PREVIEW");
    const update = query.mock.calls.find((call) => /^UPDATE candidates SET code/i.test(compact(String(call[0]))));
    expect(update?.[1]).toEqual(["1029004823", 4823]);
    const order = statements();
    const lockAt = order.findIndex((sql) => sql.includes("FROM agents") && sql.includes("FOR UPDATE"));
    const insertAt = order.findIndex((sql) => sql.startsWith('INSERT INTO "candidates"'));
    const advisoryAt = order.findIndex((sql) => sql.includes("pg_advisory_xact_lock"));
    const updateAt = order.findIndex((sql) => sql.startsWith("UPDATE candidates SET code"));
    expect(lockAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(lockAt);
    expect(advisoryAt).toBeGreaterThan(insertAt);
    expect(updateAt).toBeGreaterThan(advisoryAt);
  });

  it("rejects a code that is already stored and does not update", async () => {
    taken = true;
    await expect(saveBreadRecord(admin, "candidates", null, { name: "New candidate", agent_id: "29" }, null)).rejects.toThrow(CANDIDATE_CODE_TAKEN_MESSAGE);
    expect(statements().some((sql) => sql.startsWith("UPDATE candidates SET code"))).toBe(false);
  });

  it("does not invent a code when the agent has none", async () => {
    agentCode = "  ";
    await expect(saveBreadRecord(admin, "candidates", null, { name: "New candidate", agent_id: "29" }, null)).rejects.toThrow(CANDIDATE_CODE_PREFIX_MESSAGE);
    expect(statements().some((sql) => sql.startsWith("INSERT"))).toBe(false);
  });

  it("does not invent a code when the candidate has no agent", async () => {
    await expect(saveBreadRecord(admin, "candidates", null, { name: "New candidate", agent_id: "" }, null)).rejects.toThrow(/required|cannot be generated/i);
    expect(statements().some((sql) => sql.startsWith("INSERT"))).toBe(false);
  });

  it("does not replace the code when an existing candidate is edited", async () => {
    await saveBreadRecord(admin, "candidates", 9, { name: "Existing", code: "1070041", agent_id: "7" }, null);
    expect(statements().some((sql) => sql.includes("FROM agents") && sql.includes("FOR UPDATE"))).toBe(false);
    expect(statements().some((sql) => sql.startsWith('UPDATE "candidates"'))).toBe(true);
  });
});

const SCHEMA = "mp_candidate_code";
const codeSql = {
  allowedSchemas: [SCHEMA],
  allowedUnqualifiedRelations: ["agents", "candidates"],
};

describe("legacy candidate code concurrency", () => {
  let connectionString = "";
  let adminClient: pg.Client | undefined;

  function client(): pg.Client {
    if (!adminClient) throw new Error("PostgreSQL test client is not open.");
    return adminClient;
  }

  async function openClient(): Promise<pg.Client> {
    const opened = guardPool(new pg.Client({ connectionString }), codeSql);
    await opened.connect();
    return opened;
  }

  beforeAll(async () => {
    connectionString = scopedTestDatabaseUrl(testDatabaseUrl(), SCHEMA);
    adminClient = await openClient();
    const database = await client().query<{ db: string }>(`SELECT current_database()::text AS db`);
    if (database.rows[0]?.db !== "mms_test") throw new Error(`Refusing candidate-code database ${database.rows[0]?.db ?? ""}`);
    await client().query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await client().query(`CREATE SCHEMA ${SCHEMA}`);
    await client().query(`SET search_path TO ${SCHEMA}`);
    await client().query(`
      CREATE TABLE ${SCHEMA}.agents (
        id integer PRIMARY KEY,
        code varchar(100)
      )
    `);
    await client().query(`
      CREATE TABLE ${SCHEMA}.candidates (
        id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        code varchar(100),
        agent_id integer
      )
    `);
    await client().query(`INSERT INTO ${SCHEMA}.agents (id, code) VALUES (10, '110'), (29, '1029'), (7, '107'), (14, '116 ')`);
  });

  afterAll(async () => {
    if (!adminClient) return;
    await adminClient.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await adminClient.end();
  });

  function dbFor(connection: pg.Client): SqlClient {
    return {
      query: async (sql, params) => {
        const result = await connection.query(sql, params);
        return { rows: result.rows, rowCount: result.rowCount };
      },
    };
  }

  async function createCodedCandidate(agentId: number): Promise<{ id: number; code: string }> {
    const connection = await openClient();
    try {
      await connection.query("BEGIN");
      const inserted = await connection.query<{ id: number }>(`INSERT INTO candidates (agent_id) VALUES ($1) RETURNING id`, [agentId]);
      const id = Number(inserted.rows[0]?.id);
      const code = await assignLegacyCandidateCode(dbFor(connection), id, agentId);
      await connection.query("COMMIT");
      return { id, code };
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      await connection.end();
    }
  }

  it("allocates distinct codes for concurrent creates and keeps the historical width", async () => {
    const created = await Promise.all([
      createCodedCandidate(10),
      createCodedCandidate(29),
      createCodedCandidate(10),
      createCodedCandidate(29),
      createCodedCandidate(7),
      createCodedCandidate(14),
    ]);
    expect(new Set(created.map((row) => row.code)).size).toBe(created.length);
    for (const row of created) {
      const agent = await client().query<{ code: string }>(`SELECT code FROM agents WHERE id = (SELECT agent_id FROM candidates WHERE id = $1)`, [row.id]);
      expect(row.code).toBe(legacyCandidateCode(String(agent.rows[0]?.code), row.id));
    }
    const explicit = await openClient();
    try {
      await explicit.query("BEGIN");
      await explicit.query(`INSERT INTO candidates (id, agent_id) VALUES (4823, 29)`);
      const code = await assignLegacyCandidateCode(dbFor(explicit), 4823, 29);
      expect(code).toBe("1029004823");
      await explicit.query(`INSERT INTO candidates (id, agent_id, code) VALUES (900001, 29, '1029004823')`);
      await expect(assignLegacyCandidateCode(dbFor(explicit), 4823, 29)).rejects.toThrow(CANDIDATE_CODE_TAKEN_MESSAGE);
      await explicit.query("ROLLBACK");
    } finally {
      await explicit.end();
    }
    const retained = await client().query<{ code: string | null }>(`SELECT code FROM candidates WHERE id = 4823`);
    expect(retained.rows[0]?.code ?? null).toBeNull();
  });

  it("makes a concurrent duplicate wait for the lock and then reject it", async () => {
    const holder = await openClient();
    const racer = await openClient();
    let finished = false;
    try {
      await holder.query("BEGIN");
      await holder.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, ["1029004823"]);
      await holder.query(`INSERT INTO candidates (id, agent_id, code) VALUES (900002, 29, '1029004823')`);
      const race = (async () => {
        await racer.query("BEGIN");
        await racer.query(`INSERT INTO candidates (id, agent_id) VALUES (4823, 29)`);
        try {
          return await assignLegacyCandidateCode(dbFor(racer), 4823, 29);
        } finally {
          finished = true;
        }
      })();
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(finished).toBe(false);
      await holder.query("COMMIT");
      await expect(race).rejects.toThrow(CANDIDATE_CODE_TAKEN_MESSAGE);
      await racer.query("ROLLBACK");
    } finally {
      await holder.end().catch(() => undefined);
      await racer.end().catch(() => undefined);
    }
    const stored = await client().query<{ id: number }>(`SELECT id FROM candidates WHERE btrim(code) = '1029004823' ORDER BY id`);
    expect(stored.rows.map((row) => Number(row.id))).toEqual([900002]);
  });
});
