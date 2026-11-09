import { createElement, forwardRef, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessUser } from "@/lib/auth/permissions";
import { canMutateTable } from "@/lib/auth/permissions";
import { ARC_COLUMNS, ARC_FIELDS, arcFieldRows, canOperateArc } from "@/lib/arc-records";
import { LIVE_STATUS_CASE, LIVE_STATUS_ORDER } from "@/lib/candidate-live-status";
import { visibilitySql } from "@/lib/auth/row-scope";
import { listingDescription } from "@/components/records/listing";
import { BreadTable } from "@/components/records/bread-table";
import { getResource } from "@/server/resources";

vi.mock("next/link", () => ({
  default: forwardRef<HTMLAnchorElement, { href: string; children?: ReactNode; scroll?: boolean }>(function Link({ href, children, scroll: _scroll, ...props }, ref) {
    return createElement("a", { ...props, href, ref }, children);
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/records/arcs",
  useSearchParams: () => new URLSearchParams("candidate=1233"),
}));

const query = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  pool: { query },
}));

const user = (overrides: Partial<AccessUser> = {}): AccessUser => ({
  id: 7,
  name: "Staff",
  roleName: "Employee",
  permissions: [],
  agentId: null,
  subAgentId: null,
  candidateId: null,
  agencierId: null,
  companierId: null,
  status: "A",
  ...overrides,
});

describe("ARC record mapping", () => {
  it("keeps the legacy arcs columns and does not add a flight field", () => {
    expect(ARC_FIELDS.map((field) => field.field).sort()).toEqual([...ARC_COLUMNS].sort());
    expect(ARC_FIELDS.filter((field) => field.browse).map((field) => field.field)).toEqual([
      "arc_number",
      "issue_date",
      "expire_date",
      "is_lifetime",
      "status",
      "acr_file_path",
    ]);
    expect(ARC_FIELDS.find((field) => field.field === "candidate_id")).toMatchObject({ type: "hidden", browse: false, read: true });
    expect(ARC_FIELDS.find((field) => field.field === "is_lifetime")?.details).toMatchObject({
      default: "N",
      options: { N: "No", Y: "Yes" },
    });
    expect(ARC_FIELDS.find((field) => field.field === "status")?.details).toMatchObject({
      default: "A",
      options: { A: "Active", I: "Inactive" },
    });
    expect(ARC_FIELDS.some((field) => /flight/i.test(field.field))).toBe(false);
    expect(getResource("arcs")).toMatchObject({
      table: "arcs",
      title: "Arcs",
      softDelete: false,
      scope: { mode: "candidate-child", column: "candidate_id" },
      search: ["arc_number", "is_lifetime", "status"],
    });
  });

  it("keeps ARC out of the candidate live-status expression", () => {
    expect(LIVE_STATUS_ORDER).not.toContain("ARC");
    expect(LIVE_STATUS_CASE).not.toContain("arcs");
    expect(LIVE_STATUS_CASE).toContain("FROM flight_schedules f");
    expect(listingDescription("arcs", "Arcs")).toContain("not the Flight live-status step");
  });
});

describe("ARC access", () => {
  const arcs = getResource("arcs");
  if (!arcs) throw new Error("arcs resource missing");

  it("lets an agent browse, add, and edit only their candidates, and denies read and delete", () => {
    const agent = user({
      roleName: "Agent",
      agentId: 4,
      permissions: ["browse_arcs", "add_arcs", "edit_arcs"],
    });
    const params: unknown[] = [];
    expect(canOperateArc(agent, "browse")).toBe(true);
    expect(canOperateArc(agent, "read")).toBe(false);
    expect(canMutateTable(agent, "arcs", "add")).toBe(true);
    expect(canMutateTable(agent, "arcs", "edit")).toBe(true);
    expect(canMutateTable(agent, "arcs", "delete")).toBe(false);
    expect(visibilitySql(arcs, agent, params)).toBe(
      `"candidate_id" IN (SELECT id FROM candidates WHERE deleted_at IS NULL AND "agent_id" = $1)`,
    );
    expect(params).toEqual([4]);
  });

  it("denies a company, a candidate without a grant, and an inactive account", () => {
    const company = user({ roleName: "Company", companierId: 3, permissions: ["browse_candidates"] });
    const candidate = user({ roleName: "Candidate", candidateId: 9, permissions: [] });
    const inactive = user({ status: "I", permissions: ["browse_arcs", "read_arcs", "delete_arcs"] });
    expect(canOperateArc(company, "browse")).toBe(false);
    expect(canMutateTable(company, "arcs", "add")).toBe(false);
    expect(canOperateArc(candidate, "read")).toBe(false);
    expect(canOperateArc(inactive, "browse")).toBe(false);
    expect(canMutateTable(inactive, "arcs", "delete")).toBe(false);
  });

  it("keeps an office role from seeing every ARC row, and keeps full access on the existing rule", () => {
    const employee = user({
      permissions: ["browse_candidates", "browse_arcs", "read_arcs", "edit_arcs", "add_arcs", "delete_arcs"],
    });
    const owner = user({ roleName: "owner", permissions: [] });
    const admin = user({ roleName: "admin", permissions: [] });
    expect(visibilitySql(arcs, employee, [])).toBe("FALSE");
    expect(visibilitySql(arcs, owner, [])).toBe("TRUE");
    expect(canOperateArc(admin, "read")).toBe(true);
    expect(canMutateTable(admin, "arcs", "delete")).toBe(true);
    const child: unknown[] = [];
    expect(visibilitySql(arcs, user({ roleName: "Candidate", candidateId: 9, permissions: ["browse_arcs"] }), child)).toBe(
      `"candidate_id" = $1`,
    );
    expect(child).toEqual([9]);
  });
});

