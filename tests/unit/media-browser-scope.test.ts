import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessUser } from "@/lib/auth/permissions";

vi.mock("@/lib/db", () => ({
  pool: { query: vi.fn() },
}));

import { pool } from "@/lib/db";
import { listBread } from "@/server/browse";

const query = vi.mocked(pool.query);

const user = (overrides: Partial<AccessUser> = {}): AccessUser => ({
  id: 7,
  name: "Staff",
  roleName: "Employee",
  permissions: ["browse_media"],
  agentId: null,
  subAgentId: null,
  candidateId: null,
  agencierId: null,
  companierId: null,
  status: "A",
  ...overrides,
});

const PARTY_MEDIA = ["browse_media", "browse_candidate_documents", "browse_medicals", "browse_announcements", "browse_pages", "browse_posts"];

function sqlText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function calls(): string[] {
  return query.mock.calls.map((call) => sqlText(call[0]));
}

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [] } as never);
});

describe("media browser scope", () => {
  it("rejects a user who lacks browse_media before any file query", async () => {
    const agent = user({
      roleName: "Agent",
      agentId: 4,
      permissions: ["browse_candidate_documents", "browse_medicals", "browse_announcements"],
    });
    await expect(listBread(agent, "media", "", 1, null)).rejects.toThrow("You do not have access to this module.");
    expect(query).not.toHaveBeenCalled();
  });

  it("returns an agent's own candidate documents and keeps another party's file out of the query", async () => {
    query.mockImplementation(async (sql: unknown, params: unknown[] = []) => {
      const text = sqlText(sql);
      if (text.startsWith("SELECT COUNT")) return { rows: [{ count: 1 }] } as never;
      const rows = [];
      if (text.includes(`"agent_id" = $1`) && params[0] === 4 && text.includes(`"candidate_documents"`)) {
        rows.push({ source: "Document", id: 15, file: "candidates/agent-4/passport.pdf" });
      }
      if (text.includes(`"candidate_documents"`) && !text.includes(`"agent_id" = $1`)) {
        rows.push({ source: "Document", id: 99, file: "candidates/agent-9/secret.pdf" });
      }
      return { rows } as never;
    });

    const agent = user({ roleName: "Agent", agentId: 4, permissions: PARTY_MEDIA });
    const result = await listBread(agent, "media", "", 1, null);
    const files = result?.rows.map((row) => row.cells.file) ?? [];
    const [countSql, listSql] = calls();

    expect(files).toEqual(["candidates/agent-4/passport.pdf"]);
    expect(files).not.toContain("candidates/agent-9/secret.pdf");
    expect(countSql).toContain(`FROM "candidate_documents"`);
    expect(countSql).toContain(`"candidate_id" IN (SELECT id FROM candidates WHERE deleted_at IS NULL AND "agent_id" = $1)`);
    expect(listSql).toContain(`"agent_id" = $1`);
    expect(query.mock.calls[0]?.[1]).toEqual([4, 4]);
    expect(query.mock.calls[1]?.[1]).toEqual([4, 4, 10, 0]);
    expect(countSql).not.toContain("agent-9");
    expect(listSql).not.toContain(`"agent_id" = $3`);
  });

  it("keeps each party role inside its own candidate records", async () => {
    const cases = [
      { roleName: "Sub Agent", subAgentId: 3, column: "sub_agent_id", value: 3 },
      { roleName: "Agency", agencierId: 8, column: "agencier_id", value: 8 },
      { roleName: "Agencier", agencierId: 11, column: "agencier_id", value: 11 },
      { roleName: "Company", companierId: 6, column: "companier_id", value: 6 },
    ] as const;

    for (const item of cases) {
      query.mockClear();
      query.mockResolvedValue({ rows: [] } as never);
      const viewer = user({
        permissions: PARTY_MEDIA,
        roleName: item.roleName,
        subAgentId: "subAgentId" in item ? item.subAgentId : null,
        agencierId: "agencierId" in item ? item.agencierId : null,
        companierId: "companierId" in item ? item.companierId : null,
      });
      await listBread(viewer, "media", "", 1, null);
      const sql = calls().join("\n");
      expect(sql).toContain(`"${item.column}" = $1`);
      expect(query.mock.calls[0]?.[1]).toEqual([item.value, item.value]);
      expect(sql).not.toContain(`"agent_id" = $1`);
      expect(JSON.stringify(query.mock.calls[0]?.[1])).not.toContain("99");
    }
  });

  it("limits a candidate to documents and medicals stored on their own record", async () => {
    query.mockImplementation(async (sql: unknown, params: unknown[] = []) => {
      const text = sqlText(sql);
      if (text.startsWith("SELECT COUNT")) return { rows: [{ count: 1 }] } as never;
      if (params[0] === 9 && text.includes(`"candidate_id" = $1`)) {
        return { rows: [{ source: "Document", id: 3, file: "candidates/9/cv.pdf" }] } as never;
      }
      return { rows: [{ source: "Document", id: 4, file: "candidates/10/cv.pdf" }] } as never;
    });

    const candidate = user({ roleName: "Candidate", candidateId: 9, permissions: PARTY_MEDIA });
    const result = await listBread(candidate, "media", "", 1, null);
    const sql = calls().join("\n");

    expect(result?.rows.map((row) => row.cells.file)).toEqual(["candidates/9/cv.pdf"]);
    expect(sql).toContain(`FROM "candidate_documents"`);
    expect(sql).toContain(`"candidate_id" = $1`);
    expect(sql).toContain(`FROM "medicals"`);
    expect(query.mock.calls[1]?.[1]).toEqual([9, 9, 10, 0]);
  });

  it("hides candidate documents and medicals from a user outside that ownership scope", async () => {
    const employee = user({
      permissions: ["browse_media", "browse_candidates", "browse_candidate_documents", "browse_medicals", "browse_announcements"],
    });
    query.mockImplementation(async (sql: unknown) => {
      const text = sqlText(sql);
      if (text.includes("candidate_documents") || text.includes("medicals")) {
        return { rows: [{ source: "Document", id: 1, file: "candidates/private/secret.pdf", count: 1 }] } as never;
      }
      if (text.startsWith("SELECT COUNT")) return { rows: [{ count: 1 }] } as never;
      return { rows: [{ source: "Announcement", id: 2, file: "announcements/notice.pdf" }] } as never;
    });

    const result = await listBread(employee, "media", "", 1, null);
    const sql = calls().join("\n");

    expect(sql).toContain(`FROM "announcements"`);
    expect(sql).toContain("WHERE TRUE");
    expect(sql).not.toContain("candidate_documents");
    expect(sql).not.toContain("medicals");
    expect(result?.rows.map((row) => row.cells.file)).toEqual(["announcements/notice.pdf"]);
  });

  it("returns no file paths when a party role has no ownership id", async () => {
    const agent = user({
      roleName: "Agent",
      agentId: null,
      permissions: PARTY_MEDIA,
    });
    const result = await listBread(agent, "media", "", 1, null);
    expect(result?.rows).toEqual([]);
    expect(result?.total).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it("omits a source when the user lacks that module permission", async () => {
    const agent = user({
      roleName: "Agent",
      agentId: 4,
      permissions: ["browse_media", "browse_pages"],
    });
    query.mockImplementation(async (sql: unknown) => {
      const text = sqlText(sql);
      if (text.startsWith("SELECT COUNT")) return { rows: [{ count: 1 }] } as never;
      return { rows: [{ source: "Page", id: 6, file: "pages/about.jpg" }] } as never;
    });

    const result = await listBread(agent, "media", "", 1, null);
    const sql = calls().join("\n");

    expect(sql).toContain(`FROM "pages"`);
    expect(sql).not.toContain("candidate_documents");
    expect(sql).not.toContain("medicals");
    expect(sql).not.toContain("announcements");
    expect(sql).not.toContain(`"posts"`);
    expect(result?.rows.map((row) => row.cells.file)).toEqual(["pages/about.jpg"]);
  });

  it("lets sadmin and owner browse every media source", async () => {
    for (const roleName of ["sadmin", "owner"] as const) {
      query.mockClear();
      query.mockImplementation(async (sql: unknown, params: unknown[] = []) => {
        const text = sqlText(sql);
        if (text.startsWith("SELECT COUNT")) return { rows: [{ count: 2 }] } as never;
        const unrestricted =
          text.includes(`"candidate_documents"`) &&
          text.includes(`"medicals"`) &&
          text.includes(`"announcements"`) &&
          text.includes(`"pages"`) &&
          text.includes(`"posts"`) &&
          !text.includes("agent_id") &&
          !text.includes("candidate_id") &&
          !text.includes("agencier_id") &&
          !text.includes("companier_id") &&
          !text.includes("sub_agent_id");
        if (!unrestricted || params[0] !== 10) return { rows: [] } as never;
        return {
          rows: [
            { source: "Document", id: 1, file: "candidates/any/passport.pdf" },
            { source: "Post", id: 2, file: "posts/news.jpg" },
          ],
        } as never;
      });

      const admin = user({ roleName, permissions: ["browse_media"] });
      const result = await listBread(admin, "media", "", 1, null);
      const sql = calls().join("\n");

      expect(sql).toContain("WHERE TRUE");
      expect(result?.rows.map((row) => row.cells.file)).toEqual(["candidates/any/passport.pdf", "posts/news.jpg"]);
      expect(query.mock.calls[1]?.[1]).toEqual([10, 0]);
    }
  });

  it("still withholds media from an inactive full-access role", async () => {
    await expect(listBread(user({ roleName: "owner", status: "I", permissions: ["browse_media"] }), "media", "", 1, null)).rejects.toThrow(
      "You do not have access to this module.",
    );
    expect(query).not.toHaveBeenCalled();
  });
});
