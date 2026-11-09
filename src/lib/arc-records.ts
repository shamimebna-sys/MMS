import { hasPermission, type AccessUser } from "@/lib/auth/permissions";

/**
 * Legacy `arcs` BREAD from `docs/db.txt` data type 41.
 * Field names, flags, defaults, and option values are the stored rows.
 * ARC is a candidate compliance record. It is not a live-status step.
 */
export type ArcFieldFlag = "browse" | "read" | "edit" | "add" | "delete";

export type ArcField = {
  field: string;
  type: string;
  displayName: string;
  required: boolean;
  browse: boolean;
  read: boolean;
  edit: boolean;
  add: boolean;
  delete: boolean;
  details: Record<string, unknown>;
  order: number;
};

const width = (value: string | number) => ({ display: { width: value } });

export const ARC_FIELDS: readonly ArcField[] = [
  { field: "id", type: "text", displayName: "Id", required: true, browse: false, read: false, edit: false, add: false, delete: false, details: {}, order: 1 },
  { field: "arc_number", type: "text", displayName: "ARC No.", required: false, browse: true, read: true, edit: true, add: true, delete: true, details: width(4), order: 2 },
  { field: "issue_date", type: "date", displayName: "Issue Date", required: false, browse: true, read: true, edit: true, add: true, delete: true, details: width("4"), order: 3 },
  { field: "expire_date", type: "date", displayName: "Expire Date", required: false, browse: true, read: true, edit: true, add: true, delete: true, details: width("4"), order: 4 },
  {
    field: "is_lifetime",
    type: "select_dropdown",
    displayName: "Is Lifetime",
    required: false,
    browse: true,
    read: true,
    edit: true,
    add: true,
    delete: true,
    details: { ...width("4"), default: "N", options: { N: "No", Y: "Yes" } },
    order: 5,
  },
  {
    field: "status",
    type: "select_dropdown",
    displayName: "Status",
    required: false,
    browse: true,
    read: true,
    edit: true,
    add: true,
    delete: true,
    details: { ...width("4"), default: "A", options: { A: "Active", I: "Inactive" } },
    order: 6,
  },
  { field: "candidate_id", type: "hidden", displayName: "Candidate Id", required: false, browse: false, read: true, edit: true, add: true, delete: true, details: {}, order: 7 },
  { field: "created_at", type: "timestamp", displayName: "Created At", required: false, browse: false, read: false, edit: false, add: false, delete: false, details: {}, order: 8 },
  { field: "updated_at", type: "timestamp", displayName: "Updated At", required: false, browse: false, read: false, edit: false, add: false, delete: false, details: {}, order: 9 },
  { field: "acr_file_path", type: "file", displayName: "ACR File", required: false, browse: true, read: true, edit: true, add: true, delete: true, details: width(4), order: 10 },
];

export const ARC_COLUMNS = ["id", "issue_date", "expire_date", "is_lifetime", "status", "candidate_id", "created_at", "updated_at", "acr_file_path", "arc_number"] as const;

export function isArcSlug(slug: string): boolean {
  return slug === "arcs" || slug === "arc";
}

export function arcDataType(kind: "list" | "form"): { id: 0; slug: "arcs"; table: "arcs"; title: string; synthetic: true } {
  return { id: 0, slug: "arcs", table: "arcs", title: kind === "list" ? "Arcs" : "Arc", synthetic: true };
}

export function arcFieldRows(flag: ArcFieldFlag): Array<{ field: string; type: string; display_name: string; required: number; details: string | null }> {
  return ARC_FIELDS.filter((field) => field[flag])
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

export function canOperateArc(user: AccessUser, action: "browse" | "read" | "edit" | "add" | "delete"): boolean {
  return hasPermission(user, `${action}_arcs`);
}
