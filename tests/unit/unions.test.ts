import { describe, expect, it } from "vitest";
import { presentUpazila, type StoredUpazila } from "@/lib/upazilas";
import { presentUnion, unionsForUpazila, upazilaUnionExportLines, type StoredUnion } from "@/lib/unions";

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

const subil: StoredUnion = {
  id: 1,
  upazillaId: "1",
  name: "Subil",
  bnName: "সুবিল",
  url: "subilup.comilla.gov.bd",
};

const north: StoredUnion = {
  id: 2,
  upazillaId: "1",
  name: "North Gunaighor",
  bnName: "উত্তর গুনাইঘর",
  url: "gunaighornorthup.comilla.gov.bd",
};

const laterNorth: StoredUnion = {
  id: 30,
  upazillaId: "1",
  name: "North Gunaighor",
  bnName: "উত্তর গুনাইঘর",
  url: "other.example",
};

const baruraUnion: StoredUnion = {
  id: 8,
  upazillaId: "2",
  name: "Debidwar",
  bnName: "দেবিদ্বার",
  url: "debidwarup.example",
};

const otherParent: StoredUnion = {
  id: 4,
  upazillaId: "99",
  name: "Subil",
  bnName: "সুবিল",
  url: "subilup.example",
};

const blankParent: StoredUnion = {
  id: 11,
  upazillaId: "",
  name: "Subil",
  bnName: "",
  url: "",
};

const sparse: StoredUnion = {
  id: 9,
  upazillaId: "1",
  name: "",
  bnName: "",
  url: "",
};

describe("stored unions", () => {
  it("groups unions by the stored upazilla id and does not match names", () => {
    const rows = [subil, baruraUnion, otherParent, blankParent, north];
    expect(unionsForUpazila(rows, debidwar.id).map((row) => row.id)).toEqual([1, 2]);
    expect(unionsForUpazila(rows, barura.id).map((row) => row.id)).toEqual([8]);
    expect(unionsForUpazila(rows, barura.id)[0]?.name).toBe("Debidwar");
    expect(unionsForUpazila(rows, 99).map((row) => row.id)).toEqual([4]);
    expect(unionsForUpazila(rows, 1).some((row) => row.name === "Subil" && row.upazillaId === "99")).toBe(false);
  });

  it("keeps separate rows that share a name and orders them by legacy id", () => {
    const grouped = unionsForUpazila([laterNorth, subil, north], 1);
    expect(grouped.map((row) => row.id)).toEqual([1, 2, 30]);
    expect(grouped.filter((row) => row.name === "North Gunaighor")).toHaveLength(2);
  });

  it("keeps a row whose text fields are blank", () => {
    const view = presentUnion(sparse);
    expect(view.id).toBe(9);
    expect(view.upazillaId).toBe("1");
    expect(view.name).toBe("");
    expect(view.bnName).toBe("");
    expect(view.url).toBe("");
    expect(view.exportText).toContain("upazila 1");
    expect(view.exportText).toContain("name blank");
    expect(view.exportText).toContain("bn blank");
    expect(view.exportText).toContain("url blank");
  });

  it("keeps a blank parent id unmatched", () => {
    const view = presentUnion(blankParent);
    expect(view.upazillaId).toBe("");
    expect(view.exportText).toContain("upazila blank");
    expect(unionsForUpazila([blankParent], 1)).toEqual([]);
  });

  it("places each upazila's unions under that upazila and reports an empty list", () => {
    expect(upazilaUnionExportLines([debidwar, barura], [north, baruraUnion, subil, otherParent])).toEqual([
      "Upazilas",
      presentUpazila(debidwar).exportText,
      "Unions",
      presentUnion(subil).exportText,
      presentUnion(north).exportText,
      presentUpazila(barura).exportText,
      "Unions",
      presentUnion(baruraUnion).exportText,
    ]);
    expect(upazilaUnionExportLines([barura], [])).toEqual([
      "Upazilas",
      presentUpazila(barura).exportText,
      "Unions: none stored",
    ]);
    expect(upazilaUnionExportLines([], [subil])).toEqual(["Upazilas: none stored"]);
  });
});
