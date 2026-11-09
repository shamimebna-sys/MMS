import { hasPermission, type AccessUser } from "@/lib/auth/permissions";

/**
 * Legacy `ticket_invoice_money_receipts` BREAD from `docs/db.txt` data type 66.
 * Field names, flags, the payment-method default, and option values are the stored rows.
 * A receipt belongs to `ticket_invoice_id`. Voyager scope is null.
 * Stored grants: browse, read, add, and delete for `sadmin` and `owner`; edit for `sadmin` only.
 * sadmin, admin, and owner still pass every key through the existing full-access rule.
 */
export type TicketInvoiceMoneyReceiptFlag = "browse" | "read" | "edit" | "add" | "delete";

export type TicketInvoiceMoneyReceiptField = {
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

const width = (value: string) => ({ display: { width: value } });
const rule = (value: string) => ({ ...width(value), validation: { rule: "required" } });

export const TICKET_INVOICE_MONEY_RECEIPT_COLUMNS = [
  "id",
  "ticket_invoice_id",
  "receipt_no",
  "received_from",
  "hotel",
  "amount",
  "received_for",
  "receipt_date",
  "recipient",
  "created_at",
  "updated_at",
  "payment_method",
  "transaction_no",
  "remarks",
] as const;

export const TICKET_INVOICE_MONEY_RECEIPT_FIELDS: readonly TicketInvoiceMoneyReceiptField[] = [
  { field: "id", type: "text", displayName: "Id", columnRequired: true, required: true, browse: false, read: false, edit: false, add: false, delete: false, details: {}, order: 1 },
  { field: "ticket_invoice_id", type: "hidden", displayName: "Ticket Invoice Id", columnRequired: false, required: false, browse: true, read: true, edit: true, add: true, delete: true, details: {}, order: 2 },
  { field: "receipt_no", type: "text", displayName: "Receipt No", columnRequired: false, required: true, browse: true, read: true, edit: true, add: true, delete: true, details: rule("4"), order: 3 },
  { field: "received_from", type: "text", displayName: "Received From", columnRequired: false, required: true, browse: true, read: true, edit: true, add: true, delete: true, details: rule("4"), order: 4 },
  { field: "hotel", type: "hidden", displayName: "Hotel", columnRequired: false, required: false, browse: false, read: true, edit: true, add: true, delete: true, details: width("4"), order: 5 },
  { field: "amount", type: "number", displayName: "Amount", columnRequired: false, required: true, browse: true, read: true, edit: true, add: true, delete: true, details: rule("4"), order: 6 },
  { field: "received_for", type: "text", displayName: "Received For", columnRequired: false, required: true, browse: true, read: true, edit: true, add: true, delete: true, details: rule("4"), order: 7 },
  { field: "receipt_date", type: "date", displayName: "Receipt Date", columnRequired: false, required: true, browse: true, read: true, edit: true, add: true, delete: true, details: rule("4"), order: 8 },
  { field: "recipient", type: "text", displayName: "Recipient", columnRequired: false, required: false, browse: true, read: true, edit: true, add: true, delete: true, details: width("4"), order: 9 },
  { field: "created_at", type: "timestamp", displayName: "Created At", columnRequired: false, required: false, browse: true, read: true, edit: true, add: false, delete: true, details: {}, order: 10 },
  { field: "updated_at", type: "timestamp", displayName: "Updated At", columnRequired: false, required: false, browse: false, read: false, edit: false, add: false, delete: false, details: {}, order: 11 },
  {
    field: "payment_method",
    type: "select_dropdown",
    displayName: "Payment Method",
    columnRequired: false,
    required: true,
    browse: true,
    read: true,
    edit: true,
    add: true,
    delete: true,
    details: {
      ...rule("4"),
      default: "CASH",
      options: { Cash: "Cash", "Online Bank Transfer": "Online Bank Transfer", Cheque: "Cheque" },
    },
    order: 12,
  },
  { field: "transaction_no", type: "text", displayName: "Transaction No", columnRequired: false, required: false, browse: true, read: true, edit: true, add: true, delete: true, details: width("4"), order: 13 },
  { field: "remarks", type: "hidden", displayName: "Remarks", columnRequired: false, required: false, browse: false, read: true, edit: true, add: true, delete: true, details: {}, order: 14 },
];

export function isTicketInvoiceMoneyReceiptSlug(slug: string): boolean {
  return slug === "ticket-invoice-money-receipts" || slug === "ticket_invoice_money_receipts";
}

export function ticketInvoiceMoneyReceiptDataType(kind: "list" | "form"): {
  id: 0;
  slug: "ticket-invoice-money-receipts";
  table: "ticket_invoice_money_receipts";
  title: string;
  synthetic: true;
} {
  return {
    id: 0,
    slug: "ticket-invoice-money-receipts",
    table: "ticket_invoice_money_receipts",
    title: kind === "list" ? "Ticket Invoice Money Receipts" : "Ticket Invoice Money Receipt",
    synthetic: true,
  };
}

export function ticketInvoiceMoneyReceiptFieldRows(
  flag: TicketInvoiceMoneyReceiptFlag,
): Array<{ field: string; type: string; display_name: string; required: number; details: string | null }> {
  return TICKET_INVOICE_MONEY_RECEIPT_FIELDS.filter((field) => field[flag])
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

export function canOperateTicketInvoiceMoneyReceipt(user: AccessUser, action: "browse" | "read" | "edit" | "add" | "delete"): boolean {
  return hasPermission(user, `${action}_ticket_invoice_money_receipts`);
}
