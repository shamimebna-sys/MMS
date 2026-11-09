import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessUser } from "@/lib/auth/permissions";
import { canMutateTable } from "@/lib/auth/permissions";
import { visibilitySql } from "@/lib/auth/row-scope";
import { listingDescription } from "@/components/records/listing";
import { ARC_COLUMNS } from "@/lib/arc-records";
import {
  MONEY_RECEIPT_COLUMNS,
  MONEY_RECEIPT_FIELDS,
  canOperateMoneyReceipt,
  moneyReceiptFieldRows,
} from "@/lib/money-receipts";
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

describe("money receipt mapping", () => {
  it("keeps the legacy receipt columns and the stored payment methods", () => {
    expect(MONEY_RECEIPT_FIELDS.map((field) => field.field)).toEqual([...MONEY_RECEIPT_COLUMNS]);
    expect(MONEY_RECEIPT_FIELDS.filter((field) => field.columnRequired).map((field) => field.field)).toEqual(["id"]);
    expect(MONEY_RECEIPT_FIELDS.filter((field) => field.required && field.field !== "id").map((field) => field.field)).toEqual([
      "receipt_no",
      "received_from",
      "amount",
      "received_for",
      "receipt_date",
      "payment_method",
    ]);
    expect(MONEY_RECEIPT_FIELDS.find((field) => field.field === "invoice_id")).toMatchObject({
      type: "hidden",
      browse: true,
      add: true,
      required: false,
    });
    expect(MONEY_RECEIPT_FIELDS.find((field) => field.field === "payment_method")?.details).toMatchObject({
      default: "CASH",
      options: { Cash: "Cash", "Online Bank Transfer": "Online Bank Transfer", Cheque: "Cheque" },
    });
    expect(MONEY_RECEIPT_FIELDS.some((field) => field.field === "invoice_line_id" || field.field === "candidate_id")).toBe(false);
    expect(getResource("invoice-money-receipts")).toMatchObject({
      table: "invoice_money_receipts",
      title: "Money Receipts",
      softDelete: false,
      scope: { mode: "reference" },
      search: ["receipt_no", "received_from", "hotel", "received_for", "recipient", "transaction_no"],
    });
    expect(listingDescription("invoice-money-receipts", "Money Receipts")).toContain("saved values");
  });
});

describe("money receipt access", () => {
  const receipts = getResource("invoice-money-receipts");
  if (!receipts) throw new Error("money receipt resource missing");

  it("follows the stored Agency grants and the null Voyager scope", () => {
    const agency = user({
      roleName: "Agency",
      agencierId: 4,
      permissions: ["browse_invoice_money_receipts", "read_invoice_money_receipts", "edit_invoice_money_receipts", "add_invoice_money_receipts"],
    });
    const params: unknown[] = [];
    expect(canOperateMoneyReceipt(agency, "browse")).toBe(true);
    expect(canOperateMoneyReceipt(agency, "read")).toBe(true);
    expect(canMutateTable(agency, "invoice_money_receipts", "add")).toBe(true);
    expect(canMutateTable(agency, "invoice_money_receipts", "edit")).toBe(true);
    expect(canMutateTable(agency, "invoice_money_receipts", "delete")).toBe(false);
    expect(visibilitySql(receipts, agency, params)).toBe("TRUE");
    expect(params).toEqual([]);
  });

  it("denies a company, a candidate, and an inactive account", () => {
    const company = user({ roleName: "Company", companierId: 3, permissions: ["browse_invoices"] });
    const candidate = user({ roleName: "Candidate", candidateId: 9, permissions: [] });
    const inactive = user({
      status: "I",
      permissions: ["browse_invoice_money_receipts", "read_invoice_money_receipts", "delete_invoice_money_receipts"],
    });
    expect(canOperateMoneyReceipt(company, "browse")).toBe(false);
    expect(canMutateTable(company, "invoice_money_receipts", "add")).toBe(false);
    expect(visibilitySql(receipts, company, [])).toBe("FALSE");
    expect(canOperateMoneyReceipt(candidate, "read")).toBe(false);
    expect(canOperateMoneyReceipt(inactive, "browse")).toBe(false);
    expect(visibilitySql(receipts, inactive, [])).toBe("FALSE");
  });

  it("keeps full access on the existing role rule", () => {
    const owner = user({ roleName: "owner", permissions: [] });
    const admin = user({ roleName: "admin", permissions: [] });
    expect(visibilitySql(receipts, owner, [])).toBe("TRUE");
    expect(canOperateMoneyReceipt(owner, "read")).toBe(true);
    expect(canMutateTable(owner, "invoice_money_receipts", "delete")).toBe(true);
    expect(canOperateMoneyReceipt(admin, "read")).toBe(true);
    expect(canMutateTable(admin, "invoice_money_receipts", "delete")).toBe(true);
  });
});

