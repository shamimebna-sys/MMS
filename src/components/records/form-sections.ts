export type RecordSectionKey =
  | "identity"
  | "contact"
  | "identification"
  | "relations"
  | "specifications"
  | "access"
  | "notes"
  | "details";

export type PlacedField<T> = { field: T; index: number };

const ORDER: RecordSectionKey[] = [
  "identity",
  "contact",
  "identification",
  "relations",
  "specifications",
  "access",
  "notes",
  "details",
];

const COPY: Record<RecordSectionKey, { title: string; description: string }> = {
  identity: {
    title: "Identity",
    description: "Name, code, and the main details used to recognize this record.",
  },
  contact: {
    title: "Contact",
    description: "Phone, email, and address details for this record.",
  },
  identification: {
    title: "Identification",
    description: "Unique identifiers used for the record and compliance.",
  },
  relations: {
    title: "Related records",
    description: "Links to other records already stored in the system.",
  },
  specifications: {
    title: "Specifications",
    description: "Status, dates, amounts, and other stored values.",
  },
  access: {
    title: "Access",
    description: "Sign-in fields. On edit, leave a password blank to keep the current one.",
  },
  notes: {
    title: "Notes",
    description: "Longer descriptions and remarks.",
  },
  details: {
    title: "Additional details",
    description: "Other fields stored on this record.",
  },
};

export function recordSectionCopy(key: RecordSectionKey): { title: string; description: string } {
  return COPY[key];
}

export function sectionKeyFor(name: string, input: string): RecordSectionKey {
  const normalized = name.toLowerCase();
  if (normalized.includes("password")) return "access";
  if (/_id$/.test(normalized)) return "relations";
  if (/(email|phone|mobile|fax|whatsapp|address|city|district|division|country|zip|postal|contact|thana|upazila)/.test(normalized)) {
    return "contact";
  }
  if (/(passport|nid|national|chassis|engine|registration|licen[cs]e|tin|bin|visa|arc|birth|dob)/.test(normalized)) {
    return "identification";
  }
  if (input === "file" || /(avatar|photo|image|logo|picture)/.test(normalized)) return "identity";
  if (/(^|_)(name|title|code)($|_)|brand|model|variant|colou?r|stock/.test(normalized)) return "identity";
  if (
    input === "date" ||
    input === "time" ||
    input === "number" ||
    input === "checkbox" ||
    /(status|type|gender|blood|religion|marital|fuel|transmission|drive|seat|door|size|year|amount|price|fee|salary|currency|qty|quantity)/.test(normalized)
  ) {
    return "specifications";
  }
  if (input === "textarea" || /(description|remark|remarks|note|notes|comment|comments|bio|about)/.test(normalized)) {
    return "notes";
  }
  return "details";
}

/** Group visible fields for display. Hidden fields stay out of the sections and every field is kept once. */
export function arrangeRecordFields<T extends { name: string; input: string }>(fields: T[]): {
  hidden: PlacedField<T>[];
  sections: Array<{ key: RecordSectionKey; items: PlacedField<T>[] }>;
} {
  const tagged = fields.map((field, index) => ({ field, index }));
  const hidden = tagged.filter((item) => item.field.input === "hidden");
  const buckets = new Map<RecordSectionKey, PlacedField<T>[]>();
  for (const item of tagged) {
    if (item.field.input === "hidden") continue;
    const key = sectionKeyFor(item.field.name, item.field.input);
    const list = buckets.get(key) ?? [];
    list.push(item);
    buckets.set(key, list);
  }
  const sections = ORDER.filter((key) => (buckets.get(key)?.length ?? 0) > 0).map((key) => ({
    key,
    items: buckets.get(key) ?? [],
  }));
  return { hidden, sections };
}
