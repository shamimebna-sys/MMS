import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessUser } from "@/lib/auth/permissions";

const query = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  pool: { query },
}));

import { loadBreadForm } from "@/server/bread-form";

const admin: AccessUser = {
  id: 1,
  name: "Admin",
  roleName: "sadmin",
  permissions: [],
  agentId: null,
  subAgentId: null,
  candidateId: null,
  agencierId: null,
  companierId: null,
  status: "A",
};

const agent: AccessUser = {
  id: 2,
  name: "Agent",
  roleName: "Agent",
  permissions: [],
  agentId: 7,
  subAgentId: null,
  candidateId: null,
  agencierId: null,
  companierId: null,
  status: "A",
};

const subAgent: AccessUser = {
  id: 3,
  name: "Sub Agent",
  roleName: "Sub Agent",
  permissions: [],
  agentId: null,
  subAgentId: 9,
  candidateId: null,
  agencierId: null,
  companierId: null,
  status: "A",
};

type FieldRow = { field: string; type: string; display_name: string; required: number; details: string | null };

function relationship(field: string, label: string, column: string, table: string, relationLabel: string, required = 0, relationType = "belongsTo"): FieldRow {
  return {
    field,
    type: "relationship",
    display_name: label,
    required,
    details: JSON.stringify({ table, type: relationType, column, key: "id", label: relationLabel }),
  };
}

const formRows: FieldRow[] = [
  { field: "name", type: "text", display_name: "Name", required: 1, details: null },
  { field: "secret", type: "hidden", display_name: "Secret", required: 0, details: null },
  { field: "nickname", type: "text", display_name: "Nickname", required: 0, details: null },
  relationship("candidate_belongsto_agent_relationship", "Agent", "agent_id", "agents", "agent_details_info", 1),
  relationship("candidate_belongsto_class_group_relationship", "Group", "class_group_id", "class_groups", "group_info"),
  relationship("candidate_belongsto_position_relationship", "Position", "position_id", "positions", "title"),
  relationship("candidate_belongsto_sub_agent_relationship", "Sub Agent", "sub_agent_id", "sub_agents", "name"),
  relationship("candidate_belongsto_ghost_relationship", "Ghost", "ghost_id", "ghosts", "name"),
  relationship("candidate_belongsto_bad_relationship", "Bad", "country_id", "Agents", "name"),
  relationship("candidate_belongsto_injected_relationship", "Injected", "country_id", "agents;drop", "name"),
  relationship("candidate_belongsto_missing_relationship", "Missing", "missing_id", "countries", "name"),
  relationship("candidate_belongstomany_relationship", "Many", "tag_id", "tags", "name", 0, "belongsToMany"),
  {
    field: "gender",
    type: "select_dropdown",
    display_name: "Gender",
    required: 0,
    details: JSON.stringify({ options: { M: "Male", F: "Female" }, default: "M" }),
  },
  { field: "email", type: "email", display_name: "Email", required: 0, details: null },
];

const baseCatalog: Record<string, [string, string][]> = {
  candidates: [
    ["id", "integer"],
    ["code", "character varying"],
    ["name", "character varying"],
    ["email", "character varying"],
    ["gender", "character varying"],
    ["agent_id", "integer"],
    ["class_group_id", "integer"],
    ["position_id", "integer"],
    ["sub_agent_id", "integer"],
    ["ghost_id", "integer"],
    ["country_id", "integer"],
    ["replaced_by_candidate_id", "integer"],
  ],
  agents: [
    ["id", "integer"],
    ["code", "character varying"],
    ["name", "character varying"],
  ],
  class_groups: [
    ["id", "integer"],
    ["code", "character varying"],
    ["name", "character varying"],
  ],
  positions: [["id", "integer"], ["title", "character varying"]],
  sub_agents: [
    ["id", "integer"],
    ["name", "character varying"],
  ],
  countries: [["id", "integer"], ["name", "character varying"]],
};

