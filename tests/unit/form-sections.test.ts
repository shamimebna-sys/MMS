import { describe, expect, it } from "vitest";
import { arrangeRecordFields, sectionKeyFor } from "@/components/records/form-sections";

describe("record form sections", () => {
  const fields = [
    { name: "name", input: "text" },
    { name: "email", input: "email" },
    { name: "passport_no", input: "text" },
    { name: "company_id", input: "select" },
    { name: "status", input: "select" },
    { name: "password", input: "password" },
    { name: "remarks", input: "textarea" },
    { name: "custom_flag", input: "text" },
    { name: "candidate_id", input: "hidden" },
  ];

  const arranged = arrangeRecordFields(fields);

  it("keeps every field once and preserves order inside a section", () => {
    const placed = [...arranged.hidden, ...arranged.sections.flatMap((section) => section.items)];
    expect(placed).toHaveLength(fields.length);
    expect(placed.map((item) => item.index).sort((a, b) => a - b)).toEqual([...fields.keys()]);
    expect(arranged.sections.find((section) => section.key === "identity")?.items.map((item) => item.field.name)).toEqual(["name"]);
    expect(arranged.sections.find((section) => section.key === "details")?.items.map((item) => item.field.name)).toEqual([
      "custom_flag",
    ]);
  });

  it("splits identity, contact, identification, relations, and notes", () => {
    expect(arranged.hidden.map((item) => item.field.name)).toEqual(["candidate_id"]);
    expect(arranged.sections.map((section) => section.key)).toEqual([
      "identity",
      "contact",
      "identification",
      "relations",
      "specifications",
      "access",
      "notes",
      "details",
    ]);
  });

  it("classifies ids separately from names", () => {
    expect(sectionKeyFor("company_name", "text")).toBe("identity");
    expect(sectionKeyFor("company_id", "select")).toBe("relations");
    expect(sectionKeyFor("present_address", "textarea")).toBe("contact");
    expect(sectionKeyFor("joining_date", "date")).toBe("specifications");
    expect(sectionKeyFor("avatar", "file")).toBe("identity");
  });
});
