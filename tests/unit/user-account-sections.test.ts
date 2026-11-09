import { describe, expect, it } from "vitest";
import { arrangeUserFields } from "@/components/records/user-account-sections";

function field(name: string, input = "text") {
  return { name, input };
}

describe("user account form sections", () => {
  const fields = [
    field("avatar", "file"),
    field("name"),
    field("email", "email"),
    field("password", "password"),
    field("email_verified_at"),
    field("role_id", "select"),
    field("user_type_id"),
    field("teacher_id"),
    field("employee_id"),
    field("user_type_id", "select"),
    field("candidate_id"),
    field("employer_id"),
    field("status", "select"),
    field("notes", "textarea"),
    field("legacy_flag", "hidden"),
  ];

  const arranged = arrangeUserFields(fields);

  it("keeps every field exactly once", () => {
    const placed = [...arranged.hidden, ...arranged.sections.flatMap((section) => section.items)];
    expect(placed).toHaveLength(fields.length);
    expect(placed.map((item) => item.index).sort((a, b) => a - b)).toEqual([...fields.keys()]);
  });

  it("places profile, account, and related fields in section order", () => {
    expect(arranged.sections.map((section) => section.key)).toEqual(["profile", "account", "related", "other"]);
    expect(arranged.sections[0]?.items.map((item) => item.field.name)).toEqual(["avatar", "name", "email", "password"]);
    expect(arranged.sections[1]?.items.map((item) => `${item.field.name}:${item.field.input}`)).toEqual([
      "role_id:select",
      "user_type_id:text",
      "user_type_id:select",
      "status:select",
      "email_verified_at:text",
    ]);
    expect(arranged.sections[2]?.items.map((item) => item.field.name)).toEqual([
      "teacher_id",
      "employee_id",
      "candidate_id",
      "employer_id",
    ]);
  });

  it("keeps the user type text field ahead of the user type select", () => {
    const account = arranged.sections.find((section) => section.key === "account")?.items ?? [];
    const indexes = account.filter((item) => item.field.name === "user_type_id").map((item) => item.index);
    expect(indexes[0]).toBeLessThan(indexes[1] ?? -1);
    expect(account.find((item) => item.field.name === "user_type_id")?.field.input).toBe("text");
  });

  it("separates hidden fields and leaves unknown fields in their original order", () => {
    expect(arranged.hidden.map((item) => item.field.name)).toEqual(["legacy_flag"]);
    expect(arranged.sections.find((section) => section.key === "other")?.items.map((item) => item.field.name)).toEqual(["notes"]);
  });
});
