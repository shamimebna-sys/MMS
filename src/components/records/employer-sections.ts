export type EmployerSection = {
  key: string;
  title: string;
  description: string;
  names: readonly string[];
};

export const EMPLOYER_SECTIONS: readonly EmployerSection[] = [
  {
    key: "identity",
    title: "Identity",
    description: "Code, name, photos, and family names used to recognize this employer.",
    names: ["code", "name", "full_photo_file_path", "half_photo_file_path", "father_name", "mother_name", "cv_file_path"],
  },
  {
    key: "contact",
    title: "Contact",
    description: "Email, phone, and address details for this employer.",
    names: ["email", "secondary_email", "mobile", "secondary_mobile", "emergency_mobile", "present_address_house", "permanent_address_house"],
  },
  {
    key: "identification",
    title: "Identification",
    description: "National ID, passport, and date of birth.",
    names: ["nid", "nid_file_path", "passport_no", "passport_issue_date", "passport_expire_date", "passport_file_path", "dob", "nationality"],
  },
  {
    key: "personal",
    title: "Personal details",
    description: "Gender, blood group, and the status stored on this record.",
    names: ["gender", "blood_group", "status"],
  },
] as const;

export type PlacedEmployerField<T> = { field: T; index: number };

/** Group employer fields for display. Hidden fields stay hidden, and every field is kept once. */
export function arrangeEmployerFields<T extends { name: string; input: string }>(fields: T[]): {
  hidden: PlacedEmployerField<T>[];
  sections: Array<EmployerSection & { items: PlacedEmployerField<T>[] }>;
} {
  const tagged = fields.map((field, index) => ({ field, index }));
  const hidden = tagged.filter((item) => item.field.input === "hidden");
  const visible = tagged.filter((item) => item.field.input !== "hidden");
  const claimed = new Set<number>();
  const sections = EMPLOYER_SECTIONS.map((section) => {
    const items: PlacedEmployerField<T>[] = [];
    for (const name of section.names) {
      for (const item of visible) {
        if (item.field.name !== name || claimed.has(item.index)) continue;
        items.push(item);
        claimed.add(item.index);
      }
    }
    return { ...section, items };
  }).filter((section) => section.items.length > 0);
  const rest = visible.filter((item) => !claimed.has(item.index));
  if (rest.length > 0) {
    sections.push({
      key: "details",
      title: "Additional details",
      description: "Other fields stored on this employer.",
      names: rest.map((item) => item.field.name),
      items: rest,
    });
  }
  return { hidden, sections };
}
