import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessUser } from "@/lib/auth/permissions";
import { canMutateTable } from "@/lib/auth/permissions";
import { visibilitySql } from "@/lib/auth/row-scope";
import { listingDescription } from "@/components/records/listing";
import {
  EURO_TO_BDT_RATE_COLUMNS,
  EURO_TO_BDT_RATE_FIELDS,
  canOperateEuroToBdtRate,
  euroToBdtRateFieldRows,
} from "@/lib/euro-to-bdt-rates";
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

describe("euro to BDT rate mapping", () => {
  it("keeps the legacy columns, labels, and browse flags", () => {
    expect(EURO_TO_BDT_RATE_FIELDS.map((field) => field.field)).toEqual([...EURO_TO_BDT_RATE_COLUMNS]);
    expect(EURO_TO_BDT_RATE_FIELDS.filter((field) => field.columnRequired).map((field) => field.field)).toEqual(["id"]);
    expect(EURO_TO_BDT_RATE_FIELDS.find((field) => field.field === "euro_rate")).toMatchObject({
      type: "number",
      displayName: "Euro Rate (1 EUR = ? BDT)",
      required: false,
      browse: true,
      read: true,
      edit: true,
      add: true,
      details: { display: { width: "3" } },
    });
    expect(EURO_TO_BDT_RATE_FIELDS.find((field) => field.field === "created_at")).toMatchObject({
      browse: true,
      read: false,
      edit: false,
      add: false,
      delete: false,
    });
    expect(EURO_TO_BDT_RATE_FIELDS.filter((field) => field.type === "hidden").map((field) => field.field)).toEqual(["created_by", "updated_by"]);
    expect(getResource("euro-to-bdt-rates")).toMatchObject({
      table: "euro_to_bdt_rates",
      title: "Euro To BDT Rates",
      softDelete: false,
      scope: { mode: "reference" },
      columns: ["id", "conversion_date", "euro_rate", "created_at"],
      search: [],
    });
    expect(listingDescription("euro-to-bdt-rates", "Euro To BDT Rates")).toContain("euro to BDT");
  });
});

describe("euro to BDT rate access", () => {
  const rates = getResource("euro-to-bdt-rates");
  if (!rates) throw new Error("euro to BDT rate resource missing");

  it("follows the stored owner and sadmin keys without a party filter", () => {
    const granted = user({
      roleName: "Employee",
      permissions: ["browse_candidates", "browse_euro_to_bdt_rates", "edit_euro_to_bdt_rates", "add_euro_to_bdt_rates"],
    });
    const teacher = user({ roleName: "Teacher", permissions: [] });
    const inactive = user({ roleName: "owner", status: "I", permissions: ["browse_euro_to_bdt_rates"] });
    expect(canOperateEuroToBdtRate(granted, "browse")).toBe(true);
    expect(canOperateEuroToBdtRate(granted, "edit")).toBe(true);
    expect(canOperateEuroToBdtRate(granted, "add")).toBe(true);
    expect(canOperateEuroToBdtRate(granted, "read")).toBe(false);
    expect(canOperateEuroToBdtRate(granted, "delete")).toBe(false);
    expect(visibilitySql(rates, granted, [])).toBe("TRUE");
    expect(canOperateEuroToBdtRate(teacher, "browse")).toBe(false);
    expect(canOperateEuroToBdtRate(inactive, "browse")).toBe(false);
    expect(visibilitySql(rates, inactive, [])).toBe("FALSE");
  });

  it("keeps full access on the existing role rule", () => {
    const owner = user({ roleName: "owner", permissions: [] });
    const admin = user({ roleName: "admin", permissions: [] });
    const sadmin = user({ roleName: "sadmin", permissions: [] });
    expect(visibilitySql(rates, owner, [])).toBe("TRUE");
    expect(canOperateEuroToBdtRate(owner, "read")).toBe(true);
    expect(canMutateTable(owner, "euro_to_bdt_rates", "delete")).toBe(true);
    expect(canOperateEuroToBdtRate(admin, "browse")).toBe(true);
    expect(canOperateEuroToBdtRate(sadmin, "delete")).toBe(true);
  });
});

describe("euro to BDT rate form fallback", () => {
  beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async (sql: unknown) => {
      const statement = String(sql).replace(/\s+/g, " ");
      if (statement.includes("FROM data_types")) return { rows: [], rowCount: 0 };
      if (statement.includes("information_schema.columns")) {
        const rows = [
          ["id", "integer"],
          ["conversion_date", "date"],
          ["euro_rate", "numeric"],
          ["updated_at", "timestamp without time zone"],
          ["created_by", "integer"],
          ["updated_by", "integer"],
          ["created_at", "timestamp without time zone"],
          ["ref_link", "character varying"],
          ["description", "character varying"],
        ].map(([column_name, data_type]) => ({ table_name: "euro_to_bdt_rates", column_name, data_type }));
        return { rows, rowCount: rows.length };
      }
      if (statement.includes("FROM data_rows")) throw new Error("synthetic euro rate form must not read data_rows");
      return { rows: [], rowCount: 0 };
    });
  });

  it("builds the add form from the legacy field list when the data type row is absent", async () => {
    const { loadBreadForm } = await import("@/server/bread-form");
    const form = await loadBreadForm("euro-to-bdt-rates", "add", null, user({ roleName: "owner" }));
    expect(form?.title).toBe("Euro To BDT Rate");
    expect(form?.fields.map((field) => [field.name, field.input, field.required, field.value])).toEqual([
      ["conversion_date", "date", false, ""],
      ["euro_rate", "number", false, ""],
      ["ref_link", "text", false, ""],
      ["description", "textarea", false, ""],
    ]);
    expect(euroToBdtRateFieldRows("browse").map((field) => field.display_name)).toEqual([
      "Conversion Date",
      "Euro Rate (1 EUR = ? BDT)",
      "Created At",
    ]);
    expect(euroToBdtRateFieldRows("read").map((field) => field.display_name)).toEqual([
      "Conversion Date",
      "Euro Rate (1 EUR = ? BDT)",
      "Ref. Link",
      "Description",
    ]);
  });

  it("lists the browse columns and leaves the reference link off the list", async () => {
    const { listBread } = await import("@/server/browse");
    const listed = await listBread(user({ roleName: "sadmin" }), "euro-to-bdt-rates", "", 1, null);
    expect(listed?.columns.map((column) => column.label)).toEqual([
      "Conversion Date",
      "Euro Rate (1 EUR = ? BDT)",
      "Created At",
    ]);
    expect(listed?.columns.map((column) => column.label)).not.toContain("Ref. Link");
    expect(listed?.columns.map((column) => column.label)).not.toContain("Description");
  });
});