let catalog: Record<string, [string, string][]>;
let visible: boolean;
let parentAgentId: number | null;
let moduleSlug: string;

type QueryCall = { sql: string; params: unknown[] };
const calls: QueryCall[] = [];

function compact(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function metadataCalls(): QueryCall[] {
  return calls.filter((call) => compact(call.sql).includes("information_schema.columns"));
}

function choiceCalls(): QueryCall[] {
  return calls.filter((call) => compact(call.sql).startsWith("SELECT id::text AS value"));
}

beforeEach(() => {
  calls.length = 0;
  catalog = structuredClone(baseCatalog);
  visible = true;
  parentAgentId = 4;
  moduleSlug = "candidates";
  query.mockReset();
  query.mockImplementation(async (sql: unknown, params?: unknown[]) => {
    const statement = compact(String(sql));
    const bound = params ?? [];
    calls.push({ sql: statement, params: bound });
    if (statement.includes("FROM data_types")) {
      moduleSlug = String(bound[0] ?? "");
      if (moduleSlug === "missing") return { rows: [], rowCount: 0 };
      if (moduleSlug === "unsafe") return { rows: [{ id: 9, slug: "unsafe", name: "bad-table", display_name_singular: "Unsafe" }], rowCount: 1 };
      return { rows: [{ id: 1, slug: "candidates", name: "candidates", display_name_singular: "Candidate" }], rowCount: 1 };
    }
    if (statement.includes("FROM data_rows")) {
      if (moduleSlug === "unsafe") return { rows: [], rowCount: 0 };
      return { rows: formRows, rowCount: formRows.length };
    }
    if (statement.includes("information_schema.columns")) {
      const requested = Array.isArray(bound[0]) ? bound[0].map(String) : [String(bound[0] ?? "")];
      const rows = requested.flatMap((table_name) =>
        (catalog[table_name] ?? []).map(([column_name, data_type]) => ({ table_name, column_name, data_type })),
      );
      return { rows, rowCount: rows.length };
    }
    if (statement.includes("SELECT agent_id FROM sub_agents")) {
      return { rows: parentAgentId == null ? [] : [{ agent_id: parentAgentId }], rowCount: parentAgentId == null ? 0 : 1 };
    }
    if (statement.startsWith("SELECT id::text AS value")) return { rows: [{ value: "1", label: "One" }], rowCount: 1 };
    if (statement.includes('FROM "candidates"') || statement.includes('FROM "bad-table"')) {
      if (!visible || statement.includes(" FALSE")) return { rows: [], rowCount: 0 };
      return {
        rows: [{ id: "18", name: "Amina", email: "amina@example.com", gender: "F", agent_id: "1", replaced_by_candidate_id: "3" }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });
});

describe("loadBreadForm metadata", () => {
  it("reads every required table from one parameterized catalog query", async () => {
    const form = await loadBreadForm("candidates", "edit", 18, admin);
    const metadata = metadataCalls();
    expect(metadata).toHaveLength(1);
    expect(metadata[0]?.sql).toContain("table_schema = 'public'");
    expect(metadata[0]?.sql).toContain("table_name = ANY($1::text[])");
    expect(metadata[0]?.sql).not.toMatch(/agents|class_groups|positions|sub_agents|ghosts|countries|candidates/);
    expect(metadata[0]?.params).toEqual([["candidates", "agents", "class_groups", "positions", "sub_agents", "ghosts", "countries"]]);
    expect(choiceCalls().some((call) => call.sql.includes("information_schema"))).toBe(false);
    expect(form?.fields.map((field) => field.name)).toEqual([
      "name",
      "agent_id",
      "class_group_id",
      "position_id",
      "sub_agent_id",
      "ghost_id",
      "gender",
      "email",
      "replaced_by_candidate_id",
    ]);
  });

  it("uses each relationship table's own columns from that single result", async () => {
    await loadBreadForm("candidates", "edit", 18, admin);
    const choices = choiceCalls().map((call) => call.sql);
    expect(choices).toHaveLength(6);
    expect(choices[0]).toContain('FROM "agents"');
    expect(choices[0]).toContain("concat_ws");
    expect(choices[0]).not.toContain("WHERE");
    expect(choices[1]).toContain('FROM "class_groups"');
    expect(choices[1]).toContain("concat_ws");
    expect(choices[2]).toContain('FROM "positions"');
    expect(choices[2]).toContain('"title"::text');
    expect(choices[2]).not.toContain("concat_ws");
    expect(choices[3]).toContain('FROM "sub_agents"');
    expect(choices[3]).toContain('"name"::text');
    expect(choices[4]).toContain('FROM "ghosts"');
    expect(choices[4]).toContain("COALESCE(id::text::text, id::text)");
    expect(choices[4]).not.toContain('"name"');
    expect(choices[5]).toContain('FROM "candidates"');
    expect(choices[5]).toContain("concat_ws");
    expect(choices.some((sql) => sql.includes('FROM "countries"') || sql.includes('FROM "tags"') || sql.includes("Agents"))).toBe(false);
  });

  it("omits a missing column and still labels a table with no catalog rows by id", async () => {
    const form = await loadBreadForm("candidates", "add", null, admin);
    expect(form?.fields.some((field) => field.name === "nickname" || field.name === "missing_id" || field.name === "secret")).toBe(false);
    expect(form?.fields.find((field) => field.name === "ghost_id")?.options).toEqual([{ value: "1", label: "One" }]);
    expect(form?.fields.find((field) => field.name === "gender")).toMatchObject({
      input: "select",
      required: false,
      value: "M",
      options: [
        { value: "M", label: "Male" },
        { value: "F", label: "Female" },
      ],
    });
    expect(form?.fields.find((field) => field.name === "name")).toMatchObject({ required: true, value: "" });
    expect(form?.fields.some((field) => field.name === "replaced_by_candidate_id")).toBe(true);
    expect(metadataCalls()).toHaveLength(1);
  });

  it("keeps edit values, field order, and the Replaced By candidate label", async () => {
    const form = await loadBreadForm("candidates", "edit", 18, admin);
    expect(form?.fields.find((field) => field.name === "name")).toMatchObject({ label: "Name", value: "Amina", input: "text" });
    expect(form?.fields.find((field) => field.name === "email")).toMatchObject({ value: "amina@example.com", input: "email" });
    expect(form?.fields.find((field) => field.name === "gender")?.value).toBe("F");
    const replaced = form?.fields.at(-1);
    expect(replaced).toMatchObject({ name: "replaced_by_candidate_id", label: "Replaced By", required: false, value: "3" });
    expect(replaced?.options.map((option) => option.value)).toEqual(["3", "1"]);
    const replacedSql = choiceCalls().at(-1)?.sql ?? "";
    expect(replacedSql).toContain('FROM "candidates"');
    expect(replacedSql).toContain("concat_ws");
    expect(metadataCalls()[0]?.params[0]).toContain("candidates");
    expect(metadataCalls()).toHaveLength(1);
  });

  it("rejects unknown modules and unsafe identifiers without interpolating them", async () => {
    expect(await loadBreadForm("missing", "edit", 18, admin)).toBeNull();
    expect(metadataCalls()).toHaveLength(0);

    calls.length = 0;
    await expect(loadBreadForm("unsafe", "edit", 18, admin)).rejects.toThrow("Unsafe identifier.");
    const metadata = metadataCalls();
    expect(metadata).toHaveLength(1);
    expect(metadata[0]?.sql).not.toContain("bad-table");
    expect(metadata[0]?.params).toEqual([["bad-table"]]);
    expect(calls.some((call) => call.sql.includes('FROM "bad-table"') || call.sql.includes("bad-table"))).toBe(false);

    calls.length = 0;
    const form = await loadBreadForm("candidates", "edit", 18, admin);
    const tables = metadataCalls()[0]?.params[0] as string[];
    expect(tables).not.toContain("Agents");
    expect(tables).not.toContain("agents;drop");
    expect(tables).not.toContain("tags");
    expect(form?.fields.some((field) => field.name === "country_id" || field.name === "tag_id")).toBe(false);
    expect(calls.some((call) => call.sql.includes("agents;drop") || call.sql.includes("Agents"))).toBe(false);
  });

  it("keeps an invisible candidate closed and does not load relationship choices", async () => {
    visible = false;
    const form = await loadBreadForm("candidates", "edit", 18, agent);
    expect(form).toBeNull();
    expect(metadataCalls()).toHaveLength(1);
    expect(choiceCalls()).toHaveLength(0);
    const record = calls.find((call) => call.sql.includes("id IN (SELECT id"));
    expect(record?.sql).toContain('"agent_id" = $2');
    expect(record?.params).toEqual([18, 7]);
  });

  it("keeps agent and sub-agent relationship restrictions", async () => {
    const agentForm = await loadBreadForm("candidates", "edit", 18, agent);
    const agentChoices = choiceCalls();
    expect(agentChoices[0]?.sql).toContain('FROM "agents" WHERE "id" = $1');
    expect(agentChoices[0]?.params).toEqual([7]);
    expect(agentChoices[3]?.sql).toContain('FROM "sub_agents" WHERE "agent_id" = $1');
    expect(agentChoices[3]?.params).toEqual([7]);
    expect(agentChoices[1]?.sql).not.toContain("WHERE");
    expect(agentChoices[5]?.sql).toContain('FROM "candidates"');
    expect(agentChoices[5]?.sql).not.toContain("WHERE");
    expect(agentForm?.fields.filter((field) => field.name === "agent_id").map((field) => field.options.length)).toEqual([1]);
    expect(metadataCalls()).toHaveLength(1);

    calls.length = 0;
    const subForm = await loadBreadForm("candidates", "edit", 18, subAgent);
    const subChoices = choiceCalls();
    expect(calls.some((call) => call.sql.includes("SELECT agent_id FROM sub_agents") && call.params[0] === 9)).toBe(true);
    expect(subChoices[0]?.sql).toContain('FROM "agents" WHERE "id" = $1');
    expect(subChoices[0]?.params).toEqual([4]);
    expect(subChoices[3]?.sql).toContain('FROM "sub_agents" WHERE "id" = $1');
    expect(subChoices[3]?.params).toEqual([9]);
    expect(subForm?.fields.map((field) => field.name).at(-1)).toBe("replaced_by_candidate_id");
    const record = calls.find((call) => call.sql.includes("id IN (SELECT id"));
    expect(record?.sql).toContain('"sub_agent_id" = $2');
    expect(record?.params).toEqual([18, 9]);
    expect(metadataCalls()).toHaveLength(1);
  });

  it("loads metadata again for a later form load", async () => {
    const first = await loadBreadForm("candidates", "edit", 18, admin);
    expect(first?.fields.find((field) => field.name === "position_id")).toBeTruthy();
    expect(choiceCalls().find((call) => call.sql.includes('FROM "positions"'))?.sql).toContain('"title"::text');

    catalog.positions = [["id", "integer"]];
    delete catalog.candidates;
    calls.length = 0;
    const second = await loadBreadForm("candidates", "edit", 18, admin);
    expect(metadataCalls()).toHaveLength(1);
    expect(second?.fields.some((field) => field.name === "name" || field.name === "position_id" || field.name === "replaced_by_candidate_id")).toBe(false);
    expect(choiceCalls()).toHaveLength(0);
    expect(first?.fields.some((field) => field.name === "name")).toBe(true);
  });
});
