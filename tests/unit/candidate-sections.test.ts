import { describe, expect, it } from "vitest";
import { alignCandidateCreateFields, arrangeCandidateFields } from "@/components/records/candidate-sections";
import type { FormField } from "@/server/bread-form";

describe("candidate create sections", () => {
  const fields = [
    { name: "status", input: "select" },
    { name: "name", input: "text" },
    { name: "email", input: "email" },
    { name: "passport_no", input: "text" },
    { name: "cv_file_path", input: "file" },
    { name: "agent_id", input: "select" },
    { name: "local_ex", input: "number" },
    { name: "height", input: "text" },
    { name: "password", input: "password" },
    { name: "password_confirmation", input: "password" },
    { name: "present_address_house", input: "textarea" },
    { name: "nationality", input: "text" },
    { name: "invoice_id", input: "hidden" },
    { name: "code", input: "text" },
    { name: "country_id", input: "select" },
    { name: "basic_info_career", input: "textarea" },
    { name: "remarks", input: "textarea" },
  ];

  const arranged = arrangeCandidateFields(fields);

  it("keeps every field once", () => {
    const placed = [...arranged.hidden, ...arranged.sections.flatMap((section) => section.items)];
    expect(placed).toHaveLength(fields.length);
    expect(placed.map((item) => item.field.name).sort()).toEqual(fields.map((field) => field.name).sort());
    expect(new Set(placed.map((item) => item.index)).size).toBe(fields.length);
  });

  it("places the create sections in the requested order and leaves other fields visible", () => {
    expect(arranged.hidden.map((item) => item.field.name)).toEqual(["invoice_id"]);
    expect(arranged.sections.map((section) => section.key)).toEqual([
      "basic",
      "identity",
      "contact",
      "documents",
      "address",
      "relations",
      "experience",
      "physical",
      "access",
      "status",
      "details",
    ]);
    expect(arranged.sections.find((section) => section.key === "basic")?.items.map((item) => item.field.name)).toEqual(["code", "name"]);
    expect(arranged.sections.find((section) => section.key === "identity")?.items.map((item) => item.field.name)).toEqual([
      "country_id",
      "passport_no",
    ]);
    expect(arranged.sections.find((section) => section.key === "experience")?.items.map((item) => item.field.name)).toEqual([
      "local_ex",
      "basic_info_career",
    ]);
    expect(arranged.sections.find((section) => section.key === "access")?.items.map((item) => item.field.name)).toEqual([
      "password",
      "password_confirmation",
    ]);
    expect(arranged.sections.find((section) => section.key === "status")?.items.map((item) => item.field.name)).toEqual(["status"]);
    expect(arranged.sections.find((section) => section.key === "details")?.items.map((item) => item.field.name)).toEqual(["nationality"]);
  });
});

describe("live candidate create alignment", () => {
  function field(name: string, input: FormField["input"], extra: Partial<FormField> = {}): FormField {
    return { name, label: name, input, required: false, multiple: false, options: [], value: "", ...extra };
  }

  it("keeps live fields, hides the two defaults, and drops fields the live form does not show", () => {
    const aligned = alignCandidateCreateFields([
      field("balance", "text"),
      field("agent_id", "text"),
      field("agent_id", "select", { label: "Agent", required: true }),
      field("name", "text", { label: "Name" }),
      field("nationality", "text"),
      field("blood_group", "select", { options: [{ value: "A+", label: "A+" }] }),
      field("code", "text"),
      field("cv_file_path", "file"),
      field("full_photo_file_path", "file"),
      field("mobile", "text"),
      field("marital_status", "select"),
      field("present_address_road", "text"),
      field("invoice_id", "hidden", { value: "4" }),
    ]);
    expect(aligned.map((item) => item.name)).toEqual([
      "nationality",
      "blood_group",
      "code",
      "name",
      "cv_file_path",
      "full_photo_file_path",
      "mobile",
      "agent_id",
      "password",
      "password_confirmation",
      "invoice_id",
    ]);
    expect(aligned.find((item) => item.name === "nationality")).toMatchObject({ input: "hidden", value: "Bangladesh" });
    expect(aligned.find((item) => item.name === "blood_group")).toMatchObject({ input: "hidden", value: "A+" });
    expect(aligned.find((item) => item.name === "code")).toMatchObject({ readOnly: true, value: "", placeholder: "#######" });
    expect(aligned.find((item) => item.name === "name")?.required).toBe(true);
    expect(aligned.find((item) => item.name === "agent_id")).toMatchObject({ input: "select", required: true });
    expect(aligned.find((item) => item.name === "cv_file_path")?.accept).toBeNull();
    expect(aligned.find((item) => item.name === "full_photo_file_path")?.accept).toBe("image/*");
    expect(aligned.find((item) => item.name === "mobile")?.maxLength).toBe(14);
    expect(aligned.find((item) => item.name === "password")).toMatchObject({ label: "Password", input: "text" });
    expect(aligned.find((item) => item.name === "password_confirmation")?.label).toBe("Re-Password");
  });

  it("keeps an allocated candidate code as the value and does not replace it with the placeholder", () => {
    const aligned = alignCandidateCreateFields([field("code", "text", { value: "120045" })]);
    const code = aligned.find((item) => item.name === "code");
    expect(code).toMatchObject({ readOnly: true, value: "120045" });
    expect(code?.placeholder).toBeUndefined();
  });
});
