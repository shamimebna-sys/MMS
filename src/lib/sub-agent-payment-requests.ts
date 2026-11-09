import { hasPermission, type AccessUser } from "@/lib/auth/permissions";

/**
 * Legacy `sub_agent_payment_requests` BREAD from `docs/db.txt` data type 68.
 * Field names, flags, defaults, and option values are the stored rows.
 * `status` is not on the add or edit form. A new row stores the column default `P`.
 * Amount uses the stored rule `required|min:1`. This module does not approve or pay the request.
 */
export type SubAgentPaymentRequestFlag = "browse" | "read" | "edit" | "add" | "delete";

export type SubAgentPaymentRequestField = {
  field: string;
  type: string;
  displayName: string;
  columnRequired: boolean;
  required: boolean;
  browse: boolean;
  read: boolean;
  edit: boolean;
  add: boolean;
  delete: boolean;
  details: Record<string, unknown>;
  order: number;
};

export const SUB_AGENT_PAYMENT_STATUS_DEFAULT = "P";

const width = (value: string) => ({ display: { width: value } });

const belongsTo = (table: string, column: string, label: string) => ({
  display: { width: "4" },
  model: table === "sub_agents" ? "App\\Models\\SubAgent" : table === "class_groups" ? "App\\Models\\ClassGroup" : "App\\Models\\Candidate",
  table,
  type: "belongsTo",
  column,
  key: "id",
  label,
  pivot_table: "agenciers",
  pivot: "0",
  taggable: "0",
});

export const SUB_AGENT_PAYMENT_REQUEST_FIELDS: readonly SubAgentPaymentRequestField[] = [
  { field: "id", type: "text", displayName: "Id", columnRequired: true, required: true, browse: false, read: false, edit: false, add: false, delete: false, details: {}, order: 1 },
  {
    field: "bill_title",
    type: "select_dropdown",
    displayName: "Bill Title",
    columnRequired: false,
    required: false,
    browse: true,
    read: true,
    edit: true,
    add: true,
    delete: true,
    details: {
      ...width("4"),
      default: "Admission Group Approval",
      options: {
        "Admission Group Approval": "Admission Group Approval",
        "Final Group Approval": "Final Group Approval",
        "Medical Fee": "Medical Fee",
        "Manpower Fee": "Manpower Fee",
        "Panelty Fee": "Panelty Fee",
        "Others (Customize)": "Others (Customize)",
      },
    },
    order: 2,
  },
  { field: "sub_agent_id", type: "hidden", displayName: "Sub Agent Id", columnRequired: false, required: false, browse: false, read: true, edit: true, add: true, delete: true, details: {}, order: 3 },
  {
    field: "sub_agent_payment_request_belongsto_sub_agent_relationship",
    type: "relationship",
    displayName: "Sub Agent",
    columnRequired: true,
    required: true,
    browse: true,
    read: true,
    edit: true,
    add: true,
    delete: true,
    details: belongsTo("sub_agents", "sub_agent_id", "sub_agent_details_info"),
    order: 4,
  },
  { field: "group_id", type: "hidden", displayName: "Group Id", columnRequired: false, required: false, browse: false, read: true, edit: true, add: true, delete: true, details: {}, order: 5 },
  {
    field: "sub_agent_payment_request_belongsto_class_group_relationship",
    type: "relationship",
    displayName: "Group",
    columnRequired: true,
    required: true,
    browse: true,
    read: true,
    edit: true,
    add: true,
    delete: true,
    details: belongsTo("class_groups", "group_id", "group_info"),
    order: 6,
  },
  { field: "candidate_id", type: "hidden", displayName: "Candidate Id", columnRequired: false, required: false, browse: false, read: true, edit: true, add: true, delete: true, details: {}, order: 7 },
  {
    field: "sub_agent_payment_request_belongsto_candidate_relationship",
    type: "relationship",
    displayName: "Candidates",
    columnRequired: true,
    required: true,
    browse: true,
    read: true,
    edit: true,
    add: true,
    delete: true,
    details: belongsTo("candidates", "candidate_id", "candidate_details_info"),
    order: 8,
  },
  {
    field: "amount",
    type: "number",
    displayName: "Amount",
    columnRequired: false,
    required: true,
    browse: true,
    read: true,
    edit: true,
    add: true,
    delete: true,
    details: { ...width("4"), default: 0, validation: { rule: "required|min:1" } },
    order: 9,
  },
  {
    field: "status",
    type: "select_dropdown",
    displayName: "Status",
    columnRequired: false,
    required: false,
    browse: true,
    read: true,
    edit: false,
    add: false,
    delete: true,
    details: { ...width("4"), default: "P", options: { P: "Pending", A: "Approved", R: "Rejected" } },
    order: 10,
  },
  { field: "remarks", type: "text_area", displayName: "Remarks", columnRequired: false, required: false, browse: false, read: true, edit: true, add: true, delete: true, details: width("12"), order: 11 },
  { field: "payment_id", type: "hidden", displayName: "Payment Id", columnRequired: false, required: false, browse: false, read: true, edit: true, add: true, delete: true, details: {}, order: 12 },
  { field: "created_at", type: "timestamp", displayName: "Created At", columnRequired: false, required: false, browse: true, read: false, edit: false, add: false, delete: false, details: {}, order: 13 },
  { field: "updated_at", type: "timestamp", displayName: "Updated At", columnRequired: false, required: false, browse: false, read: false, edit: false, add: false, delete: false, details: {}, order: 14 },
];

export const SUB_AGENT_PAYMENT_REQUEST_COLUMNS = [
  "id",
  "bill_title",
  "sub_agent_id",
  "group_id",
  "candidate_id",
  "amount",
  "status",
  "payment_id",
  "remarks",
  "created_at",
  "updated_at",
] as const;

export function isSubAgentPaymentRequestSlug(slug: string): boolean {
  return slug === "sub-agent-payment-requests" || slug === "sub_agent_payment_requests";
}

export function subAgentPaymentRequestDataType(kind: "list" | "form"): {
  id: 0;
  slug: "sub-agent-payment-requests";
  table: "sub_agent_payment_requests";
  title: string;
  synthetic: true;
} {
  return {
    id: 0,
    slug: "sub-agent-payment-requests",
    table: "sub_agent_payment_requests",
    title: kind === "list" ? "Sub Agent Payment Requests" : "Sub Agent Payment Request",
    synthetic: true,
  };
}

export function subAgentPaymentRequestFieldRows(
  flag: SubAgentPaymentRequestFlag,
): Array<{ field: string; type: string; display_name: string; required: number; details: string | null }> {
  return SUB_AGENT_PAYMENT_REQUEST_FIELDS.filter((field) => field[flag])
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((field) => ({
      field: field.field,
      type: field.type,
      display_name: field.displayName,
      required: field.required ? 1 : 0,
      details: JSON.stringify(field.details),
    }));
}

export function subAgentPaymentAmountError(raw: string): string | null {
  const text = raw.trim();
  if (!text) return "Amount is required.";
  if (!/^-?\d+(\.\d+)?$/.test(text) || Number(text) < 1) return "Amount must be at least 1.";
  return null;
}

export function canOperateSubAgentPaymentRequest(user: AccessUser, action: "browse" | "read" | "edit" | "add" | "delete"): boolean {
  return hasPermission(user, `${action}_sub_agent_payment_requests`);
}
