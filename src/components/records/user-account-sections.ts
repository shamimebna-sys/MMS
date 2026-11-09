export const USER_FORM_SECTIONS = [
  {
    key: "profile",
    title: "Profile information",
    description: "Photo, name, email, and password for this account.",
    fields: ["avatar", "name", "email", "password"],
  },
  {
    key: "account",
    title: "Account configuration",
    description: "Role, user type, account status, and email verification.",
    fields: ["role_id", "user_type_id", "status", "email_verified_at"],
  },
  {
    key: "related",
    title: "Related information",
    description: "Optional links to teacher, employee, candidate, and employer records.",
    fields: ["teacher_id", "employee_id", "candidate_id", "employer_id"],
  },
] as const;

export type UserFormSectionKey = (typeof USER_FORM_SECTIONS)[number]["key"] | "other";

export type PlacedField<T> = { field: T; index: number };

const OTHER_SECTION = {
  key: "other" as const,
  title: "Additional details",
  description: "Other information stored on this account.",
};

export function userSectionCopy(key: UserFormSectionKey): { title: string; description: string } {
  if (key === "other") return OTHER_SECTION;
  const section = USER_FORM_SECTIONS.find((item) => item.key === key);
  return { title: section?.title ?? "Details", description: section?.description ?? "" };
}

/** Group visible user-form fields into sections. Duplicate names keep their original order. */
export function arrangeUserFields<T extends { name: string; input: string }>(fields: T[]): {
  hidden: PlacedField<T>[];
  sections: Array<{ key: UserFormSectionKey; items: PlacedField<T>[] }>;
} {
  const tagged = fields.map((field, index) => ({ field, index }));
  const hidden = tagged.filter((item) => item.field.input === "hidden");
  const visible = tagged.filter((item) => item.field.input !== "hidden");
  const claimed = new Set<number>();
  const sections: Array<{ key: UserFormSectionKey; items: PlacedField<T>[] }> = USER_FORM_SECTIONS.map((section) => {
    const items: PlacedField<T>[] = [];
    for (const name of section.fields) {
      for (const item of visible) {
        if (item.field.name !== name || claimed.has(item.index)) continue;
        items.push(item);
        claimed.add(item.index);
      }
    }
    return { key: section.key, items };
  });
  const other = visible.filter((item) => !claimed.has(item.index));
  if (other.length > 0) sections.push({ key: "other", items: other });
  return { hidden, sections: sections.filter((section) => section.items.length > 0) };
}
