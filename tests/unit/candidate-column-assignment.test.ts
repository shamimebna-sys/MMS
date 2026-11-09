import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessUser } from "@/lib/auth/permissions";

const query = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  pool: { query },
}));

vi.mock("@/server/audit", () => ({
  writeAudit: vi.fn(async () => undefined),
}));

import { mergeColumnAssignment, saveBreadRecord } from "@/server/bread-form";

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

const relationship = (field: string, label: string, column: string, table: string, required = 0) => ({
  field,
  type: "relationship",
  display_name: label,
  required,
  details: JSON.stringify({ table, type: "belongsTo", column, key: "id", label: "name" }),
});

const text = (field: string, label: string) => ({
  field,
  type: "text",
  display_name: label,
  required: 0,
  details: null,
});

const candidateRows = [
  text("name", "Name"),
  text("mobile", "Mobile"),
  text("agent_id", "Agent Id"),
  relationship("candidate_belongsto_agent_relationship", "Agent", "agent_id", "agents", 1),
  text("class_group_id", "Class Group Id"),
  relationship("candidate_belongsto_class_group_relationship", "Group", "class_group_id", "class_groups", 1),
  relationship("candidate_belongsto_sub_agent_relationship", "Sub Agent", "sub_agent_id", "sub_agents", 0),
  text("sub_agent_id", "Sub Agent Id"),
];

const columns = [
  ["id", "integer"],
  ["name", "character varying"],
  ["mobile", "character varying"],
  ["agent_id", "integer"],
  ["class_group_id", "integer"],
  ["sub_agent_id", "integer"],
  ["updated_at", "timestamp with time zone"],
  ["created_at", "timestamp with time zone"],
];

