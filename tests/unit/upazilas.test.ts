import { describe, expect, it } from "vitest";
import { presentUpazila, upazilaExportLines, type StoredUpazila } from "@/lib/upazilas";

const debidwar: StoredUpazila = {
  id: 1,
  districtId: "1",
  name: "Debidwar",
  bnName: "দেবিদ্বার",
  url: "debidwar.comilla.gov.bd",
};

const barura: StoredUpazila = {
  id: 2,
  districtId: "1",
  name: "Barura",
  bnName: "বরুড়া",
  url: "barura.comilla.gov.bd",
};

const sparse: StoredUpazila = {
  id: 9,
  districtId: "",
  name: "",
  bnName: "",
  url: "",
};

describe("stored upazilas", () => {
  it("keeps the stored name, Bangla name, and URL", () => {
    const view = presentUpazila(debidwar);
    expect(view.name).toBe("Debidwar");
    expect(view.bnName).toBe("দেবিদ্বার");
    expect(view.url).toBe("debidwar.comilla.gov.bd");
    expect(view.districtId).toBe("1");
    expect(view.exportText).toContain("id 1");
    expect(view.exportText).toContain("district 1");
    expect(view.exportText).toContain("name Debidwar");
    expect(view.exportText).toContain("bn দেবিদ্বার");
    expect(view.exportText).toContain("url debidwar.comilla.gov.bd");
  });

  it("keeps a second row for the same district", () => {
    const view = presentUpazila(barura);
    expect(view.id).toBe(2);
    expect(view.districtId).toBe("1");
    expect(view.name).toBe("Barura");
    expect(view.bnName).toBe("বরুড়া");
  });

  it("keeps a row whose text fields are blank", () => {
    const view = presentUpazila(sparse);
    expect(view.id).toBe(9);
    expect(view.name).toBe("");
    expect(view.bnName).toBe("");
    expect(view.url).toBe("");
    expect(view.exportText).toContain("district blank");
    expect(view.exportText).toContain("name blank");
    expect(view.exportText).toContain("bn blank");
    expect(view.exportText).toContain("url blank");
  });

  it("does not merge multiple rows", () => {
    expect(upazilaExportLines([debidwar, barura])).toEqual([
      "Upazilas",
      presentUpazila(debidwar).exportText,
      presentUpazila(barura).exportText,
    ]);
    expect(upazilaExportLines([])).toEqual(["Upazilas: none stored"]);
  });
});
