import { describe, expect, it } from "vitest";
import { presentSkill, skillExportLines, type StoredSkill } from "@/lib/skills";

const ielts: StoredSkill = {
  id: 164,
  title: "IELTS",
  instituteName: "Govt Murapara College",
  details: "Maintain cleanliness and hygiene standards in the kitchen and food\r\npreparation areas.\r\nWash, sanitize, and",
  resultScore: "5",
  certificateFilePath: "",
  status: "A",
  createdAt: "",
  updatedAt: "",
  createdBy: "",
  updatedBy: "",
  examScore: "10",
};

const zeroScore: StoredSkill = {
  id: 200,
  title: "Driving",
  instituteName: "",
  details: "",
  resultScore: "0",
  certificateFilePath: "",
  status: "A",
  createdAt: "",
  updatedAt: "",
  createdBy: "",
  updatedBy: "",
  examScore: "",
};

const sparse: StoredSkill = {
  id: 9,
  title: "",
  instituteName: "",
  details: "",
  resultScore: "",
  certificateFilePath: "",
  status: "A",
  createdAt: "",
  updatedAt: "",
  createdBy: "",
  updatedBy: "",
  examScore: "",
};

describe("stored skills", () => {
  it("keeps the stored title, scores, and status", () => {
    const view = presentSkill(ielts);
    expect(view.title).toBe("IELTS");
    expect(view.resultScore).toBe("5");
    expect(view.examScore).toBe("10");
    expect(view.status).toBe("A");
    expect(view.details).toBe("Maintain cleanliness and hygiene standards in the kitchen and food preparation areas. Wash, sanitize, and");
    expect(view.exportText).toContain("title IELTS");
    expect(view.exportText).toContain("result score 5");
    expect(view.exportText).toContain("exam score 10");
  });

  it("keeps a stored zero and does not fill a blank score", () => {
    const scored = presentSkill(zeroScore);
    const empty = presentSkill(sparse);
    expect(scored.resultScore).toBe("0");
    expect(scored.exportText).toContain("result score 0");
    expect(empty.resultScore).toBe("");
    expect(empty.examScore).toBe("");
    expect(empty.exportText).toContain("result score blank");
    expect(empty.exportText).toContain("exam score blank");
  });

  it("keeps a row whose skill fields are blank", () => {
    const view = presentSkill(sparse);
    expect(view.id).toBe(9);
    expect(view.title).toBe("");
    expect(view.status).toBe("A");
    expect(view.exportText).toContain("id 9");
    expect(view.exportText).toContain("title blank");
    expect(view.exportText).toContain("status A");
  });

  it("does not merge multiple rows", () => {
    expect(skillExportLines([sparse, ielts])).toEqual([
      "Skills",
      presentSkill(sparse).exportText,
      presentSkill(ielts).exportText,
    ]);
    expect(skillExportLines([])).toEqual(["Skills: none stored"]);
  });
});
