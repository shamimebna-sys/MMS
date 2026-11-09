import { describe, expect, it } from "vitest";
import { presentTraining, trainingExportLines, type StoredTraining } from "@/lib/trainings";

const kitchen: StoredTraining = {
  id: 168,
  title: "Kitchen Cleaner",
  instituteName: "Bhulta High School",
  topics: "Humanities",
  startDate: "2025-08-01",
  endDate: "2025-08-31",
  duration: "0",
  durationType: "",
  countryId: "Bangladesh",
  descriptions: "",
  achievements: "",
  certificateFilePath: "",
  status: "A",
  createdAt: "",
  updatedAt: "",
  createdBy: "",
  updatedBy: "",
  address: "Plot # 35, Road#1/A, Block # I, Dhaka 1212",
};

const sparse: StoredTraining = {
  id: 9,
  title: "",
  instituteName: "",
  topics: "",
  startDate: "",
  endDate: "",
  duration: "0",
  durationType: "",
  countryId: "",
  descriptions: "",
  achievements: "",
  certificateFilePath: "",
  status: "A",
  createdAt: "",
  updatedAt: "",
  createdBy: "",
  updatedBy: "",
  address: "",
};

describe("stored trainings", () => {
  it("keeps the stored title, dates, country id, and status", () => {
    const view = presentTraining(kitchen);
    expect(view.title).toBe("Kitchen Cleaner");
    expect(view.startDate).toBe("2025-08-01");
    expect(view.endDate).toBe("2025-08-31");
    expect(view.countryId).toBe("Bangladesh");
    expect(view.address).toBe("Plot # 35, Road#1/A, Block # I, Dhaka 1212");
    expect(view.status).toBe("A");
    expect(view.exportText).toContain("title Kitchen Cleaner");
    expect(view.exportText).toContain("country id Bangladesh");
  });

  it("keeps a stored duration of zero", () => {
    const view = presentTraining(kitchen);
    expect(view.duration).toBe("0");
    expect(view.durationType).toBe("");
    expect(view.exportText).toContain("duration 0");
    expect(view.exportText).toContain("duration type blank");
  });

  it("keeps a row whose training fields are blank", () => {
    const view = presentTraining(sparse);
    expect(view.id).toBe(9);
    expect(view.title).toBe("");
    expect(view.countryId).toBe("");
    expect(view.duration).toBe("0");
    expect(view.status).toBe("A");
    expect(view.exportText).toContain("id 9");
    expect(view.exportText).toContain("title blank");
    expect(view.exportText).toContain("country id blank");
    expect(view.exportText).toContain("duration 0");
  });

  it("does not merge multiple rows", () => {
    expect(trainingExportLines([sparse, kitchen])).toEqual([
      "Training",
      presentTraining(sparse).exportText,
      presentTraining(kitchen).exportText,
    ]);
    expect(trainingExportLines([])).toEqual(["Training: none stored"]);
  });
});
