import { describe, expect, it } from "vitest";
import { filterRoleOptions, nextRoleOptionIndex, type RoleOption } from "@/components/records/role-select";
import { dropDuplicateUserRoleText } from "@/server/user-role-field";

const roles: RoleOption[] = [
  { value: "1", label: "Super Admin" },
  { value: "2", label: "Administrator" },
  { value: "100", label: "Normal User" },
  { value: "101", label: "Agent" },
  { value: "106", label: "owner" },
  { value: "109", label: "Sub Agent" },
  { value: "110", label: "Others" },
];

describe("role dropdown search", () => {
  it("filters labels without changing stored values", () => {
    const matches = filterRoleOptions(roles, "agent");
    expect(matches.map((option) => option.label)).toEqual(["Agent", "Sub Agent"]);
    expect(matches.map((option) => option.value)).toEqual(["101", "109"]);
  });

  it("matches case-insensitively and ignores surrounding spaces", () => {
    expect(filterRoleOptions(roles, "  OWNER ").map((option) => option.value)).toEqual(["106"]);
    expect(filterRoleOptions(roles, "admin").map((option) => option.value)).toEqual(["1", "2"]);
  });

  it("restores every option when the search is cleared", () => {
    expect(filterRoleOptions(roles, "")).toEqual(roles);
    expect(filterRoleOptions(roles, "   ")).toEqual(roles);
  });

  it("returns no options when nothing matches", () => {
    expect(filterRoleOptions(roles, "missing")).toEqual([]);
  });
});

describe("role dropdown keyboard index", () => {
  it("moves through options and wraps at both ends", () => {
    expect(nextRoleOptionIndex(0, 1, 3)).toBe(1);
    expect(nextRoleOptionIndex(2, 1, 3)).toBe(0);
    expect(nextRoleOptionIndex(0, -1, 3)).toBe(2);
  });

  it("starts at the matching end when nothing is active", () => {
    expect(nextRoleOptionIndex(-1, 1, 4)).toBe(0);
    expect(nextRoleOptionIndex(-1, -1, 4)).toBe(3);
    expect(nextRoleOptionIndex(0, 1, 0)).toBe(-1);
  });
});

function field(partial: { name: string; input: string; label: string; value: string; options?: RoleOption[] }) {
  return { required: false, multiple: false, options: partial.options ?? [], ...partial };
}

describe("duplicate user role text field", () => {
  it("drops the plain text role input when the relationship select is present", () => {
    const select = field({
      name: "role_id",
      input: "select",
      label: "Role",
      value: "2",
      options: [{ value: "2", label: "Administrator" }],
    });
    const result = dropDuplicateUserRoleText([
      field({ name: "name", input: "text", label: "Name", value: "Ada" }),
      field({ name: "role_id", input: "text", label: "Role", value: "2" }),
      select,
      field({ name: "status", input: "select", label: "Status", value: "A", options: [{ value: "A", label: "Active" }] }),
    ]);
    expect(result.map((item) => `${item.name}:${item.input}`)).toEqual(["name:text", "role_id:select", "status:select"]);
    expect(result.find((item) => item.name === "role_id")).toMatchObject({ value: "2", options: [{ value: "2", label: "Administrator" }] });
  });

  it("keeps a lone role text field when no role select exists", () => {
    const fields = [field({ name: "role_id", input: "text", label: "Role", value: "2" })];
    expect(dropDuplicateUserRoleText(fields)).toEqual(fields);
  });
});