describe("ARC listing", () => {
  const bread = {
    title: "Arcs",
    slug: "arcs",
    table: "arcs",
    columns: [
      { key: "c0", label: "ARC No." },
      { key: "c1", label: "Issue Date" },
      { key: "c2", label: "Expire Date" },
      { key: "c3", label: "Is Lifetime" },
      { key: "c4", label: "Status" },
      { key: "c5", label: "ACR File" },
    ],
    rows: [
      {
        id: 5,
        cells: {
          c0: "0582052528",
          c1: "2025-07-24",
          c2: "",
          c3: "Y",
          c4: "Active",
          c5: '[{"download_link":"arcs/July2025/file.pdf","original_name":"AISHA AKTER.pdf"}]',
        },
      },
    ],
    total: 1,
    page: 1,
    pageSize: 10,
  };

  it("renders the stored ARC values and keeps the file off the Flight step", () => {
    const html = renderToStaticMarkup(
      createElement(BreadTable, {
        bread,
        q: "",
        candidate: "1233",
        canCreate: false,
        canEdit: true,
        canDelete: false,
        canView: true,
        linkRows: true,
      }),
    );
    expect(html).toContain("Arcs");
    expect(html).toContain("ARC No.");
    expect(html).toContain("0582052528");
    expect(html).toContain("Y");
    expect(html).toContain("Active");
    expect(html).toContain("AISHA AKTER.pdf");
    expect(html).toContain("/records/arcs/5");
    expect(html).not.toContain("Flight schedule");
    expect(html).not.toContain("airlinece_name");
  });

  it("hides the record view when read_arcs is not granted", () => {
    const html = renderToStaticMarkup(
      createElement(BreadTable, {
        bread,
        q: "",
        candidate: "1233",
        canCreate: true,
        canEdit: true,
        canDelete: false,
        canView: false,
        linkRows: true,
      }),
    );
    expect(html).not.toContain("/records/arcs/5");
    expect(html).not.toContain("View");
    expect(html).toContain("Edit");
    expect(html).not.toContain("Delete");
  });
});

describe("ARC form fallback", () => {
  beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async (sql: unknown) => {
      const statement = String(sql).replace(/\s+/g, " ");
      if (statement.includes("FROM data_types")) return { rows: [], rowCount: 0 };
      if (statement.includes("information_schema.columns")) {
        const rows = ARC_COLUMNS.map((column_name) => ({
          table_name: "arcs",
          column_name,
          data_type: column_name.endsWith("_date") ? "date" : column_name === "candidate_id" || column_name === "id" ? "integer" : "character varying",
        }));
        return { rows, rowCount: rows.length };
      }
      if (statement.includes("FROM data_rows")) throw new Error("synthetic ARC form must not read data_rows");
      return { rows: [], rowCount: 0 };
    });
  });

  it("builds the add form from the legacy field list when the data type row is absent", async () => {
    const { loadBreadForm } = await import("@/server/bread-form");
    const form = await loadBreadForm("arcs", "add", null, user({ roleName: "sadmin", permissions: ["add_arcs"] }));
    expect(form?.title).toBe("Arc");
    expect(form?.fields.map((field) => [field.name, field.input, field.value])).toEqual([
      ["arc_number", "text", ""],
      ["issue_date", "date", ""],
      ["expire_date", "date", ""],
      ["is_lifetime", "select", "N"],
      ["status", "select", "A"],
      ["acr_file_path", "file", ""],
    ]);
    expect(form?.fields.find((field) => field.name === "is_lifetime")?.options).toEqual([
      { value: "N", label: "No" },
      { value: "Y", label: "Yes" },
    ]);
    expect(form?.fields.find((field) => field.name === "status")?.options).toEqual([
      { value: "A", label: "Active" },
      { value: "I", label: "Inactive" },
    ]);
    expect(form?.fields.some((field) => field.name === "candidate_id" || field.name.includes("flight"))).toBe(false);
    expect(arcFieldRows("add").map((field) => field.field)).toContain("candidate_id");
  });
});
