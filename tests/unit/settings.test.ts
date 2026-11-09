import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessUser } from "@/lib/auth/permissions";
import { LEGACY_SETTING_KEYS, nextSettingValue } from "@/lib/settings";

const query = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  pool: { query },
}));

type Stored = {
  id: number;
  key: string;
  display_name: string;
  value: string | null;
  type: string;
  group: string | null;
};

const LEGACY: Stored[] = [
  { id: 1, key: "site.title", display_name: "Site Title", value: "Site Title", type: "text", group: "Site" },
  { id: 2, key: "site.description", display_name: "Site Description", value: "Site Description", type: "text", group: "Site" },
  { id: 3, key: "site.logo", display_name: "Site Logo", value: "", type: "image", group: "Site" },
  { id: 4, key: "site.google_analytics_tracking_id", display_name: "Google Analytics Tracking ID", value: null, type: "text", group: "Site" },
  { id: 5, key: "admin.bg_image", display_name: "Admin Background Image", value: "settings\\April2025\\7cFKYRMgaH0evLr58Xn1.jpg", type: "image", group: "Admin" },
  { id: 6, key: "admin.title", display_name: "Admin Title", value: "E & A", type: "text", group: "Admin" },
  { id: 7, key: "admin.description", display_name: "Admin Description", value: "E & A AIR INTERNATIONAL", type: "text", group: "Admin" },
  { id: 8, key: "admin.loader", display_name: "Admin Loader", value: "", type: "image", group: "Admin" },
  { id: 9, key: "admin.icon_image", display_name: "Admin Icon Image", value: "settings\\April2025\\3ZRR7DhAlCqdnf2yeGkF.png", type: "image", group: "Admin" },
  { id: 10, key: "admin.google_analytics_client_id", display_name: "Google Analytics Client ID (used for admin dashboard)", value: null, type: "text", group: "Admin" },
];

let rows: Stored[];

const user = (overrides: Partial<AccessUser> = {}): AccessUser => ({
  id: 7,
  name: "Staff",
  roleName: "Employee",
  permissions: [],
  agentId: null,
  subAgentId: null,
  candidateId: null,
  agencierId: null,
  companierId: null,
  status: "A",
  ...overrides,
});

const editor = () =>
  user({
    permissions: ["browse_settings", "read_settings", "edit_settings"],
  });

