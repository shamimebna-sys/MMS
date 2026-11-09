import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessUser } from "@/lib/auth/permissions";
import { canMutateTable } from "@/lib/auth/permissions";
import { visibilitySql } from "@/lib/auth/row-scope";
import { listingDescription } from "@/components/records/listing";
import {
  CLASS_SCHEDULE_COLUMNS,
  CLASS_SCHEDULE_FIELDS,
  canOperateClassSchedule,
  classScheduleFieldRows,
} from "@/lib/class-schedules";
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

describe("class schedule mapping", () => {
  it("keeps the legacy columns, defaults, and relationship fields", () => {
    expect(CLASS_SCHEDULE_FIELDS.filter((field) => (CLASS_SCHEDULE_COLUMNS as readonly string[]).includes(field.field)).map((field) => field.field)).toEqual([
      ...CLASS_SCHEDULE_COLUMNS,
    ]);
    expect(CLASS_SCHEDULE_FIELDS.filter((field) => field.columnRequired).map((field) => field.field)).toEqual(["id"]);
    expect(CLASS_SCHEDULE_FIELDS.filter((field) => field.required && field.type === "relationship").map((field) => field.field)).toEqual([
      "class_schedule_belongsto_teacher_relationship",
      "class_schedule_belongsto_class_group_relationship",
    ]);
    expect(CLASS_SCHEDULE_FIELDS.find((field) => field.field === "subject")?.details).toMatchObject({
      default: "Class",
      options: { Interview: "Interview", Class: "Class" },
    });
    expect(CLASS_SCHEDULE_FIELDS.find((field) => field.field === "week_day")?.details).toMatchObject({
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
    });
    expect(CLASS_SCHEDULE_FIELDS.find((field) => field.field === "status")?.details).toMatchObject({
      default: "A",
      options: { A: "Active", I: "Inactive" },
    });
    expect(CLASS_SCHEDULE_FIELDS.find((field) => field.field === "class_schedule_belongsto_teacher_relationship")).toMatchObject({
      browse: false,
      add: true,
      details: { table: "teachers", column: "teacher_id", label: "teacher_info" },
    });
    expect(CLASS_SCHEDULE_FIELDS.find((field) => field.field === "class_schedule_belongsto_class_group_relationship")).toMatchObject({
      browse: true,
      details: { table: "class_groups", column: "class_group_id", label: "group_info" },
    });
    expect(getResource("class-schedules")).toMatchObject({
      table: "class_schedules",
      title: "Class Schedules",
      softDelete: false,
      scope: { mode: "reference" },
      search: ["subject", "week_day", "status"],
    });
    expect(listingDescription("class-schedules", "Class Schedules")).toContain("class schedules");
  });
});

describe("class schedule access", () => {
  const schedules = getResource("class-schedules");
  if (!schedules) throw new Error("class schedule resource missing");

  it("follows the stored owner and sadmin keys without a party filter", () => {
    const granted = user({
      roleName: "Employee",
      permissions: ["browse_candidates", "browse_class_schedules", "edit_class_schedules", "add_class_schedules"],
    });
    const teacher = user({ roleName: "Teacher", permissions: [] });
    const inactive = user({ roleName: "owner", status: "I", permissions: ["browse_class_schedules"] });
    expect(canOperateClassSchedule(granted, "browse")).toBe(true);
    expect(canOperateClassSchedule(granted, "edit")).toBe(true);
    expect(canOperateClassSchedule(granted, "add")).toBe(true);
    expect(canOperateClassSchedule(granted, "read")).toBe(false);
    expect(canOperateClassSchedule(granted, "delete")).toBe(false);
    expect(visibilitySql(schedules, granted, [])).toBe("TRUE");
    expect(canOperateClassSchedule(teacher, "browse")).toBe(false);
    expect(canOperateClassSchedule(inactive, "browse")).toBe(false);
    expect(visibilitySql(schedules, inactive, [])).toBe("FALSE");
  });

  it("keeps full access on the existing role rule", () => {
    const owner = user({ roleName: "owner", permissions: [] });
    const admin = user({ roleName: "admin", permissions: [] });
    const sadmin = user({ roleName: "sadmin", permissions: [] });
    expect(visibilitySql(schedules, owner, [])).toBe("TRUE");
    expect(canOperateClassSchedule(owner, "read")).toBe(true);
    expect(canMutateTable(owner, "class_schedules", "delete")).toBe(true);
    expect(canOperateClassSchedule(admin, "browse")).toBe(true);
    expect(canOperateClassSchedule(sadmin, "delete")).toBe(true);
  });
});

describe("class schedule form fallback", () => {
  beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async (sql: unknown) => {
      const statement = String(sql).replace(/\s+/g, " ");
      if (statement.includes("FROM data_types")) return { rows: [], rowCount: 0 };
      if (statement.includes("information_schema.columns")) {
        const scheduleRows = CLASS_SCHEDULE_COLUMNS.map((column_name) => ({
          table_name: "class_schedules",
          column_name,
          data_type: column_name === "start_time" || column_name === "end_time" ? "time without time zone" : column_name.endsWith("_at") ? "timestamp without time zone" : column_name.endsWith("_id") || column_name === "id" ? "integer" : "character varying",
        }));
        const related = ["teachers", "class_groups"].flatMap((table_name) =>
          ["id", "code", "name"].map((column_name) => ({
            table_name,
            column_name,
            data_type: column_name === "id" ? "integer" : "character varying",
          })),
        );
        const rows = [...scheduleRows, ...related];
        return { rows, rowCount: rows.length };
      }
      if (statement.includes("FROM data_rows")) throw new Error("synthetic class schedule form must not read data_rows");
      return { rows: [], rowCount: 0 };
    });
  });

  it("builds the add form from the legacy field list when the data type row is absent", async () => {
    const { loadBreadForm } = await import("@/server/bread-form");
    const form = await loadBreadForm("class-schedules", "add", null, user({ roleName: "owner" }));
    expect(form?.title).toBe("Class Schedule");
    expect(form?.fields.map((field) => [field.name, field.input, field.required, field.value])).toEqual([
      ["teacher_id", "select", true, ""],
      ["class_group_id", "select", true, ""],
      ["subject", "select", false, "Class"],
      ["start_time", "time", false, ""],
      ["end_time", "time", false, ""],
      ["week_day", "select", false, "Saturday"],
      ["status", "select", false, "A"],
    ]);
    expect(form?.fields.find((field) => field.name === "week_day")?.options?.map((option) => option.value)).toEqual([
      "Friday",
      "Saturday",
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
    ]);
    expect(classScheduleFieldRows("browse").map((field) => field.display_name)).toEqual([
      "Group",
      "Subject",
      "Start Time",
      "End Time",
      "Day",
      "Status",
    ]);
  });

  it("lists the browse columns and leaves the teacher relationship off the list", async () => {
    const { listBread } = await import("@/server/browse");
    const listed = await listBread(user({ roleName: "sadmin" }), "class-schedules", "", 1, null);
    expect(listed?.columns.map((column) => column.label)).toEqual(["Group", "Subject", "Start Time", "End Time", "Day", "Status"]);
    expect(listed?.columns.map((column) => column.label)).not.toContain("Teacher");
  });
});
