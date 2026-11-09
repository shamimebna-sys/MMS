import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessUser } from "@/lib/auth/permissions";
import { visibilitySql } from "@/lib/auth/row-scope";
import { getResource } from "@/server/resources";

const query = vi.hoisted(() => vi.fn());
const requireUser = vi.hoisted(() => vi.fn());
const inside = vi.hoisted(() => ({
  props: [] as Array<{ id: number; stamp: boolean; error?: string }>,
}));

vi.mock("@/lib/db", () => ({
  pool: { query },
}));

vi.mock("@/server/current-user", () => ({
  requireUser,
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) => {
    const { createElement: element } = require("react") as typeof import("react");
    return element("a", { href }, children);
  },
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));

vi.mock("@/components/records/candidate-inside", () => ({
  CandidateInside: (props: { id: number; stamp: boolean; error?: string }) => {
    inside.props.push(props);
    const { createElement: element } = require("react") as typeof import("react");
    return element("article", null, `candidate-detail-${props.id}`);
  },
}));

vi.mock("@/components/records/row-actions", () => ({
  RowActions: () => {
    const { createElement: element } = require("react") as typeof import("react");
    return element("div", { "data-row-actions": "true" });
  },
}));

import RecordDetailPage from "@/app/(workspace)/records/[resource]/[id]/page";
import EditRecordPage from "@/app/(workspace)/records/[resource]/[id]/edit/page";
import { readCandidateDetailAccess } from "@/server/browse";

type DataType = { id: number; slug: string; name: string; display_name_plural: string };
type QueryCall = { sql: string; params: unknown[] };

const calls: QueryCall[] = [];
let dataType: DataType | null = null;
let candidateColumns = ["id", "deleted_at"];
let widgetVisible = true;

const owned = [
  { id: 18, agent_id: 4, sub_agent_id: 9, agencier_id: 8, companier_id: 6, deleted: false },
  { id: 19, agent_id: 5, sub_agent_id: 2, agencier_id: 3, companier_id: 7, deleted: false },
  { id: 20, agent_id: 4, sub_agent_id: 9, agencier_id: 8, companier_id: 6, deleted: true },
];

function user(overrides: Partial<AccessUser> = {}): AccessUser {
  return {
    id: 1,
    name: "Owner",
    roleName: "owner",
    permissions: [],
    agentId: null,
    subAgentId: null,
    candidateId: null,
    agencierId: null,
    companierId: null,
    status: "A",
    ...overrides,
  };
}

