import { describe, expect, it } from "vitest";
import { languageExportLines, presentLanguage, type StoredLanguage } from "@/lib/language-list";

const bangla: StoredLanguage = {
  id: 19,
  languageName: "Bangla",
  languageStatus: "Very Good",
  createdAt: "",
  updatedAt: "",
};

const hindi: StoredLanguage = {
  id: 243,
  languageName: "Hindi",
  languageStatus: "Only For Speaking",
  createdAt: "",
  updatedAt: "",
};

const sparse: StoredLanguage = {
  id: 46,
  languageName: "",
  languageStatus: "",
  createdAt: "",
  updatedAt: "",
};

describe("stored language list", () => {
  it("keeps the stored language name and status", () => {
    const view = presentLanguage(bangla);
    expect(view.languageName).toBe("Bangla");
    expect(view.languageStatus).toBe("Very Good");
    expect(view.createdAt).toBe("");
    expect(view.updatedAt).toBe("");
    expect(view.exportText).toContain("id 19");
    expect(view.exportText).toContain("language Bangla");
    expect(view.exportText).toContain("status Very Good");
    expect(view.exportText).toContain("created blank");
    expect(view.exportText).toContain("updated blank");
  });

  it("keeps a stored status phrase and does not rewrite it", () => {
    const view = presentLanguage(hindi);
    expect(view.languageStatus).toBe("Only For Speaking");
    expect(view.exportText).toContain("status Only For Speaking");
  });

  it("keeps a row whose language fields are blank", () => {
    const view = presentLanguage(sparse);
    expect(view.id).toBe(46);
    expect(view.languageName).toBe("");
    expect(view.languageStatus).toBe("");
    expect(view.exportText).toContain("language blank");
    expect(view.exportText).toContain("status blank");
  });

  it("does not merge multiple rows", () => {
    expect(languageExportLines([bangla, hindi])).toEqual([
      "Language list",
      presentLanguage(bangla).exportText,
      presentLanguage(hindi).exportText,
    ]);
    expect(languageExportLines([])).toEqual(["Language list: none stored"]);
  });
});
