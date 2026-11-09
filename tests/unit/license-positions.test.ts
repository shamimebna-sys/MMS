import { describe, expect, it } from "vitest";
import { licensePositionExportLines, presentLicensePosition, type StoredLicensePosition } from "@/lib/license-positions";

const cook: StoredLicensePosition = {
  id: 87,
  positionId: "17",
  title: "Cook",
  quantity: "4",
  createdAt: "",
  updatedAt: "",
};

const blankQuantity: StoredLicensePosition = {
  id: 86,
  positionId: "10",
  title: "Waiter",
  quantity: "",
  createdAt: "",
  updatedAt: "",
};

const missingPosition: StoredLicensePosition = {
  id: 90,
  positionId: "999001",
  title: "",
  quantity: "0",
  createdAt: "",
  updatedAt: "",
};

describe("stored license positions", () => {
  it("shows the stored position title and quantity", () => {
    const view = presentLicensePosition(cook);
    expect(view.title).toBe("Cook");
    expect(view.positionId).toBe("17");
    expect(view.quantity).toBe("4");
    expect(view.exportText).toContain("title Cook");
    expect(view.exportText).toContain("quantity 4");
  });

  it("keeps a blank quantity blank", () => {
    const view = presentLicensePosition(blankQuantity);
    expect(view.quantity).toBe("");
    expect(view.exportText).toContain("quantity blank");
    expect(view.exportText).not.toContain("quantity 0");
  });

  it("keeps a stored zero quantity", () => {
    const view = presentLicensePosition(missingPosition);
    expect(view.quantity).toBe("0");
    expect(view.exportText).toContain("quantity 0");
  });

  it("keeps the row when the position record is missing", () => {
    const view = presentLicensePosition(missingPosition);
    expect(view.id).toBe(90);
    expect(view.positionId).toBe("999001");
    expect(view.title).toBe("");
    expect(view.exportText).toContain("position 999001");
    expect(view.exportText).toContain("title blank");
  });

  it("leaves null timestamps blank and does not merge rows", () => {
    const view = presentLicensePosition(cook);
    expect(view.createdAt).toBe("");
    expect(view.updatedAt).toBe("");
    expect(licensePositionExportLines([cook, blankQuantity])).toEqual([
      "Positions",
      "id 87 | position 17 | title Cook | quantity 4 | created blank | updated blank",
      "id 86 | position 10 | title Waiter | quantity blank | created blank | updated blank",
    ]);
    expect(licensePositionExportLines([])).toEqual(["Positions: none stored"]);
  });
});
