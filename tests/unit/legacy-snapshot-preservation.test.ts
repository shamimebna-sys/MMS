import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessUser } from "@/lib/auth/permissions";
import { assertLegacySnapshotPreserved, isLegacySnapshotTable } from "@/lib/legacy-snapshots";

const query = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  pool: { query },
}));

vi.mock("@/server/audit", () => ({
  writeAudit: vi.fn(async () => undefined),
}));

import { deleteBreadRecord, saveBreadRecord } from "@/server/bread-form";

const admin: AccessUser = {
  id: 1,
  name: "Admin",
  roleName: "admin",
  permissions: [],
  agentId: null,
  subAgentId: null,
  candidateId: null,
  agencierId: null,
  companierId: null,
  status: "A",
};

describe("legacy snapshot preservation", () => {
  it("names only the historical agency and company tables", () => {
    expect(isLegacySnapshotTable("agencies")).toBe(true);
    expect(isLegacySnapshotTable("companies")).toBe(true);
    expect(isLegacySnapshotTable("agenciers")).toBe(false);
    expect(isLegacySnapshotTable("companiers")).toBe(false);
    expect(isLegacySnapshotTable("candidates")).toBe(false);
    expect(() => assertLegacySnapshotPreserved("agencies")).toThrow(/cannot be changed or removed/);
    expect(() => assertLegacySnapshotPreserved("candidates")).not.toThrow();
  });

  it("refuses to save or delete a legacy snapshot before any write", async () => {
    query.mockReset();
    query.mockImplementation(async (_sql: unknown, params?: unknown[]) => {
      const slug = String(params?.[0] ?? "");
      if (slug === "agencies" || slug === "companies") {
        return {
          rows: [{ id: 1, slug, name: slug, display_name_singular: slug }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(saveBreadRecord(admin, "agencies", 4, { name: "Replacement" }, null)).rejects.toThrow(
      /cannot be changed or removed/,
    );
    await expect(saveBreadRecord(admin, "companies", null, { name: "New" }, null)).rejects.toThrow(
      /cannot be changed or removed/,
    );
    await expect(deleteBreadRecord(admin, "agencies", 4, null)).rejects.toThrow(/cannot be changed or removed/);
    const statements = query.mock.calls.map((call) => String(call[0]));
    expect(statements.some((sql) => /^(update|insert|delete)\b/i.test(sql.trim()))).toBe(false);
  });
});