function compact(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function columnList(sql: string): string[] {
  const textSql = compact(sql);
  const insert = /INSERT INTO "candidates" \((.+)\) VALUES/.exec(textSql);
  if (insert) return insert[1].split(",").map((part) => part.trim().replaceAll('"', ""));
  const update = /UPDATE "candidates" SET (.+) WHERE id =/.exec(textSql);
  if (!update) return [];
  return update[1].split(",").map((part) => part.split("=")[0].trim().replaceAll('"', ""));
}

beforeEach(() => {
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
    if (statement.startsWith('SELECT id::text AS value')) return { rows: [], rowCount: 0 };
    if (/^INSERT INTO "candidates"/i.test(statement)) return { rows: [{ id: 41 }], rowCount: 1 };
    if (/^UPDATE "candidates"/i.test(statement)) return { rows: [], rowCount: 1 };
    if (statement.includes('FROM "candidates"')) {
      return {
        rows: [
          {
            id: "9",
            name: "Amina",
            mobile: "01711111111",
            agent_id: "7",
            class_group_id: "3",
            sub_agent_id: "8",
            updated_at: "2026-01-01",
            created_at: "2026-01-01",
          },
        ],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });
});

function savedSql(): string {
  const call = query.mock.calls.find((item) => /^(INSERT INTO|UPDATE) "candidates"/i.test(compact(String(item[0]))));
  expect(call, "candidate write").toBeTruthy();
  return String(call?.[0]);
}

function savedParams(): unknown[] {
  const call = query.mock.calls.find((item) => /^(INSERT INTO|UPDATE) "candidates"/i.test(compact(String(item[0]))));
  return (call?.[1] as unknown[]) ?? [];
}

describe("candidate column assignment", () => {
  it("inserts agent_id once when the raw field and the relationship both target it", async () => {
    const id = await saveBreadRecord(admin, "candidates", null, { name: "MP022 Created", agent_id: "4", class_group_id: "3" }, null);
    const columnsWritten = columnList(savedSql());
    expect(id).toBe(41);
    expect(columnsWritten.filter((column) => column === "agent_id")).toEqual(["agent_id"]);
    expect(savedParams()).toContain(4);
  });

  it("updates agent_id once", async () => {
    await saveBreadRecord(admin, "candidates", 9, { name: "Amina", agent_id: "4", class_group_id: "3" }, null);
    const sql = savedSql();
    expect(compact(sql)).toMatch(/^UPDATE "candidates"/);
    expect(columnList(sql).filter((column) => column === "agent_id")).toEqual(["agent_id"]);
    expect(savedParams()).toContain(4);
  });

  it("inserts and updates class_group_id once", async () => {
    await saveBreadRecord(admin, "candidates", null, { name: "MP022 Created", class_group_id: "3", agent_id: "4" }, null);
    expect(columnList(savedSql()).filter((column) => column === "class_group_id")).toEqual(["class_group_id"]);
    expect(savedParams()).toContain(3);

    query.mockClear();
    await saveBreadRecord(admin, "candidates", 9, { name: "Amina", class_group_id: "6", agent_id: "4" }, null);
    expect(columnList(savedSql()).filter((column) => column === "class_group_id")).toEqual(["class_group_id"]);
    expect(savedParams()).toContain(6);
  });

  it("inserts and updates sub_agent_id once when the relationship row comes first", async () => {
    await saveBreadRecord(admin, "candidates", null, { name: "MP022 Created", sub_agent_id: "8", agent_id: "4", class_group_id: "3" }, null);
    expect(columnList(savedSql()).filter((column) => column === "sub_agent_id")).toEqual(["sub_agent_id"]);
    expect(savedParams()).toContain(8);

    query.mockClear();
    await saveBreadRecord(admin, "candidates", 9, { name: "Amina", sub_agent_id: "11", agent_id: "4", class_group_id: "3" }, null);
    expect(columnList(savedSql()).filter((column) => column === "sub_agent_id")).toEqual(["sub_agent_id"]);
    expect(savedParams()).toContain(11);
  });

  it("writes every affected column once when they are submitted together", async () => {
    await saveBreadRecord(
      admin,
      "candidates",
      null,
      { name: "MP022 Created", mobile: "01800000001", agent_id: "4", class_group_id: "3", sub_agent_id: "8" },
      null,
    );
    const columnsWritten = columnList(savedSql());
    for (const column of ["name", "mobile", "agent_id", "class_group_id", "sub_agent_id"]) {
      expect(columnsWritten.filter((item) => item === column)).toEqual([column]);
    }
    expect(savedParams()).toEqual(["MP022 Created", "01800000001", 4, 3, 8, expect.any(Date), expect.any(Date)]);
  });

  it("keeps a relationship value ahead of a different raw value and keeps a raw value when the relationship is empty", () => {
    const relationshipWins: Array<{ column: string; value: unknown; relationship: boolean }> = [];
    mergeColumnAssignment(relationshipWins, "agent_id", 9, false);
    mergeColumnAssignment(relationshipWins, "agent_id", 4, true);
    expect(relationshipWins).toEqual([{ column: "agent_id", value: 4, relationship: true }]);

    const rawKept: Array<{ column: string; value: unknown; relationship: boolean }> = [];
    mergeColumnAssignment(rawKept, "agent_id", null, true);
    mergeColumnAssignment(rawKept, "agent_id", 9, false);
    expect(rawKept).toEqual([{ column: "agent_id", value: 9, relationship: true }]);

    const rawDoesNotReplace: Array<{ column: string; value: unknown; relationship: boolean }> = [];
    mergeColumnAssignment(rawDoesNotReplace, "agent_id", 4, true);
    mergeColumnAssignment(rawDoesNotReplace, "agent_id", 9, false);
    expect(rawDoesNotReplace).toEqual([{ column: "agent_id", value: 4, relationship: true }]);
  });

  it("clears an optional duplicate column once", async () => {
    const optional = candidateRows.map((row) => ({ ...row, required: 0 }));
    query.mockImplementation(async (sql: unknown, params?: unknown[]) => {
      const statement = compact(String(sql));
      const bound = params ?? [];
      if (statement.includes("FROM data_rows")) return { rows: optional, rowCount: optional.length };
      if (statement.includes("FROM data_types")) {
        return { rows: [{ id: 1, slug: "candidates", name: "candidates", display_name_singular: "Candidate" }], rowCount: 1 };
      }
      if (statement.includes("information_schema.columns")) {
        const requested = Array.isArray(bound[0]) ? bound[0].map(String) : [String(bound[0] ?? "")];
        const rows = requested.flatMap((table_name) => columns.map(([column_name, data_type]) => ({ table_name, column_name, data_type })));
        return { rows, rowCount: rows.length };
      }
      if (/^UPDATE "candidates"/i.test(statement)) return { rows: [], rowCount: 1 };
      if (statement.includes('FROM "candidates"')) {
        return {
          rows: [{ id: "9", name: "Amina", mobile: "01711111111", agent_id: "7", class_group_id: "3", sub_agent_id: "8" }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    await saveBreadRecord(admin, "candidates", 9, { name: "Amina", mobile: "01900000002", agent_id: "", class_group_id: "", sub_agent_id: "" }, null);
    const columnsWritten = columnList(savedSql());
    expect(columnsWritten.filter((column) => column === "agent_id")).toEqual(["agent_id"]);
    expect(columnsWritten.filter((column) => column === "mobile")).toEqual(["mobile"]);
    expect(savedParams().slice(0, 5)).toEqual(["Amina", "01900000002", null, null, null]);
  });

  it("still rejects an empty required relationship", async () => {
    await expect(saveBreadRecord(admin, "candidates", null, { name: "MP022 Created", agent_id: "" }, null)).rejects.toThrow("Agent is required.");
    expect(query.mock.calls.some((call) => /^INSERT/i.test(compact(String(call[0]))))).toBe(false);
  });

  it("updates an unrelated field without repeating it", async () => {
    await saveBreadRecord(admin, "candidates", 9, { name: "Amina Khatun", mobile: "01900000009", agent_id: "7", class_group_id: "3", sub_agent_id: "8" }, null);
    const columnsWritten = columnList(savedSql());
    expect(columnsWritten.filter((column) => column === "name")).toEqual(["name"]);
    expect(columnsWritten.filter((column) => column === "mobile")).toEqual(["mobile"]);
    expect(savedParams()).toContain("Amina Khatun");
    expect(savedParams()).toContain("01900000009");
  });
});
