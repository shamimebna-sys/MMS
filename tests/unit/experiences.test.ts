import { describe, expect, it } from "vitest";
import { experienceExportLines, presentExperience, type StoredExperience } from "@/lib/experiences";

const delivery: StoredExperience = {
  id: 112,
  companyName: "Kichaan",
  companyAddress: "Meherpur Sadar",
  countryId: "",
  designation: "Delivery  Man",
  department: "",
  startDate: "2022-04-05",
  endDate: "2024-04-01",
  responsibilities: "Assisting in product delivery\r\nReporting daily delivery status",
  expertise: "",
  descriptions: "",
  achievements: "",
  status: "A",
  createdAt: "",
  updatedAt: "",
  createdBy: "",
  updatedBy: "",
};

const second: StoredExperience = {
  id: 113,
  companyName: "Hotel Royal Palace",
  companyAddress: "31/D Topkhana Road",
  countryId: "19",
  designation: "Guest Relationship Officer",
  department: "Front office",
  startDate: "2024-01-01",
  endDate: "",
  responsibilities: "",
  expertise: "",
  descriptions: "",
  achievements: "",
  status: "A",
  createdAt: "",
  updatedAt: "",
  createdBy: "4",
  updatedBy: "",
};

const sparse: StoredExperience = {
  id: 9,
  companyName: "",
  companyAddress: "",
  countryId: "",
  designation: "",
  department: "",
  startDate: "2012-04-05",
  endDate: "2012-04-19",
  responsibilities: "",
  expertise: "",
  descriptions: "",
  achievements: "",
  status: "A",
  createdAt: "",
  updatedAt: "",
  createdBy: "",
  updatedBy: "",
};

describe("stored experiences", () => {
  it("keeps the stored company, designation, dates, and status", () => {
    const view = presentExperience(delivery);
    expect(view.companyName).toBe("Kichaan");
    expect(view.designation).toBe("Delivery  Man");
    expect(view.startDate).toBe("2022-04-05");
    expect(view.endDate).toBe("2024-04-01");
    expect(view.status).toBe("A");
    expect(view.responsibilities).toBe("Assisting in product delivery Reporting daily delivery status");
    expect(view.exportText).toContain("company Kichaan");
    expect(view.exportText).toContain("status A");
  });

  it("leaves country id as the stored value", () => {
    const view = presentExperience(second);
    expect(view.countryId).toBe("19");
    expect(view.exportText).toContain("country id 19");
    expect(view.createdBy).toBe("4");
    expect(view.endDate).toBe("");
  });

  it("keeps a row whose work fields are blank", () => {
    const view = presentExperience(sparse);
    expect(view.id).toBe(9);
    expect(view.companyName).toBe("");
    expect(view.designation).toBe("");
    expect(view.status).toBe("A");
    expect(view.exportText).toContain("id 9");
    expect(view.exportText).toContain("company blank");
    expect(view.exportText).toContain("designation blank");
    expect(view.exportText).toContain("start 2012-04-05");
  });

  it("does not merge multiple rows", () => {
    expect(experienceExportLines([sparse, delivery])).toEqual([
      "Experience",
      presentExperience(sparse).exportText,
      presentExperience(delivery).exportText,
    ]);
    expect(experienceExportLines([])).toEqual(["Experience: none stored"]);
  });
});
