import { describe, expect, it } from "vitest";
import {
  notificationClassGroupExportLines,
  presentNotificationClassGroup,
  type StoredNotificationClassGroup,
} from "@/lib/notification-class-groups";

const waiter: StoredNotificationClassGroup = {
  id: 1,
  classGroupId: "1",
  name: "Waiter",
  createdAt: "",
  updatedAt: "",
};

const driver: StoredNotificationClassGroup = {
  id: 2,
  classGroupId: "36",
  name: "Driver",
  createdAt: "",
  updatedAt: "",
};

const missingGroup: StoredNotificationClassGroup = {
  id: 3,
  classGroupId: "",
  name: "",
  createdAt: "",
  updatedAt: "",
};

const unknownGroup: StoredNotificationClassGroup = {
  id: 90,
  classGroupId: "999001",
  name: "",
  createdAt: "2025-06-01 09:00:00",
  updatedAt: "",
};

describe("stored notification class groups", () => {
  it("shows the stored class group id and name", () => {
    const view = presentNotificationClassGroup(waiter);
    expect(view.classGroupId).toBe("1");
    expect(view.name).toBe("Waiter");
    expect(view.exportText).toContain("group 1");
    expect(view.exportText).toContain("name Waiter");
  });

  it("keeps a row whose class group id is blank", () => {
    const view = presentNotificationClassGroup(missingGroup);
    expect(view.id).toBe(3);
    expect(view.classGroupId).toBe("");
    expect(view.name).toBe("");
    expect(view.exportText).toContain("group blank");
    expect(view.exportText).toContain("name blank");
  });

  it("keeps the row when the class group record is missing", () => {
    const view = presentNotificationClassGroup(unknownGroup);
    expect(view.classGroupId).toBe("999001");
    expect(view.name).toBe("");
    expect(view.createdAt).toBe("2025-06-01 09:00:00");
    expect(view.updatedAt).toBe("");
    expect(view.exportText).toContain("group 999001");
    expect(view.exportText).toContain("name blank");
  });

  it("does not merge multiple links and leaves null timestamps blank", () => {
    expect(notificationClassGroupExportLines([waiter, driver, missingGroup])).toEqual([
      "Class Group",
      "id 1 | group 1 | name Waiter | created blank | updated blank",
      "id 2 | group 36 | name Driver | created blank | updated blank",
      "id 3 | group blank | name blank | created blank | updated blank",
    ]);
    expect(notificationClassGroupExportLines([])).toEqual(["Class Group: none stored"]);
  });
});
