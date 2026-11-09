import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessUser } from "@/lib/auth/permissions";
import { canMutateTable } from "@/lib/auth/permissions";
import { visibilitySql } from "@/lib/auth/row-scope";
import { listingDescription } from "@/components/records/listing";
import { CURRENCY_COLUMNS } from "@/lib/currencies";
import {
  TICKET_INVOICE_MONEY_RECEIPT_COLUMNS,
  TICKET_INVOICE_MONEY_RECEIPT_FIELDS,
  canOperateTicketInvoiceMoneyReceipt,
  ticketInvoiceMoneyReceiptFieldRows,
} from "@/lib/ticket-invoice-money-receipts";
import { getResource } from "@/server/resources";

const query = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  pool: { query },
}));

vi.mock("@/server/audit", () => ({
  writeAudit: vi.fn(async () => undefined),
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

describe("ticket invoice money receipt mapping", () => {
  it("keeps the legacy receipt columns, hidden parent, and stored payment methods", () => {
    expect(TICKET_INVOICE_MONEY_RECEIPT_FIELDS.map((field) => field.field)).toEqual([...TICKET_INVOICE_MONEY_RECEIPT_COLUMNS]);
    expect(TICKET_INVOICE_MONEY_RECEIPT_FIELDS.filter((field) => field.columnRequired).map((field) => field.field)).toEqual(["id"]);
    expect(TICKET_INVOICE_MONEY_RECEIPT_FIELDS.filter((field) => field.required && field.field !== "id").map((field) => field.field)).toEqual([
      "receipt_no",
      "received_from",
      "amount",
      "received_for",
      "receipt_date",
      "payment_method",
    ]);
    expect(TICKET_INVOICE_MONEY_RECEIPT_FIELDS.find((field) => field.field === "ticket_invoice_id")).toMatchObject({
      type: "hidden",
      displayName: "Ticket Invoice Id",
      browse: true,
      add: true,
      required: false,
    });
    expect(TICKET_INVOICE_MONEY_RECEIPT_FIELDS.find((field) => field.field === "hotel")).toMatchObject({
      type: "hidden",
      browse: false,
      read: true,
      add: true,
    });
    expect(TICKET_INVOICE_MONEY_RECEIPT_FIELDS.find((field) => field.field === "remarks")).toMatchObject({
      type: "hidden",
      browse: false,
      read: true,
    });
    expect(TICKET_INVOICE_MONEY_RECEIPT_FIELDS.find((field) => field.field === "created_at")).toMatchObject({
      browse: true,
      read: true,
      edit: true,
      add: false,
    });
    expect(TICKET_INVOICE_MONEY_RECEIPT_FIELDS.find((field) => field.field === "payment_method")?.details).toMatchObject({
      default: "CASH",
      options: { Cash: "Cash", "Online Bank Transfer": "Online Bank Transfer", Cheque: "Cheque" },
    });
    expect(getResource("ticket-invoice-money-receipts")).toMatchObject({
      table: "ticket_invoice_money_receipts",
      title: "Ticket Invoice Money Receipts",
      softDelete: false,
      scope: { mode: "reference" },
      columns: ["id", "ticket_invoice_id", "receipt_no", "received_from", "amount", "received_for", "receipt_date", "recipient", "created_at", "payment_method", "transaction_no"],
      search: ["receipt_no", "received_from", "received_for", "recipient", "transaction_no"],
    });
    expect(listingDescription("ticket-invoice-money-receipts", "Ticket Invoice Money Receipts")).toContain("saved values");
  });
});

describe("ticket invoice money receipt access", () => {
  const receipts = getResource("ticket-invoice-money-receipts");
  if (!receipts) throw new Error("ticket invoice money receipt resource missing");

  it("follows the stored keys and the null Voyager scope", () => {
    const granted = user({
      roleName: "Employee",
      permissions: [
        "browse_candidates",
        "browse_ticket_invoice_money_receipts",
        "read_ticket_invoice_money_receipts",
        "edit_ticket_invoice_money_receipts",
        "add_ticket_invoice_money_receipts",
        "delete_ticket_invoice_money_receipts",
      ],
    });
    const browseOnly = user({
      roleName: "Employee",
      permissions: ["browse_candidates", "browse_ticket_invoice_money_receipts"],
    });
    const agency = user({
      roleName: "Agency",
      agencierId: 4,
      permissions: ["browse_ticket_invoice_money_receipts", "read_ticket_invoice_money_receipts"],
    });
    const agent = user({ roleName: "Agent", agentId: 4, permissions: ["browse_ticket_invoice_money_receipts"] });
    const params: unknown[] = [];
    expect(canOperateTicketInvoiceMoneyReceipt(granted, "browse")).toBe(true);
    expect(canOperateTicketInvoiceMoneyReceipt(granted, "read")).toBe(true);
    expect(canMutateTable(granted, "ticket_invoice_money_receipts", "edit")).toBe(true);
    expect(canOperateTicketInvoiceMoneyReceipt(browseOnly, "read")).toBe(false);
    expect(canMutateTable(browseOnly, "ticket_invoice_money_receipts", "add")).toBe(false);
    expect(visibilitySql(receipts, granted, params)).toBe("TRUE");
    expect(params).toEqual([]);
    const agencyParams: unknown[] = [];
    expect(visibilitySql(receipts, agency, agencyParams)).toBe("TRUE");
    expect(agencyParams).toEqual([]);
    expect(visibilitySql(receipts, agent, [])).toBe("TRUE");
  });

  it("denies a company, a candidate, and an inactive account", () => {
    const company = user({ roleName: "Company", companierId: 3, permissions: ["browse_ticket_invoices"] });
    const candidate = user({ roleName: "Candidate", candidateId: 9, permissions: [] });
    const inactive = user({
      status: "I",
      permissions: ["browse_ticket_invoice_money_receipts", "read_ticket_invoice_money_receipts"],
    });
    expect(canOperateTicketInvoiceMoneyReceipt(company, "browse")).toBe(false);
    expect(canMutateTable(company, "ticket_invoice_money_receipts", "add")).toBe(false);
    expect(visibilitySql(receipts, company, [])).toBe("FALSE");
    expect(canOperateTicketInvoiceMoneyReceipt(candidate, "read")).toBe(false);
    expect(canOperateTicketInvoiceMoneyReceipt(inactive, "browse")).toBe(false);
    expect(visibilitySql(receipts, inactive, [])).toBe("FALSE");
  });

  it("keeps full access on the existing role rule", () => {
    const owner = user({ roleName: "owner", permissions: [] });
    const admin = user({ roleName: "admin", permissions: [] });
    const sadmin = user({ roleName: "sadmin", permissions: [] });
    expect(visibilitySql(receipts, owner, [])).toBe("TRUE");
    expect(canOperateTicketInvoiceMoneyReceipt(owner, "read")).toBe(true);
    expect(canMutateTable(owner, "ticket_invoice_money_receipts", "edit")).toBe(true);
    expect(canOperateTicketInvoiceMoneyReceipt(admin, "browse")).toBe(true);
    expect(canMutateTable(sadmin, "ticket_invoice_money_receipts", "delete")).toBe(true);
  });
});

describe("ticket invoice money receipt form fallback", () => {
  beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async (sql: unknown) => {
      const statement = String(sql).replace(/\s+/g, " ");
      if (statement.includes("FROM data_types")) return { rows: [], rowCount: 0 };
      if (statement.includes("information_schema.columns")) {
        const receiptRows = TICKET_INVOICE_MONEY_RECEIPT_COLUMNS.map((column_name) => ({
          table_name: "ticket_invoice_money_receipts",
          column_name,
          data_type:
            column_name === "amount"
              ? "numeric"
              : column_name === "receipt_date"
                ? "date"
                : column_name.endsWith("_at")
                  ? "timestamp with time zone"
                  : column_name.endsWith("_id") || column_name === "id"
                    ? "integer"
                    : "character varying",
        }));
        const currencyRows = CURRENCY_COLUMNS.map((column_name) => ({
          table_name: "currencies",
          column_name,
          data_type: "character varying",
        }));
        const rows = [...receiptRows, ...currencyRows];
        return { rows, rowCount: rows.length };
      }
      if (statement.includes("FROM data_rows")) throw new Error("synthetic ticket receipt form must not read data_rows");
      if (statement.includes("INSERT INTO")) return { rows: [{ id: 41 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
  });

  it("builds the add form from the legacy field list when the data type row is absent", async () => {
    const { loadBreadForm } = await import("@/server/bread-form");
    const form = await loadBreadForm(
      "ticket-invoice-money-receipts",
      "add",
      null,
      user({ roleName: "owner", permissions: [] }),
    );
    expect(form?.title).toBe("Ticket Invoice Money Receipt");
    expect(form?.fields.map((field) => [field.name, field.input, field.required, field.value])).toEqual([
      ["receipt_no", "text", true, ""],
      ["received_from", "text", true, ""],
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
    expect(form?.fields.map((field) => field.name)).not.toContain("hotel");
    expect(form?.fields.map((field) => field.name)).not.toContain("remarks");
    expect(form?.fields.map((field) => field.name)).not.toContain("created_at");
    expect(ticketInvoiceMoneyReceiptFieldRows("browse").map((field) => field.field)).toContain("created_at");
    expect(ticketInvoiceMoneyReceiptFieldRows("add").map((field) => field.field)).not.toContain("created_at");
    expect(ticketInvoiceMoneyReceiptFieldRows("edit").map((field) => field.field)).toContain("created_at");
    expect(ticketInvoiceMoneyReceiptFieldRows("edit").map((field) => field.field)).not.toContain("updated_at");
  });

  it("lists the browse columns and keeps a currency list on its own fields", async () => {
    const { listBread } = await import("@/server/browse");
    const viewer = user({ roleName: "sadmin" });
    const receipts = await listBread(viewer, "ticket-invoice-money-receipts", "", 1, null);
    const currencies = await listBread(viewer, "currencies", "", 1, null);
    expect(receipts?.columns.map((column) => column.label)).toEqual([
      "Receipt No",
      "Received From",
      "Amount",
      "Received For",
      "Receipt Date",
      "Recipient",
      "Created At",
      "Payment Method",
      "Transaction No",
    ]);
    expect(receipts?.columns.map((column) => column.label)).not.toContain("Hotel");
    expect(receipts?.columns.map((column) => column.label)).not.toContain("Remarks");
    expect(currencies?.columns.map((column) => column.label)).toContain("Full Name");
    expect(currencies?.columns.map((column) => column.label)).not.toContain("Receipt No");
    const statements = query.mock.calls.map((call) => String(call[0]));
    const listSql = statements.find((statement) => statement.includes("FROM \"ticket_invoice_money_receipts\" t"));
    expect(listSql).toContain("TRUE");
    expect(listSql).not.toContain("agent_id");
    await expect(listBread(user({ roleName: "Teacher" }), "ticket-invoice-money-receipts", "", 1, null)).rejects.toThrow(/access/i);
  });

  it("stores the posted ticket invoice id with the receipt", async () => {
    const { saveBreadRecord } = await import("@/server/bread-form");
    const saved = await saveBreadRecord(
      user({ roleName: "sadmin" }),
      "ticket-invoice-money-receipts",
      null,
      {
        receipt_no: "1",
        received_from: "DIKALO AGENCY",
        amount: "1510",
        received_for: "Ticket",
        receipt_date: "2026-02-02",
        payment_method: "Cash",
        ticket_invoice_id: "6",
      },
      null,
    );
    expect(saved).toBe(41);
    const insert = query.mock.calls.find((call) => String(call[0]).includes("INSERT INTO"));
    expect(insert).toBeTruthy();
    const sql = String(insert?.[0]);
    const params = insert?.[1] as unknown[];
    expect(sql).toContain("\"ticket_invoice_id\"");
    expect(params).toContain(6);
    expect(sql).not.toContain("\"hotel\"");
    expect(sql).not.toContain("\"remarks\"");
  });
});