describe("money receipt form fallback", () => {
  beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async (sql: unknown) => {
      const statement = String(sql).replace(/\s+/g, " ");
      if (statement.includes("FROM data_types")) return { rows: [], rowCount: 0 };
      if (statement.includes("information_schema.columns")) {
        const receiptRows = MONEY_RECEIPT_COLUMNS.map((column_name) => ({
          table_name: "invoice_money_receipts",
          column_name,
          data_type: column_name === "amount" ? "numeric" : column_name === "receipt_date" ? "date" : column_name.endsWith("_id") || column_name === "id" ? "integer" : "character varying",
        }));
        const arcRows = ARC_COLUMNS.map((column_name) => ({
          table_name: "arcs",
          column_name,
          data_type: column_name.endsWith("_date") ? "date" : column_name.endsWith("_id") || column_name === "id" ? "integer" : "character varying",
        }));
        const rows = [...receiptRows, ...arcRows];
        return { rows, rowCount: rows.length };
      }
      if (statement.includes("FROM data_rows")) throw new Error("synthetic money receipt form must not read data_rows");
      return { rows: [], rowCount: 0 };
    });
  });

  it("builds the add form from the legacy field list when the data type row is absent", async () => {
    const { loadBreadForm } = await import("@/server/bread-form");
    const form = await loadBreadForm(
      "invoice-money-receipts",
      "add",
      null,
      user({ roleName: "Agency", agencierId: 4, permissions: ["add_invoice_money_receipts"] }),
    );
    expect(form?.title).toBe("Money Receipt");
    expect(form?.fields.map((field) => [field.name, field.input, field.required, field.value])).toEqual([
      ["receipt_no", "text", true, ""],
      ["received_from", "text", true, ""],
      ["hotel", "text", false, ""],
      ["amount", "number", true, ""],
      ["received_for", "text", true, ""],
      ["receipt_date", "date", true, ""],
      ["recipient", "text", false, ""],
      ["payment_method", "select", true, "CASH"],
      ["transaction_no", "text", false, ""],
    ]);
    expect(form?.fields.find((field) => field.name === "payment_method")?.options).toEqual([
      { value: "Cash", label: "Cash" },
      { value: "Online Bank Transfer", label: "Online Bank Transfer" },
      { value: "Cheque", label: "Cheque" },
    ]);
    expect(moneyReceiptFieldRows("browse").some((field) => field.field === "created_at")).toBe(false);
  });

  it("routes synthetic Money Receipt lists to receipt fields and ARC lists to ARC fields", async () => {
    const { listBread } = await import("@/server/browse");
    const viewer = user({ roleName: "sadmin", permissions: [] });
    const receipts = await listBread(viewer, "invoice-money-receipts", "", 1, null);
    const arcs = await listBread(viewer, "arcs", "", 1, null);
    expect(receipts?.columns.map((column) => column.label)).toEqual([
      "Receipt No",
      "Received From",
      "Hotel",
      "Amount",
      "Received For",
      "Receipt Date",
      "Recipient",
      "Payment Method",
      "A/C No. Or Transaction No.",
    ]);
    expect(arcs?.columns.map((column) => column.label)).toEqual([
      "ARC No.",
      "Issue Date",
      "Expire Date",
      "Is Lifetime",
      "Status",
      "ACR File",
    ]);
    expect(receipts?.columns.map((column) => column.label)).not.toContain("ARC No.");
    expect(arcs?.columns.map((column) => column.label)).not.toContain("Receipt No");
  });
});
