import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessUser } from "@/lib/auth/permissions";
import { canMutateTable } from "@/lib/auth/permissions";
import { visibilitySql } from "@/lib/auth/row-scope";
import { listingDescription } from "@/components/records/listing";
import {
  SUB_AGENT_PAYMENT_REQUEST_COLUMNS,
  SUB_AGENT_PAYMENT_REQUEST_FIELDS,
  SUB_AGENT_PAYMENT_STATUS_DEFAULT,
  canOperateSubAgentPaymentRequest,
  subAgentPaymentAmountError,
  subAgentPaymentRequestFieldRows,
} from "@/lib/sub-agent-payment-requests";
import { getResource, resolveResource } from "@/server/resources";

const query = vi.hoisted(() => vi.fn());
const writeAudit = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/db", () => ({
  pool: { query },
}));

vi.mock("@/server/audit", () => ({
  writeAudit,
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

const catalog = [
  ...SUB_AGENT_PAYMENT_REQUEST_COLUMNS.map((column_name) => ({
    table_name: "sub_agent_payment_requests",
    column_name,
    data_type:
      column_name === "amount"
        ? "numeric"
        : column_name.endsWith("_id") || column_name === "id"
          ? "integer"
          : column_name.endsWith("_at")
            ? "timestamp with time zone"
            : "character varying",
  })),
  ...["id", "code", "name", "agent_id", "deleted_at"].map((column_name) => ({
    table_name: "sub_agents",
    column_name,
    data_type: column_name === "deleted_at" ? "timestamp with time zone" : column_name.endsWith("_id") || column_name === "id" ? "integer" : "character varying",
  })),
  ...["id", "code", "name"].map((column_name) => ({
    table_name: "class_groups",
    column_name,
    data_type: column_name === "id" ? "integer" : "character varying",
  })),
  ...["id", "code", "name", "deleted_at"].map((column_name) => ({
    table_name: "candidates",
    column_name,
    data_type: column_name === "deleted_at" ? "timestamp with time zone" : column_name === "id" ? "integer" : "character varying",
  })),
];

function rowsFor(params?: unknown[]) {
  const requested = Array.isArray(params?.[0]) ? params[0] : typeof params?.[0] === "string" ? [params[0]] : null;
  const rows = requested ? catalog.filter((row) => requested.includes(row.table_name)) : catalog;
  return { rows, rowCount: rows.length };
}

describe("sub-agent payment request mapping", () => {
  it("keeps the legacy columns, bill titles, and status flags", () => {
    expect(
      SUB_AGENT_PAYMENT_REQUEST_FIELDS.filter((field) =>
        SUB_AGENT_PAYMENT_REQUEST_COLUMNS.includes(field.field as (typeof SUB_AGENT_PAYMENT_REQUEST_COLUMNS)[number]),
      )
        .map((field) => field.field)
        .sort(),
    ).toEqual([...SUB_AGENT_PAYMENT_REQUEST_COLUMNS].sort());
    expect(SUB_AGENT_PAYMENT_REQUEST_FIELDS.find((field) => field.field === "bill_title")?.details).toMatchObject({
      default: "Admission Group Approval",
      options: {
        "Admission Group Approval": "Admission Group Approval",
        "Final Group Approval": "Final Group Approval",
        "Medical Fee": "Medical Fee",
        "Manpower Fee": "Manpower Fee",
        "Panelty Fee": "Panelty Fee",
        "Others (Customize)": "Others (Customize)",
      },
    });
    expect(SUB_AGENT_PAYMENT_REQUEST_FIELDS.find((field) => field.field === "status")).toMatchObject({
      browse: true,
      read: true,
      edit: false,
      add: false,
      details: { default: "P", options: { P: "Pending", A: "Approved", R: "Rejected" } },
    });
    expect(SUB_AGENT_PAYMENT_REQUEST_FIELDS.find((field) => field.field === "amount")?.details).toMatchObject({
      default: 0,
      validation: { rule: "required|min:1" },
    });
    expect(SUB_AGENT_PAYMENT_STATUS_DEFAULT).toBe("P");
    expect(subAgentPaymentAmountError("")).toBe("Amount is required.");
    expect(subAgentPaymentAmountError("0")).toBe("Amount must be at least 1.");
    expect(subAgentPaymentAmountError("1")).toBeNull();
    expect(getResource("sub-agent-payment-requests")).toMatchObject({
      table: "sub_agent_payment_requests",
      title: "Sub Agent Payment Requests",
      softDelete: false,
      scope: { mode: "column", candidate: "candidate_id", subAgent: "sub_agent_id" },
      search: ["bill_title", "remarks"],
    });
    expect(resolveResource("sub_agent_payment_requests")?.slug).toBe("sub-agent-payment-requests");
    expect(listingDescription("sub-agent-payment-requests", "Sub Agent Payment Requests")).toContain("stored status");
    expect(subAgentPaymentRequestFieldRows("add").map((field) => field.field)).not.toContain("status");
    expect(subAgentPaymentRequestFieldRows("edit").map((field) => field.field)).not.toContain("status");
    expect(subAgentPaymentRequestFieldRows("browse").map((field) => field.field)).toEqual([
      "bill_title",
      "sub_agent_payment_request_belongsto_sub_agent_relationship",
      "sub_agent_payment_request_belongsto_class_group_relationship",
      "sub_agent_payment_request_belongsto_candidate_relationship",
      "amount",
      "status",
      "created_at",
    ]);
  });
});

describe("sub-agent payment request access", () => {
  const requests = getResource("sub-agent-payment-requests");
  if (!requests) throw new Error("sub-agent payment request resource missing");

  it("follows the stored Agent grants and the existing agent row filter", () => {
    const agent = user({
      roleName: "Agent",
      agentId: 4,
      permissions: ["browse_sub_agent_payment_requests", "add_sub_agent_payment_requests"],
    });
    const params: unknown[] = [];
    expect(canOperateSubAgentPaymentRequest(agent, "browse")).toBe(true);
    expect(canOperateSubAgentPaymentRequest(agent, "add")).toBe(true);
    expect(canOperateSubAgentPaymentRequest(agent, "read")).toBe(false);
    expect(canMutateTable(agent, "sub_agent_payment_requests", "edit")).toBe(false);
    expect(canMutateTable(agent, "sub_agent_payment_requests", "delete")).toBe(false);
    expect(visibilitySql(requests, agent, params)).toBe(
      "(sub_agent_id IN (SELECT id FROM sub_agents WHERE agent_id = $1 AND deleted_at IS NULL) OR candidate_id IN (SELECT id FROM candidates WHERE agent_id = $1 AND deleted_at IS NULL))",
    );
    expect(params).toEqual([4]);
  });

  it("scopes a sub-agent to sub_agent_id and a candidate to candidate_id", () => {
    const subAgent = user({ roleName: "Sub Agent", subAgentId: 3, permissions: ["browse_sub_agent_payment_requests"] });
    const candidate = user({ roleName: "Candidate", candidateId: 3848, permissions: ["browse_sub_agent_payment_requests"] });
    const subParams: unknown[] = [];
    const candidateParams: unknown[] = [];
    expect(visibilitySql(requests, subAgent, subParams)).toBe(`"sub_agent_id" = $1`);
    expect(subParams).toEqual([3]);
    expect(visibilitySql(requests, candidate, candidateParams)).toBe(`"candidate_id" = $1`);
    expect(candidateParams).toEqual([3848]);
  });

  it("denies a company, an employee, and an inactive account", () => {
    const company = user({ roleName: "Company", companierId: 3, permissions: ["browse_invoices"] });
    const employee = user({ roleName: "Employee", permissions: ["browse_candidates"] });
    const inactive = user({
      status: "I",
      roleName: "Agent",
      agentId: 4,
      permissions: ["browse_sub_agent_payment_requests", "add_sub_agent_payment_requests", "delete_sub_agent_payment_requests"],
    });
    expect(canOperateSubAgentPaymentRequest(company, "browse")).toBe(false);
    expect(visibilitySql(requests, company, [])).toBe("FALSE");
    expect(canOperateSubAgentPaymentRequest(employee, "browse")).toBe(false);
    expect(visibilitySql(requests, employee, [])).toBe("FALSE");
    expect(canOperateSubAgentPaymentRequest(inactive, "add")).toBe(false);
    expect(visibilitySql(requests, inactive, [])).toBe("FALSE");
  });

  it("keeps full access on the existing role rule", () => {
    const owner = user({ roleName: "owner", permissions: [] });
    const admin = user({ roleName: "admin", permissions: [] });
    expect(visibilitySql(requests, owner, [])).toBe("TRUE");
    expect(canOperateSubAgentPaymentRequest(owner, "delete")).toBe(true);
    expect(canMutateTable(admin, "sub_agent_payment_requests", "edit")).toBe(true);
    expect(canOperateSubAgentPaymentRequest(admin, "read")).toBe(true);
  });
});

describe("sub-agent payment request form fallback", () => {
  beforeEach(() => {
    query.mockReset();
    writeAudit.mockClear();
    query.mockImplementation(async (sql: unknown, params?: unknown[]) => {
      const statement = String(sql).replace(/\s+/g, " ");
      if (statement.includes("FROM data_types")) return { rows: [], rowCount: 0 };
      if (statement.includes("information_schema.columns")) return rowsFor(params);
      if (statement.includes("FROM data_rows")) throw new Error("synthetic sub-agent payment request form must not read data_rows");
      if (statement.includes("INSERT INTO")) {
        return { rows: [{ id: 9 }], rowCount: 1 };
      }
      if (statement.includes("FROM candidates")) return { rows: [{ value: "3848", label: "Candidate" }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
  });

  it("builds the add form from the legacy field list when the data type row is absent", async () => {
    const { loadBreadForm } = await import("@/server/bread-form");
    const form = await loadBreadForm(
      "sub-agent-payment-requests",
      "add",
      null,
      user({ roleName: "Agent", agentId: 4, permissions: ["add_sub_agent_payment_requests"] }),
    );
    expect(form?.title).toBe("Sub Agent Payment Request");
    expect(form?.fields.map((field) => [field.name, field.input, field.required, field.value])).toEqual([
      ["bill_title", "select", false, "Admission Group Approval"],
      ["sub_agent_id", "select", true, ""],
      ["group_id", "select", true, ""],
      ["candidate_id", "select", true, ""],
      ["amount", "number", true, "0"],
      ["remarks", "textarea", false, ""],
    ]);
    expect(form?.fields.find((field) => field.name === "bill_title")?.options?.map((option) => option.value)).toEqual([
      "Admission Group Approval",
      "Final Group Approval",
      "Medical Fee",
      "Manpower Fee",
      "Panelty Fee",
      "Others (Customize)",
    ]);
    expect(form?.fields.some((field) => field.name === "status" || field.name === "payment_id")).toBe(false);
  });

  it("lists the browse columns and stores Pending on a new request", async () => {
    const { listBread } = await import("@/server/browse");
    const { saveBreadRecord } = await import("@/server/bread-form");
    const viewer = user({ roleName: "sadmin", permissions: [] });
    const listed = await listBread(viewer, "sub-agent-payment-requests", "", 1, null);
    expect(listed?.columns.map((column) => column.label)).toEqual(["Bill Title", "Sub Agent", "Group", "Candidates", "Amount", "Status", "Created At"]);

    const agent = user({ roleName: "Agent", agentId: 4, permissions: ["add_sub_agent_payment_requests"] });
    await expect(
      saveBreadRecord(agent, "sub-agent-payment-requests", null, {
        bill_title: "Admission Group Approval",
        sub_agent_id: "1",
        group_id: "1",
        candidate_id: "3848",
        amount: "0",
        remarks: "test payment",
        status: "A",
      }, null),
    ).rejects.toThrow("Amount must be at least 1.");

    const saved = await saveBreadRecord(agent, "sub-agent-payment-requests", null, {
      bill_title: "Admission Group Approval",
      sub_agent_id: "1",
      group_id: "1",
      candidate_id: "3848",
      amount: "100",
      remarks: "test payment",
      status: "A",
    }, null);
    expect(saved).toBe(9);
    const insert = query.mock.calls.map((call) => String(call[0])).find((sql) => sql.includes("INSERT INTO"));
    expect(insert).toContain('"status"');
    expect(insert).not.toContain("payment_id");
    const insertParams = query.mock.calls.find((call) => String(call[0]).includes("INSERT INTO"))?.[1] as unknown[];
    expect(insertParams).toContain("P");
    expect(insertParams).not.toContain("A");
    expect(insertParams).toContain("100");
    expect(writeAudit).toHaveBeenCalledOnce();
  });
});