function compact(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function probeCalls(): QueryCall[] {
  return calls.filter((call) => call.sql.startsWith('SELECT t.id') && call.sql.includes('FROM "candidates"'));
}

function honorsProbe(statement: string, params: unknown[]): boolean {
  const row = owned.find((item) => item.id === Number(params[0]));
  if (!row) return false;
  if (statement.includes("deleted_at IS NULL") && row.deleted) return false;
  if (statement.includes("WHERE FALSE)")) return false;
  if (statement.includes("WHERE TRUE)")) return true;
  if (statement.includes('"agent_id" = $2')) return row.agent_id === params[1];
  if (statement.includes('"sub_agent_id" = $2')) return row.sub_agent_id === params[1];
  if (statement.includes('"agencier_id" = $2')) return row.agencier_id === params[1];
  if (statement.includes('"companier_id" = $2')) return row.companier_id === params[1];
  if (statement.includes('"id" = $2')) return row.id === params[1];
  return false;
}

function answer(sql: unknown, params: unknown[] = []) {
  const statement = compact(String(sql));
  calls.push({ sql: statement, params });
  if (statement.includes("FROM data_types")) {
    const slug = String(params[0] ?? "");
    if (slug === "candidates") return { rows: dataType ? [dataType] : [], rowCount: dataType ? 1 : 0 };
    if (slug === "employers") {
      const row = { id: 4, slug: "employers", name: "employers", display_name_plural: "Employers" };
      return { rows: [row], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }
  if (statement.includes("information_schema.columns") && statement.includes("table_name =")) {
    const rows = candidateColumns.map((column_name) => ({ column_name }));
    return { rows, rowCount: rows.length };
  }
  if (statement.includes("information_schema.columns")) {
    const rows = [
      { table_name: "employers", column_name: "id" },
      { table_name: "employers", column_name: "name" },
      { table_name: "widgets", column_name: "id" },
      { table_name: "widgets", column_name: "deleted_at" },
      { table_name: "candidates", column_name: "id" },
      { table_name: "candidates", column_name: "deleted_at" },
      { table_name: "candidates", column_name: "name" },
    ];
    return { rows, rowCount: rows.length };
  }
  if (statement.includes("FROM data_rows")) {
    const row = { field: "name", type: "text", display_name: "Employer name", details: null };
    return { rows: [row], rowCount: 1 };
  }
  if (statement.startsWith("SELECT t.id") && statement.includes('FROM "candidates"')) {
    const visible = honorsProbe(statement, params);
    return { rows: visible ? [{ id: params[0] }] : [], rowCount: visible ? 1 : 0 };
  }
  if (statement.includes('FROM "candidates"') && statement.includes("passport_no")) {
    const visible = honorsProbe(statement.replace(" AND ", " WHERE "), params);
    return { rows: visible ? [{ id: params[0], name: "Amina" }] : [], rowCount: visible ? 1 : 0 };
  }
  if (statement.includes('FROM "employers"')) {
    return { rows: [{ id: params[0], c0: "Northwind" }], rowCount: 1 };
  }
  if (statement.includes('FROM "widgets"')) {
    return { rows: widgetVisible ? [{ id: params[0], c0: "Kept" }] : [], rowCount: widgetVisible ? 1 : 0 };
  }
  return { rows: [], rowCount: 0 };
}

beforeEach(() => {
  calls.length = 0;
  inside.props.length = 0;
  dataType = { id: 20, slug: "candidates", name: "candidates", display_name_plural: "Candidates" };
  candidateColumns = ["id", "deleted_at"];
  widgetVisible = true;
  requireUser.mockReset();
  requireUser.mockResolvedValue(user());
  query.mockReset();
  query.mockImplementation(answer);
});

async function renderDetail(resource: string, id = "18", search: { stamp?: string; error?: string; edit?: string } = {}) {
  const element = await RecordDetailPage({
    params: Promise.resolve({ resource, id }),
    searchParams: Promise.resolve(search),
  });
  return renderToStaticMarkup(element);
}

describe("candidate detail access", () => {
  it("uses the module check and the same row predicate without the bread projection", async () => {
    const viewer = user({ roleName: "Agent", agentId: 4, permissions: [] });
    const expected: unknown[] = [18];
    const visibility = visibilitySql(getResource("candidates")!, viewer, expected);

    await expect(readCandidateDetailAccess(viewer, 18)).resolves.toBe(true);

    expect(calls.map((call) => call.sql)).toEqual([
      expect.stringContaining("FROM data_types"),
      expect.stringContaining("table_name = $1 AND column_name IN ('id', 'deleted_at')"),
      expect.stringContaining('SELECT t.id'),
    ]);
    const probe = probeCalls()[0];
    expect(probe?.sql).toContain(`WHERE ${visibility}`);
    expect(probe?.sql).toContain('t.id IN (SELECT id FROM "candidates" WHERE');
    expect(probe?.sql).toContain("t.deleted_at IS NULL");
    expect(probe?.sql).not.toContain("LEFT JOIN");
    expect(probe?.params).toEqual(expected);
    expect(calls.some((call) => call.sql.includes("FROM data_rows"))).toBe(false);
    expect(calls.some((call) => call.sql.includes("information_schema.columns") && !call.sql.includes("table_name ="))).toBe(false);
  });

  it("keeps party, office, and candidate visibility on the probe", async () => {
    const cases = [
      user({ roleName: "owner", permissions: [] }),
      user({ roleName: "sadmin", permissions: [] }),
      user({ roleName: "admin", permissions: [] }),
      user({ roleName: "Employee", permissions: ["browse_candidates"] }),
      user({ roleName: "Agent", agentId: 4, permissions: [] }),
      user({ roleName: "Agent", agentId: 4, permissions: [], status: "I" }),
      user({ roleName: "Sub Agent", subAgentId: 9, permissions: [] }),
      user({ roleName: "Agency", agencierId: 8, permissions: [] }),
      user({ roleName: "Agencier", agencierId: 8, permissions: [] }),
      user({ roleName: "Company", companierId: 6, permissions: ["browse_candidates"] }),
      user({ roleName: "Candidate", candidateId: 18, permissions: ["browse_candidates"] }),
      user({ roleName: "Candidate", candidateId: 19, permissions: ["browse_candidates"] }),
    ];
    for (const viewer of cases) {
      calls.length = 0;
      const expected: unknown[] = [18];
      const visibility = visibilitySql(getResource("candidates")!, viewer, expected);
      const visible = await readCandidateDetailAccess(viewer, 18);
      const probe = probeCalls()[0];
      expect(probe?.sql).toContain(visibility);
      expect(probe?.sql).toContain("t.deleted_at IS NULL");
      expect(probe?.params).toEqual(expected);
      expect(visible).toBe(visibility !== "FALSE" && honorsProbe(probe?.sql ?? "", expected));
    }
  });

  it("denies a user with no candidate module grant before reading the row", async () => {
    const teacher = user({ roleName: "Teacher", permissions: [], candidateId: 18 });
    await expect(readCandidateDetailAccess(teacher, 18)).rejects.toThrow("You do not have access to this module.");
    expect(probeCalls()).toHaveLength(0);
    expect(calls.some((call) => call.sql.includes("FROM data_rows"))).toBe(false);
  });

  it("returns false for another party's row and for a soft-deleted row", async () => {
    const agent = user({ roleName: "Agent", agentId: 4, permissions: [] });
    await expect(readCandidateDetailAccess(agent, 19)).resolves.toBe(false);
    await expect(readCandidateDetailAccess(agent, 20)).resolves.toBe(false);
    expect(probeCalls().every((call) => call.sql.includes("t.deleted_at IS NULL"))).toBe(true);
    expect(probeCalls()[0]?.params).toEqual([19, 4]);
    expect(probeCalls()[1]?.params).toEqual([20, 4]);
  });

  it("leaves the general bread gate in place when the candidates catalog is not the candidates table", async () => {
    dataType = { id: 20, slug: "candidates", name: "widgets", display_name_plural: "Widgets" };
    await expect(readCandidateDetailAccess(user(), 18)).resolves.toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.params).toEqual(["candidates"]);

    dataType = { id: 20, slug: "candidates", name: "candidates", display_name_plural: "Candidates" };
    candidateColumns = ["id"];
    calls.length = 0;
    await expect(readCandidateDetailAccess(user(), 18)).resolves.toBeNull();
    expect(probeCalls()).toHaveLength(0);

    dataType = null;
    calls.length = 0;
    await expect(readCandidateDetailAccess(user(), 18)).resolves.toBeNull();
    expect(calls).toHaveLength(1);
  });
});

describe("candidate detail route", () => {
  it("does not run the redundant bread reads for a visible candidate", async () => {
    const html = await renderDetail("candidates", "18");
    expect(html).toContain("candidate-detail-18");
    expect(inside.props).toEqual([{ id: 18, stamp: false, error: undefined }]);
    expect(probeCalls()).toHaveLength(1);
    expect(calls.some((call) => call.sql.includes("FROM data_rows"))).toBe(false);
    expect(calls.some((call) => call.sql.includes("passport_no"))).toBe(false);
    expect(calls.some((call) => call.sql.includes("information_schema.columns") && !call.sql.includes("table_name ="))).toBe(false);
    expect(calls.filter((call) => call.sql.includes("FROM data_types"))).toHaveLength(1);
  });

  it("keeps the edit form arguments on the same detail route", async () => {
    const html = await renderDetail("candidates", "18", { stamp: "Y", error: "Name is required." });
    expect(html).toContain("candidate-detail-18");
    expect(inside.props).toEqual([{ id: 18, stamp: true, error: "Name is required." }]);
  });

  it("still sends the candidate edit route back to the detail page", async () => {
    const opening = EditRecordPage({
      params: Promise.resolve({ resource: "candidates", id: "18" }),
      searchParams: Promise.resolve({ stamp: "Y", error: "Name is required." }),
    });
    await expect(opening).rejects.toMatchObject({
      message: "NEXT_REDIRECT",
      url: "/records/candidates/18?stamp=Y&error=Name%20is%20required.",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("shows the same module denial and does not open the candidate", async () => {
    requireUser.mockResolvedValue(user({ roleName: "Teacher", permissions: [], candidateId: 18 }));
    const html = await renderDetail("candidates", "18");
    expect(html).toContain("You do not have access to this module.");
    expect(inside.props).toEqual([]);
    expect(probeCalls()).toHaveLength(0);
  });

  it("keeps an invisible candidate and a soft-deleted candidate off the detail page", async () => {
    requireUser.mockResolvedValue(user({ roleName: "Agent", agentId: 4, permissions: [] }));
    await expect(renderDetail("candidates", "19")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(renderDetail("candidates", "20")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(inside.props).toEqual([]);
    expect(calls.some((call) => call.sql.includes("passport_no"))).toBe(false);
    expect(calls.some((call) => call.sql.includes("FROM data_rows"))).toBe(false);
  });

  it("keeps an office browser off rows the visibility predicate excludes", async () => {
    requireUser.mockResolvedValue(user({ roleName: "Employee", permissions: ["browse_candidates"] }));
    await expect(renderDetail("candidates", "18")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(probeCalls()[0]?.sql).toContain("WHERE FALSE");
    expect(inside.props).toEqual([]);
  });

  it("rethrows a data error that is not an access denial", async () => {
    query.mockImplementation(async (sql: unknown, params?: unknown[]) => {
      const statement = compact(String(sql));
      if (statement.startsWith("SELECT t.id")) throw new Error("connection reset");
      return answer(sql, params);
    });
    await expect(renderDetail("candidates", "18")).rejects.toThrow("connection reset");
    expect(inside.props).toEqual([]);
  });

  it("keeps the general gate when the candidates catalog points at another table", async () => {
    dataType = { id: 20, slug: "candidates", name: "widgets", display_name_plural: "Widgets" };
    const html = await renderDetail("candidates", "18");
    expect(html).toContain("candidate-detail-18");
    expect(calls.some((call) => call.sql.includes("information_schema.columns") && !call.sql.includes("table_name ="))).toBe(true);
    expect(calls.some((call) => call.sql.includes("FROM data_rows"))).toBe(true);
    expect(calls.some((call) => call.sql.includes('FROM "widgets"'))).toBe(true);

    calls.length = 0;
    inside.props.length = 0;
    requireUser.mockResolvedValue(user({ roleName: "Employee", permissions: ["browse_candidates"] }));
    const denied = await renderDetail("candidates", "18");
    expect(denied).toContain("You do not have access to this module.");
    expect(inside.props).toEqual([]);
    expect(calls.some((call) => call.sql.includes('FROM "widgets"'))).toBe(false);
  });

  it("still renders another resource from its bread record", async () => {
    requireUser.mockResolvedValue(user({ roleName: "owner", permissions: ["browse_employers"] }));
    const html = await renderDetail("employers", "5");
    expect(html).toContain("Employers");
    expect(html).toContain("Employer name");
    expect(html).toContain("Northwind");
    expect(html).toContain('href="/records/employers"');
    expect(inside.props).toEqual([]);
    expect(calls.some((call) => call.sql.includes("FROM data_rows") && call.sql.includes("read = 1"))).toBe(true);
    expect(calls.some((call) => call.sql.includes("information_schema.columns") && !call.sql.includes("table_name ="))).toBe(true);
    expect(calls.some((call) => call.params[0] === "candidates")).toBe(false);
    expect(calls.some((call) => call.sql.includes('FROM "candidates"'))).toBe(false);
  });

  it("rejects an id that is not a whole number before loading access", async () => {
    await expect(renderDetail("candidates", "18.2")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(requireUser).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});
