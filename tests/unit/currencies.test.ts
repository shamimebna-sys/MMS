import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessUser } from "@/lib/auth/permissions";
import { canMutateTable } from "@/lib/auth/permissions";
import { visibilitySql } from "@/lib/auth/row-scope";
import { listingDescription } from "@/components/records/listing";
import { CURRENCY_COLUMNS, CURRENCY_FIELDS, canOperateCurrency, currencyFieldRows } from "@/lib/currencies";
import { getResource } from "@/server/resources";

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

describe("currency mapping", () => {
  it("keeps the legacy columns, labels, and dropdowns", () => {
    expect(CURRENCY_FIELDS.map((field) => field.field)).toEqual([...CURRENCY_COLUMNS]);
    expect(CURRENCY_FIELDS.filter((field) => field.columnRequired).map((field) => field.field)).toEqual(["id", "full_name"]);
    expect(CURRENCY_FIELDS.find((field) => field.field === "full_name")).toMatchObject({
      type: "text",
      displayName: "Full Name",
      required: true,
      browse: true,
      details: { display: { width: "6" } },
    });
    expect(CURRENCY_FIELDS.find((field) => field.field === "position")).toMatchObject({
      type: "select_dropdown",
      displayName: "Place",
      required: false,
      details: { default: "A", options: { A: "After Amount", B: "Before Amount" } },
    });
    expect(CURRENCY_FIELDS.find((field) => field.field === "status")).toMatchObject({
      type: "select_dropdown",
      displayName: "Status",
      details: { default: "A", options: { A: "Active", I: "Inactive" } },
    });
    expect(CURRENCY_FIELDS.find((field) => field.field === "created_at")).toMatchObject({
      browse: false,
      read: false,
      edit: false,
      add: false,
    });
    expect(getResource("currencies")).toMatchObject({
      table: "currencies",
      title: "Currencies",
      softDelete: false,
      scope: { mode: "reference" },
      columns: ["id", "full_name", "short_name", "symbol", "position", "status"],
      search: ["full_name", "short_name", "symbol"],
    });
    expect(listingDescription("currencies", "Currencies")).toContain("currencies");
  });
});

describe("currency access", () => {
  const currencies = getResource("currencies");
  if (!currencies) throw new Error("currency resource missing");

  it("follows the stored currency keys and keeps the rows shared", () => {
    const granted = user({
      roleName: "Employee",
      permissions: ["browse_candidates", "browse_currencies", "read_currencies", "edit_currencies", "add_currencies", "delete_currencies"],
    });
    const browseOnly = user({
      roleName: "Employee",
      permissions: ["browse_candidates", "browse_currencies"],
    });
    const teacher = user({ roleName: "Teacher", permissions: [] });
    const inactive = user({ roleName: "sadmin", status: "I", permissions: ["browse_currencies"] });
    const agent = user({ roleName: "Agent", agentId: 4, permissions: ["browse_currencies"] });
    expect(canOperateCurrency(granted, "browse")).toBe(true);
    expect(canOperateCurrency(granted, "read")).toBe(true);
    expect(canOperateCurrency(granted, "edit")).toBe(true);
    expect(canOperateCurrency(granted, "add")).toBe(true);
    expect(canOperateCurrency(granted, "delete")).toBe(true);
    expect(canOperateCurrency(browseOnly, "browse")).toBe(true);
    expect(canOperateCurrency(browseOnly, "read")).toBe(false);
    expect(canOperateCurrency(browseOnly, "add")).toBe(false);
    expect(visibilitySql(currencies, granted, [])).toBe("TRUE");
    expect(visibilitySql(currencies, agent, [])).toBe("TRUE");
    expect(canOperateCurrency(teacher, "browse")).toBe(false);
    expect(canOperateCurrency(inactive, "browse")).toBe(false);
    expect(visibilitySql(currencies, inactive, [])).toBe("FALSE");
  });

  it("keeps full access on the existing role rule", () => {
    const owner = user({ roleName: "owner", permissions: [] });
    const admin = user({ roleName: "admin", permissions: [] });
    const sadmin = user({ roleName: "sadmin", permissions: [] });
    expect(visibilitySql(currencies, owner, [])).toBe("TRUE");
    expect(canOperateCurrency(owner, "read")).toBe(true);
    expect(canMutateTable(owner, "currencies", "delete")).toBe(true);
    expect(canOperateCurrency(admin, "browse")).toBe(true);
    expect(canOperateCurrency(sadmin, "delete")).toBe(true);
  });
});

describe("currency form fallback", () => {
  beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async (sql: unknown) => {
      const statement = String(sql).replace(/\s+/g, " ");
      if (statement.includes("FROM data_types")) return { rows: [], rowCount: 0 };
      if (statement.includes("information_schema.columns")) {
        const rows = [
          ["id", "integer"],
          ["full_name", "character varying"],
          ["status", "character"],
          ["created_at", "timestamp without time zone"],
          ["updated_at", "timestamp without time zone"],
          ["short_name", "character varying"],
          ["symbol", "character varying"],
          ["position", "character varying"],
        ].map(([column_name, data_type]) => ({ table_name: "currencies", column_name, data_type }));
        return { rows, rowCount: rows.length };
      }
      if (statement.includes("FROM data_rows")) throw new Error("synthetic currency form must not read data_rows");
      return { rows: [], rowCount: 0 };
    });
  });

  it("builds the add form from the legacy field list when the data type row is absent", async () => {
    const { loadBreadForm } = await import("@/server/bread-form");
    const form = await loadBreadForm("currencies", "add", null, user({ roleName: "owner" }));
    expect(form?.title).toBe("Currency");
    expect(form?.fields.map((field) => [field.name, field.input, field.required, field.value])).toEqual([
      ["full_name", "text", true, ""],
      ["short_name", "text", false, ""],
      ["symbol", "text", false, ""],
      ["position", "select", false, "A"],
      ["status", "select", false, "A"],
    ]);
    expect(form?.fields.find((field) => field.name === "position")?.options).toEqual([
      { value: "A", label: "After Amount" },
      { value: "B", label: "Before Amount" },
    ]);
    expect(form?.fields.find((field) => field.name === "status")?.options).toEqual([
      { value: "A", label: "Active" },
      { value: "I", label: "Inactive" },
    ]);
    expect(currencyFieldRows("browse").map((field) => field.display_name)).toEqual([
      "Full Name",
      "Short Name",
      "Symbol",
      "Place",
      "Status",
    ]);
    expect(currencyFieldRows("read").map((field) => field.display_name)).toEqual([
      "Full Name",
      "Short Name",
      "Symbol",
      "Place",
      "Status",
    ]);
  });

  it("lists the browse columns and does not filter an agent by party", async () => {
    const { listBread } = await import("@/server/browse");
    const listed = await listBread(user({ roleName: "sadmin" }), "currencies", "", 1, null);
    expect(listed?.columns.map((column) => column.label)).toEqual([
      "Full Name",
      "Short Name",
      "Symbol",
      "Place",
      "Status",
    ]);
    expect(listed?.columns.map((column) => column.label)).not.toContain("Created At");
    const statements = query.mock.calls.map((call) => String(call[0]));
    const listSql = statements.find((statement) => statement.includes("FROM \"currencies\" t"));
    expect(listSql).toContain("TRUE");
    expect(listSql).not.toContain("agent_id");
    await expect(listBread(user({ roleName: "Teacher" }), "currencies", "", 1, null)).rejects.toThrow(/access/i);
  });
});
