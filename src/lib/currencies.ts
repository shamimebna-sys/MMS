import { hasPermission, type AccessUser } from "@/lib/auth/permissions";

/**
 * Legacy `currencies` BREAD from `docs/db.txt` data type 29.
 * Field names, flags, labels, and dropdown options are the stored rows.
 * Voyager scope is null. `currencies` is already a shared reference table.
 * Stored grants 122–126 are on role `sadmin` only.
 * sadmin, admin, and owner still pass every key through the existing full-access rule.
 */
export type CurrencyFlag = "browse" | "read" | "edit" | "add" | "delete";

export type CurrencyField = {
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

export const CURRENCY_COLUMNS = [
  "id",
  "full_name",
  "short_name",
  "symbol",
  "created_at",
  "position",
  "status",
  "updated_at",
] as const;

export const CURRENCY_FIELDS: CurrencyField[] = [
  { field: "id", type: "text", displayName: "Id", columnRequired: true, required: true, browse: false, read: false, edit: false, add: false, delete: false, details: {}, order: 1 },
  { field: "full_name", type: "text", displayName: "Full Name", columnRequired: true, required: true, browse: true, read: true, edit: true, add: true, delete: true, details: width("6"), order: 2 },
  { field: "short_name", type: "text", displayName: "Short Name", columnRequired: false, required: false, browse: true, read: true, edit: true, add: true, delete: true, details: width("3"), order: 3 },
  { field: "symbol", type: "text", displayName: "Symbol", columnRequired: false, required: false, browse: true, read: true, edit: true, add: true, delete: true, details: width("3"), order: 4 },
  { field: "created_at", type: "timestamp", displayName: "Created At", columnRequired: false, required: false, browse: false, read: false, edit: false, add: false, delete: false, details: {}, order: 5 },
  {
    field: "position",
    type: "select_dropdown",
    displayName: "Place",
    columnRequired: false,
    required: false,
    browse: true,
    read: true,
    edit: true,
    add: true,
    delete: true,
    details: { ...width("4"), default: "A", options: { A: "After Amount", B: "Before Amount" } },
    order: 6,
  },
  {
    field: "status",
    type: "select_dropdown",
    displayName: "Status",
    columnRequired: false,
    required: false,
    browse: true,
    read: true,
    edit: true,
    add: true,
    delete: true,
    details: { ...width("4"), default: "A", options: { A: "Active", I: "Inactive" } },
    order: 7,
  },
  { field: "updated_at", type: "timestamp", displayName: "Updated At", columnRequired: false, required: false, browse: false, read: false, edit: false, add: false, delete: false, details: {}, order: 8 },
];

export function isCurrencySlug(slug: string): boolean {
  return slug === "currencies";
}

export function currencyDataType(kind: "list" | "form"): { id: 0; slug: "currencies"; table: "currencies"; title: string; synthetic: true } {
  return {
    id: 0,
    slug: "currencies",
    table: "currencies",
    title: kind === "list" ? "Currencies" : "Currency",
    synthetic: true,
  };
}

export function currencyFieldRows(flag: CurrencyFlag): Array<{ field: string; type: string; display_name: string; required: number; details: string | null }> {
  return CURRENCY_FIELDS.filter((field) => field[flag])
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

export function canOperateCurrency(user: AccessUser, action: "browse" | "read" | "edit" | "add" | "delete"): boolean {
  return hasPermission(user, `${action}_currencies`);
}
