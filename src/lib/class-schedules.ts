import { hasPermission, type AccessUser } from "@/lib/auth/permissions";

/**
 * Legacy `class_schedules` BREAD from `docs/db.txt` data type 24.
 * Field names, flags, defaults, and option values are the stored rows.
 * Voyager scope is null, so the list stays a shared reference.
 * Stored grants: browse/edit/add for owner and sadmin, read and delete for sadmin.
 * sadmin, admin, and owner still pass every key through the existing full-access rule.
 */
export type ClassScheduleFlag = "browse" | "read" | "edit" | "add" | "delete";

export type ClassScheduleField = {
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

const belongsTo = (model: string, table: string, column: string, label: string) => ({
  display: { width: "4" },
  model,
  table,
  type: "belongsTo",
  column,
  key: "id",
  label,
  pivot_table: "agents",
  pivot: "0",
  taggable: "0",
});

export const CLASS_SCHEDULE_COLUMNS = [
  "id",
  "teacher_id",
  "class_group_id",
  "subject",
  "start_time",
  "end_time",
  "week_day",
  "status",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
] as const;

export const CLASS_SCHEDULE_FIELDS: ClassScheduleField[] = [
  { field: "id", type: "text", displayName: "Id", columnRequired: true, required: true, browse: false, read: false, edit: false, add: false, delete: false, details: {}, order: 1 },
  { field: "teacher_id", type: "hidden", displayName: "Teacher Id", columnRequired: false, required: false, browse: false, read: true, edit: true, add: true, delete: true, details: width("4"), order: 2 },
  {
    field: "class_schedule_belongsto_teacher_relationship",
    type: "relationship",
    displayName: "Teacher",
    columnRequired: false,
    required: true,
    browse: false,
    read: true,
    edit: true,
    add: true,
    delete: true,
    details: belongsTo("App\\Models\\Teacher", "teachers", "teacher_id", "teacher_info"),
    order: 3,
  },
  { field: "class_group_id", type: "hidden", displayName: "Class Group Id", columnRequired: false, required: false, browse: false, read: true, edit: true, add: true, delete: true, details: width("4"), order: 4 },
  {
    field: "class_schedule_belongsto_class_group_relationship",
    type: "relationship",
    displayName: "Group",
    columnRequired: false,
    required: true,
    browse: true,
    read: true,
    edit: true,
    add: true,
    delete: true,
    details: belongsTo("App\\Models\\ClassGroup", "class_groups", "class_group_id", "group_info"),
    order: 5,
  },
  {
    field: "subject",
    type: "select_dropdown",
    displayName: "Subject",
    columnRequired: false,
    required: false,
    browse: true,
    read: true,
    edit: true,
    add: true,
    delete: true,
    details: { ...width("4"), default: "Class", options: { Interview: "Interview", Class: "Class" } },
    order: 6,
  },
  { field: "start_time", type: "time", displayName: "Start Time", columnRequired: false, required: false, browse: true, read: true, edit: true, add: true, delete: true, details: width("3"), order: 7 },
  { field: "end_time", type: "time", displayName: "End Time", columnRequired: false, required: false, browse: true, read: true, edit: true, add: true, delete: true, details: width("3"), order: 8 },
  {
    field: "week_day",
    type: "select_dropdown",
    displayName: "Day",
    columnRequired: false,
    required: false,
    browse: true,
    read: true,
    edit: true,
    add: true,
    delete: true,
    details: {
      ...width("3"),
      default: "Saturday",
      options: {
        Friday: "Friday",
        Saturday: "Saturday",
        Sunday: "Sunday",
        Monday: "Monday",
        Tuesday: "Tuesday",
        Wednesday: "Wednesday",
        Thursday: "Thursday",
      },
    },
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
    edit: true,
    add: true,
    delete: true,
    details: { ...width("3"), default: "A", options: { A: "Active", I: "Inactive" } },
    order: 10,
  },
  { field: "created_at", type: "timestamp", displayName: "Created At", columnRequired: false, required: false, browse: false, read: true, edit: true, add: false, delete: true, details: {}, order: 11 },
  { field: "created_by", type: "hidden", displayName: "Created By", columnRequired: false, required: false, browse: false, read: true, edit: true, add: true, delete: true, details: {}, order: 12 },
  { field: "updated_at", type: "timestamp", displayName: "Updated At", columnRequired: false, required: false, browse: false, read: false, edit: false, add: false, delete: false, details: {}, order: 13 },
  { field: "updated_by", type: "hidden", displayName: "Updated By", columnRequired: false, required: false, browse: false, read: true, edit: true, add: true, delete: true, details: {}, order: 14 },
];

export function isClassScheduleSlug(slug: string): boolean {
  return slug === "class-schedules" || slug === "class_schedules";
}

export function classScheduleDataType(kind: "list" | "form"): { id: 0; slug: "class-schedules"; table: "class_schedules"; title: string; synthetic: true } {
  return {
    id: 0,
    slug: "class-schedules",
    table: "class_schedules",
    title: kind === "list" ? "Class Schedules" : "Class Schedule",
    synthetic: true,
  };
}

export function classScheduleFieldRows(flag: ClassScheduleFlag): Array<{ field: string; type: string; display_name: string; required: number; details: string | null }> {
  return CLASS_SCHEDULE_FIELDS.filter((field) => field[flag])
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

export function canOperateClassSchedule(user: AccessUser, action: "browse" | "read" | "edit" | "add" | "delete"): boolean {
  return hasPermission(user, `${action}_class_schedules`);
}
