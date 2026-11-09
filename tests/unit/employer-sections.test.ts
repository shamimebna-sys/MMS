import { describe, expect, it } from "vitest";
import { arrangeEmployerFields } from "@/components/records/employer-sections";

describe("employer form sections", () => {
  const fields = [
    { name: "status", input: "select" },
    { name: "email", input: "email" },
    { name: "code", input: "text" },
    { name: "nid_file_path", input: "file" },
    { name: "name", input: "text" },
    { name: "mobile", input: "text" },
    { name: "present_address_house", input: "text" },
    { name: "full_photo_file_path", input: "file" },
    { name: "half_photo_file_path", input: "file" },
    { name: "father_name", input: "text" },
    { name: "mother_name", input: "text" },
    { name: "cv_file_path", input: "file" },
    { name: "passport_no", input: "text" },
    { name: "permanent_address_house", input: "textarea" },
    { name: "custom_flag", input: "text" },
    { name: "candidate_id", input: "hidden" },
  ];

  const arranged = arrangeEmployerFields(fields);

  it("keeps every field once", () => {
    const placed = [...arranged.hidden, ...arranged.sections.flatMap((section) => section.items)];
    expect(placed).toHaveLength(fields.length);
    expect(placed.map((item) => item.index).sort((a, b) => a - b)).toEqual([...fields.keys()]);
  });

  it("follows the employer section order", () => {
    expect(arranged.sections.map((section) => section.key)).toEqual(["identity", "contact", "identification", "personal", "details"]);
    expect(arranged.sections[0]?.items.map((item) => item.field.name)).toEqual([
      "code",
      "name",
      "full_photo_file_path",
      "half_photo_file_path",
      "father_name",
      "mother_name",
      "cv_file_path",
    ]);
    expect(arranged.sections[1]?.items.map((item) => item.field.name)).toEqual([
      "email",
      "mobile",
      "present_address_house",
      "permanent_address_house",
    ]);
    expect(arranged.sections[2]?.items.map((item) => item.field.name)).toEqual(["nid_file_path", "passport_no"]);
    expect(arranged.hidden.map((item) => item.field.name)).toEqual(["candidate_id"]);
    expect(arranged.sections.at(-1)?.items.map((item) => item.field.name)).toEqual(["custom_flag"]);
  });
});
