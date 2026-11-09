import { describe, expect, it } from "vitest";
import {
  addLabel,
  columnHeading,
  isStatusColumn,
  listingCountLabel,
  listingDescription,
  singularize,
  statusTone,
} from "@/components/records/listing";

describe("listing presentation", () => {
  it("describes known directories and falls back for the rest", () => {
    expect(listingDescription("users", "Users")).toMatch(/accounts/i);
    expect(listingDescription("candidates", "Candidates")).toMatch(/placement/i);
    expect(listingDescription("document-types", "Document Types")).toMatch(/document types/i);
    expect(listingDescription("custom-things", "Custom Things")).toBe("Search, review, and manage custom things.");
  });

  it("builds an add label from the directory title", () => {
    expect(singularize("Users")).toBe("User");
    expect(singularize("Companies")).toBe("Company");
    expect(singularize("Document Types")).toBe("Document Type");
    expect(singularize("Class Groups")).toBe("Class Group");
    expect(singularize("Status")).toBe("Status");
    expect(addLabel("Employees")).toBe("Add Employee");
    expect(addLabel("")).toBe("Add New");
  });

  it("formats the count line like a directory summary", () => {
    expect(listingCountLabel("Users", 1, 24, 24)).toBe("24 of 24 users");
    expect(listingCountLabel("Users", 11, 20, 24)).toBe("11–20 of 24 users");
    expect(listingCountLabel("Users", 0, 0, 0)).toBe("0 users");
  });

  it("recognizes status columns and short status values", () => {
    expect(isStatusColumn("Status")).toBe(true);
    expect(isStatusColumn("Company Status")).toBe(true);
    expect(isStatusColumn("verification_status")).toBe(true);
    expect(isStatusColumn("Name")).toBe(false);
    expect(isStatusColumn("status_date")).toBe(false);
    expect(statusTone("Active")).toBe("success");
    expect(statusTone("Reserved")).toBe("warning");
    expect(statusTone("Inactive")).toBe("danger");
    expect(statusTone("Registration")).toBe("info");
    expect(statusTone("Processing batch")).toBe("neutral");
    expect(statusTone("A")).toBeNull();
    expect(statusTone("")).toBeNull();
  });

  it("spaces raw column keys for headings", () => {
    expect(columnHeading("role_id")).toBe("role id");
    expect(columnHeading("Name")).toBe("Name");
  });
});
