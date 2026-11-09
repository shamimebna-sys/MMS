import { describe, expect, it } from "vitest";
import { educationExportLines, presentEducation, type StoredEducation } from "@/lib/educations";

const hsc: StoredEducation = {
  id: 86,
  examName: "H.S.C",
  instituteName: "Mosarraf Hossain Khan Chowdhury University College",
  subjectGroupMajor: "Business studya",
  educationLabel: "",
  startDate: "",
  endDate: "",
  durationYear: "2",
  resultType: "",
  result: "4.33",
  achievements: "",
  certificateFilePath: "",
  status: "A",
  createdAt: "",
  updatedAt: "",
  createdBy: "",
  updatedBy: "",
  boardName: "Cumilla",
  scale: "5",
  passingYear: "2019",
};

const ssc: StoredEducation = {
  id: 108,
  examName: "Secondary School Certificate (SSC)",
  instituteName: "Govipur High School",
  subjectGroupMajor: "Humanitarian",
  educationLabel: "SSC",
  startDate: "",
  endDate: "",
  durationYear: "5",
  resultType: "",
  result: "4.75",
  achievements: "",
  certificateFilePath: "",
  status: "A",
  createdAt: "",
  updatedAt: "",
  createdBy: "",
  updatedBy: "",
  boardName: "Jessore",
  scale: "5.00",
  passingYear: "2015",
};

const sparse: StoredEducation = {
  id: 9,
  examName: "",
  instituteName: "",
  subjectGroupMajor: "",
  educationLabel: "",
  startDate: "",
  endDate: "",
  durationYear: "",
  resultType: "",
  result: "",
  achievements: "",
  certificateFilePath: "",
  status: "A",
  createdAt: "",
  updatedAt: "",
  createdBy: "",
  updatedBy: "",
  boardName: "",
  scale: "",
  passingYear: "",
};

describe("stored educations", () => {
  it("keeps the stored exam, result, scale, and status", () => {
    const view = presentEducation(hsc);
    expect(view.examName).toBe("H.S.C");
    expect(view.subjectGroupMajor).toBe("Business studya");
    expect(view.durationYear).toBe("2");
    expect(view.result).toBe("4.33");
    expect(view.scale).toBe("5");
    expect(view.passingYear).toBe("2019");
    expect(view.status).toBe("A");
    expect(view.exportText).toContain("exam H.S.C");
    expect(view.exportText).toContain("result 4.33");
  });

  it("keeps a label and a scale that includes decimals", () => {
    const view = presentEducation(ssc);
    expect(view.educationLabel).toBe("SSC");
    expect(view.scale).toBe("5.00");
    expect(view.exportText).toContain("label SSC");
    expect(view.exportText).toContain("scale 5.00");
  });

  it("keeps a row whose education fields are blank", () => {
    const view = presentEducation(sparse);
    expect(view.id).toBe(9);
    expect(view.examName).toBe("");
    expect(view.durationYear).toBe("");
    expect(view.status).toBe("A");
    expect(view.exportText).toContain("id 9");
    expect(view.exportText).toContain("exam blank");
    expect(view.exportText).toContain("status A");
  });

  it("does not merge multiple rows", () => {
    expect(educationExportLines([sparse, hsc])).toEqual([
      "Education",
      presentEducation(sparse).exportText,
      presentEducation(hsc).exportText,
    ]);
    expect(educationExportLines([])).toEqual(["Education: none stored"]);
  });
});
