import { hasPermission, type AccessUser } from "@/lib/auth/permissions";

/**
 * Legacy `euro_to_bdt_rates` BREAD from `docs/db.txt` data type 28.
 * Field names, flags, and labels are the stored rows. Voyager scope is null.
 * Stored grants: browse, edit, and add for owner and sadmin; read and delete for sadmin.
 * sadmin, admin, and owner still pass every key through the existing full-access rule.
 */
export type EuroToBdtRateFlag = "browse" | "read" | "edit" | "add" | "delete";

export type EuroToBdtRateField = {
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

export const EURO_TO_BDT_RATE_COLUMNS = [
  "id",
  "conversion_date",
  "euro_rate",
  "updated_at",
  "created_by",
  "updated_by",
  "created_at",
  "ref_link",
  "description",
] as const;

export const EURO_TO_BDT_RATE_FIELDS: EuroToBdtRateField[] = [
  { field: "id", type: "text", displayName: "Id", columnRequired: true, required: true, browse: false, read: false, edit: false, add: false, delete: false, details: {}, order: 1 },
  { field: "conversion_date", type: "date", displayName: "Conversion Date", columnRequired: false, required: false, browse: true, read: true, edit: true, add: true, delete: true, details: width("3"), order: 2 },
  { field: "euro_rate", type: "number", displayName: "Euro Rate (1 EUR = ? BDT)", columnRequired: false, required: false, browse: true, read: true, edit: true, add: true, delete: true, details: width("3"), order: 3 },
  { field: "updated_at", type: "timestamp", displayName: "Updated At", columnRequired: false, required: false, browse: false, read: false, edit: false, add: false, delete: false, details: {}, order: 4 },
  { field: "created_by", type: "hidden", displayName: "Created By", columnRequired: false, required: false, browse: false, read: false, edit: false, add: false, delete: false, details: {}, order: 5 },
  { field: "updated_by", type: "hidden", displayName: "Updated By", columnRequired: false, required: false, browse: false, read: false, edit: false, add: false, delete: false, details: {}, order: 6 },
  { field: "created_at", type: "timestamp", displayName: "Created At", columnRequired: false, required: false, browse: true, read: false, edit: false, add: false, delete: false, details: width("4"), order: 7 },
  { field: "ref_link", type: "text", displayName: "Ref. Link", columnRequired: false, required: false, browse: false, read: true, edit: true, add: true, delete: true, details: width("6"), order: 8 },
  { field: "description", type: "text_area", displayName: "Description", columnRequired: false, required: false, browse: false, read: true, edit: true, add: true, delete: true, details: width("12"), order: 9 },
];

export function isEuroToBdtRateSlug(slug: string): boolean {
  return slug === "euro-to-bdt-rates" || slug === "euro_to_bdt_rates";
}

export function euroToBdtRateDataType(kind: "list" | "form"): { id: 0; slug: "euro-to-bdt-rates"; table: "euro_to_bdt_rates"; title: string; synthetic: true } {
  return {
    id: 0,
    slug: "euro-to-bdt-rates",
    table: "euro_to_bdt_rates",
    title: kind === "list" ? "Euro To BDT Rates" : "Euro To BDT Rate",
    synthetic: true,
  };
}

export function euroToBdtRateFieldRows(flag: EuroToBdtRateFlag): Array<{ field: string; type: string; display_name: string; required: number; details: string | null }> {
  return EURO_TO_BDT_RATE_FIELDS.filter((field) => field[flag])
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

export function canOperateEuroToBdtRate(user: AccessUser, action: "browse" | "read" | "edit" | "add" | "delete"): boolean {
  return hasPermission(user, `${action}_euro_to_bdt_rates`);
}