function installQuery() {
  query.mockImplementation(async (sql: unknown, params: unknown[] = []) => {
    const statement = String(sql).replace(/\s+/g, " ");
    if (statement.includes("INSERT INTO")) throw new Error("settings must not insert rows");
    if (statement.includes("DELETE FROM")) throw new Error("settings must not delete rows");
    if (statement.startsWith("SELECT COUNT")) {
      return { rows: [{ count: rows.length }], rowCount: 1 };
    }
    if (statement.includes("COALESCE(value, '')")) {
      return {
        rows: rows.map((row) => ({
          id: row.id,
          key: row.key,
          display_name: row.display_name,
          grp: row.group ?? "",
          value: row.value ?? "",
        })),
        rowCount: rows.length,
      };
    }
    if (statement.includes("UPDATE settings")) {
      const [value, id, key, type] = params;
      const row = rows.find((item) => item.id === id && item.key === key && item.type === type);
      if (!row) return { rows: [], rowCount: 0 };
      row.value = value as string | null;
      return { rows: [{ id: row.id }], rowCount: 1 };
    }
    if (statement.includes("FROM settings") && statement.includes("WHERE id")) {
      const row = rows.find((item) => item.id === params[0]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  });
}

describe("legacy setting keys", () => {
  it("keeps the ten stored key names and the null-versus-empty format", () => {
    expect(LEGACY_SETTING_KEYS).toEqual([
      "site.title",
      "site.description",
      "site.logo",
      "site.google_analytics_tracking_id",
      "admin.bg_image",
      "admin.title",
      "admin.description",
      "admin.loader",
      "admin.icon_image",
      "admin.google_analytics_client_id",
    ]);
    expect(nextSettingValue(null, "", "text")).toBeNull();
    expect(nextSettingValue("", "", "image")).toBe("");
    expect(nextSettingValue("settings\\April2025\\7cFKYRMgaH0evLr58Xn1.jpg", "settings\\April2025\\7cFKYRMgaH0evLr58Xn1.jpg", "image")).toBe(
      "settings\\April2025\\7cFKYRMgaH0evLr58Xn1.jpg",
    );
    expect(() => nextSettingValue("E & A", "x".repeat(4001), "text")).toThrow(/too long/);
    expect(() => nextSettingValue("E & A", "bad\0value", "text")).toThrow(/valid setting value/);
    expect(() => nextSettingValue("", "line\nbreak", "image")).toThrow(/valid setting value/);
  });
});

describe("settings load and save", () => {
  beforeEach(() => {
    rows = LEGACY.map((row) => ({ ...row }));
    query.mockReset();
    installQuery();
  });

  it("loads the stored keys and their current values", async () => {
    const { listBread, readBread } = await import("@/server/browse");
    const { loadBreadForm } = await import("@/server/bread-form");
    const listed = await listBread(editor(), "settings", "", 1, null);
    expect(listed?.rows.map((row) => row.cells.key)).toEqual([...LEGACY_SETTING_KEYS]);
    expect(listed?.rows.find((row) => row.cells.key === "admin.bg_image")?.cells.value).toBe("settings\\April2025\\7cFKYRMgaH0evLr58Xn1.jpg");
    expect(listed?.rows.find((row) => row.cells.key === "site.logo")?.cells.value).toBe("");
    const record = await readBread(editor(), "settings", 5);
    expect(record?.fields).toEqual([
      { label: "Key", value: "admin.bg_image" },
      { label: "Display Name", value: "Admin Background Image" },
      { label: "Group", value: "Admin" },
      { label: "Type", value: "image" },
      { label: "Value", value: "settings\\April2025\\7cFKYRMgaH0evLr58Xn1.jpg" },
    ]);
    const form = await loadBreadForm("settings", "edit", 4, editor());
    expect(form?.fields).toEqual([
      {
        name: "value",
        label: "Google Analytics Tracking ID",
        input: "text",
        required: false,
        multiple: false,
        options: [],
        value: "",
      },
    ]);
  });

  it("updates each stored key without adding rows or changing the key", async () => {
    const { saveBreadRecord } = await import("@/server/bread-form");
    const saved = await saveBreadRecord(editor(), "settings", 6, { value: "ManPower", key: "site.title" }, null);
    expect(saved).toBe(6);
    expect(rows.find((row) => row.id === 6)).toMatchObject({ key: "admin.title", value: "ManPower", display_name: "Admin Title", type: "text" });
    await saveBreadRecord(editor(), "settings", 4, { value: "" }, null);
    expect(rows.find((row) => row.id === 4)?.value).toBeNull();
    await saveBreadRecord(editor(), "settings", 3, { value: "" }, null);
    expect(rows.find((row) => row.id === 3)?.value).toBe("");
    await saveBreadRecord(editor(), "settings", 5, { value: "settings\\May2026\\keep.jpg" }, null);
    expect(rows.find((row) => row.id === 5)?.value).toBe("settings\\May2026\\keep.jpg");
    const updates = query.mock.calls.filter((call) => String(call[0]).includes("UPDATE settings"));
    expect(updates).toHaveLength(4);
    expect(String(updates[0]?.[0])).not.toMatch(/display_name|details|"order"|"group"/);
    expect(query.mock.calls.some((call) => String(call[0]).includes("INSERT INTO"))).toBe(false);
  });

  it("refuses a new key, a delete, and an unknown row", async () => {
    const { saveBreadRecord, deleteBreadRecord } = await import("@/server/bread-form");
    rows.push({ id: 11, key: "site.extra", display_name: "Extra", value: "no", type: "text", group: "Site" });
    await expect(saveBreadRecord(editor(), "settings", null, { value: "new" }, null)).rejects.toThrow(/cannot add a setting/);
    await expect(saveBreadRecord(editor(), "settings", 11, { value: "changed" }, null)).rejects.toThrow(/cannot edit this setting/);
    expect(rows.find((row) => row.id === 11)?.value).toBe("no");
    await expect(deleteBreadRecord(editor(), "settings", 1, null)).rejects.toThrow(/cannot delete this setting/);
    expect(rows).toHaveLength(11);
  });

  it("rejects invalid values and hides database failures", async () => {
    const { saveSettingValue } = await import("@/server/settings");
    await expect(saveSettingValue(editor(), 1, "x".repeat(4001))).rejects.toThrow(/too long/);
    await expect(saveSettingValue(editor(), 5, "bad\npath")).rejects.toThrow(/valid setting value/);
    expect(rows.find((row) => row.id === 1)?.value).toBe("Site Title");
    query.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes("UPDATE settings")) throw new Error("connect ECONNREFUSED");
      return { rows: [{ id: 1, key: "site.title", display_name: "Site Title", value: "Site Title", type: "text", group: "Site" }], rowCount: 1 };
    });
    await expect(saveSettingValue(editor(), 1, "Still here")).rejects.toThrow("Could not save this setting.");
  });
});

describe("settings authorization", () => {
  beforeEach(() => {
    rows = LEGACY.map((row) => ({ ...row }));
    query.mockReset();
    installQuery();
  });

  it("requires the stored settings grants and ignores full access without them", async () => {
    const { listBread, readBread } = await import("@/server/browse");
    const { saveBreadRecord } = await import("@/server/bread-form");
    const owner = user({ roleName: "owner", permissions: [] });
    const inactive = user({ roleName: "sadmin", status: "I", permissions: ["browse_settings", "read_settings", "edit_settings"] });
    const browseOnly = user({ permissions: ["browse_settings"] });
    const reader = user({ permissions: ["browse_settings", "read_settings"] });
    await expect(listBread(owner, "settings", "", 1, null)).rejects.toThrow(/access/i);
    await expect(listBread(inactive, "settings", "", 1, null)).rejects.toThrow(/access/i);
    await expect(readBread(browseOnly, "settings", 1)).rejects.toThrow(/access/i);
    await expect(saveBreadRecord(reader, "settings", 1, { value: "Changed" }, null)).rejects.toThrow(/access/i);
    await expect(saveBreadRecord(user({ permissions: ["add_settings", "delete_settings"] }), "settings", 1, { value: "Changed" }, null)).rejects.toThrow(/access/i);
    expect(rows.find((row) => row.id === 1)?.value).toBe("Site Title");
    const listed = await listBread(browseOnly, "settings", "", 1, null);
    expect(listed?.total).toBe(10);
  });
});
