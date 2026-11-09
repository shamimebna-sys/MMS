import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoricalAssignmentRow } from "@/lib/historical-party-assignment";
import {
  canViewHistoricalAssignments,
  isHistoricalAssignmentViewer,
  parseAssignmentListQuery,
  readHistoricalAssignment,
  readHistoricalAssignmentList,
  HISTORICAL_ASSIGNMENT_PAGE_SIZE,
} from "@/lib/historical-party-assignment-view";
import { serializeHistoricalAssignment } from "@/server/historical-party-assignment-json";

const activatedAt = new Date("2026-11-09T01:00:00.000Z");
const closedAt = new Date("2026-11-09T02:00:00.000Z");

const OTHER_ROLES = [
  "Agent",
  "Sub Agent",
  "Agency",
  "Agencier",
  "Company",
  "Companier",
  "Employer",
  "Candidate",
  "Employee",
  "Teacher",
  "others",
  "User",
  "Super Admin",
  "Administrator",
  "Admin",
  "Owner",
  "SADMIN",
  "sadmin ",
  "",
] as const;

function row(overrides: Partial<HistoricalAssignmentRow> = {}): HistoricalAssignmentRow {
  return {
    id: 7,
    candidateId: 11,
    partyCategory: "agencier",
    partyId: 3,
    originalName: "North Agency",
    originalAddress: "",
    presentAddressHouse: null,
    presentAddressRoad: null,
    presentAddressVillage: null,
    presentAddressPost: null,
    presentAddressThanaId: null,
    presentAddressDistrictId: null,
    presentAddressDivisionId: null,
    permanentAddressHouse: null,
    permanentAddressRoad: null,
    permanentAddressVillage: null,
    permanentAddressPost: null,
    permanentAddressThanaId: null,
    permanentAddressDistrictId: null,
    permanentAddressDivisionId: null,
    status: "ACTIVE",
    becameActiveAt: activatedAt,
    closureReason: null,
    closedByUserId: null,
    closedAt: null,
    ...overrides,
  };
}

function viewer(roleName: string | null, status: string | null = "A") {
  return { id: 15, roleName, status };
}

describe("historical assignment view permission", () => {
  it.each(["sadmin", "admin", "owner"] as const)("allows an active %s", (roleName) => {
    expect(isHistoricalAssignmentViewer(roleName)).toBe(true);
    expect(canViewHistoricalAssignments(viewer(roleName, "A"))).toBe(true);
  });

  it.each(OTHER_ROLES)("denies %s", (roleName) => {
    expect(isHistoricalAssignmentViewer(roleName)).toBe(false);
    expect(canViewHistoricalAssignments(viewer(roleName, "A"))).toBe(false);
  });

  it("denies a null role and an inactive user", () => {
    expect(canViewHistoricalAssignments(viewer(null, "A"))).toBe(false);
    expect(canViewHistoricalAssignments(viewer("admin", "I"))).toBe(false);
    expect(canViewHistoricalAssignments(viewer("owner", "inactive"))).toBe(false);
    expect(canViewHistoricalAssignments(viewer("sadmin", " a "))).toBe(false);
  });

  it.each([
    ["blank", ""],
    ["blank whitespace", " "],
    ["blank whitespace", "  "],
    ["NULL", null],
    ["missing", undefined],
    ["non-A", "I"],
    ["non-A", "a"],
    ["non-A", " A"],
    ["non-A", "A "],
  ] as const)("denies %s status %j for an allowlisted role", (_label, status) => {
    expect(canViewHistoricalAssignments({ id: 15, roleName: "sadmin", status })).toBe(false);
    expect(canViewHistoricalAssignments({ id: 15, roleName: "admin", status })).toBe(false);
    expect(canViewHistoricalAssignments({ id: 15, roleName: "owner", status })).toBe(false);
  });

  it("denies an allowlisted role when status is omitted", () => {
    expect(canViewHistoricalAssignments({ id: 15, roleName: "sadmin" })).toBe(false);
    expect(canViewHistoricalAssignments({ id: 15, roleName: "admin" })).toBe(false);
    expect(canViewHistoricalAssignments({ id: 15, roleName: "owner" })).toBe(false);
  });
});

describe("historical assignment reads", () => {
  const query = vi.fn();
  const find = vi.fn();

  beforeEach(() => {
    query.mockReset();
    find.mockReset();
    query.mockResolvedValue({ rows: [row()], total: 1 });
    find.mockResolvedValue(row());
  });

  it.each(["sadmin", "admin", "owner"] as const)("lets an active %s list and open a row", async (roleName) => {
    const list = await readHistoricalAssignmentList(
      { candidateId: "11", role: "Agent", permission: "edit_candidates" },
      { resolveUser: async () => viewer(roleName), query },
    );
    const detail = await readHistoricalAssignment(
      { assignmentId: "7", role: "Agent", actorId: 1 },
      { resolveUser: async () => viewer(roleName), find },
    );
    expect(list.ok).toBe(true);
    expect(detail.ok).toBe(true);
    if (list.ok) expect(list.data.rows[0]?.originalAddress).toBe("");
    if (detail.ok) expect(detail.data?.originalAddress).toBe("");
  });

  it.each(OTHER_ROLES)("does not query when %s asks for a list, a page, or a detail id", async (roleName) => {
    const list = await readHistoricalAssignmentList(
      { q: "North", candidateId: "11", page: "4", pageSize: "10000", role: "sadmin" },
      { resolveUser: async () => viewer(roleName), query },
    );
    const detail = await readHistoricalAssignment(
      { assignmentId: "7", role: "owner", permission: "browse_candidates" },
      { resolveUser: async () => viewer(roleName), find },
    );
    expect(list).toEqual({ ok: false, code: "forbidden" });
    expect(detail).toEqual({ ok: false, code: "forbidden" });
    expect(query).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
  });

  it("denies a missing session before any read", async () => {
    const list = await readHistoricalAssignmentList(
      { page: "2", q: "North" },
      { resolveUser: async () => null, query },
    );
    const detail = await readHistoricalAssignment({ assignmentId: 7 }, { resolveUser: async () => null, find });
    expect(list).toEqual({ ok: false, code: "unauthenticated" });
    expect(detail).toEqual({ ok: false, code: "unauthenticated" });
    expect(query).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
  });

  it("denies an inactive session before any read", async () => {
    const list = await readHistoricalAssignmentList({ page: "2" }, { resolveUser: async () => viewer("admin", "I"), query });
    const detail = await readHistoricalAssignment(
      { assignmentId: 7 },
      { resolveUser: async () => viewer("owner", "I"), find },
    );
    expect(list).toEqual({ ok: false, code: "forbidden" });
    expect(detail).toEqual({ ok: false, code: "forbidden" });
    expect(query).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
  });

  it.each([
    ["blank", ""],
    ["blank whitespace", "  "],
    ["NULL", null],
    ["missing", undefined],
    ["non-A", "B"],
  ] as const)("does not query a list or detail when status is %s", async (_label, status) => {
    const user = { id: 15, roleName: "admin" as const, status };
    const list = await readHistoricalAssignmentList(
      { q: "North", page: "2" },
      { resolveUser: async () => user, query },
    );
    const detail = await readHistoricalAssignment({ assignmentId: 7 }, { resolveUser: async () => user, find });
    expect(list).toEqual({ ok: false, code: "forbidden" });
    expect(detail).toEqual({ ok: false, code: "forbidden" });
    expect(query).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
  });

  it("does not query when an allowlisted session omits status", async () => {
    const user = { id: 15, roleName: "owner" as const };
    const list = await readHistoricalAssignmentList({ q: "North" }, { resolveUser: async () => user, query });
    const detail = await readHistoricalAssignment({ assignmentId: 7 }, { resolveUser: async () => user, find });
    expect(list).toEqual({ ok: false, code: "forbidden" });
    expect(detail).toEqual({ ok: false, code: "forbidden" });
    expect(query).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
  });

  it("passes only the parsed stored filters to the query", async () => {
    const list = await readHistoricalAssignmentList(
      {
        q: "North",
        candidateId: "11",
        partyId: "3",
        partyCategory: "agencier",
        status: "CLOSED",
        closedByUserId: "15",
        page: "2",
        pageSize: "10000",
        role: "sadmin",
      },
      { resolveUser: async () => viewer("admin"), query },
    );
    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(
      {
        originalNameContains: "North",
        candidateId: 11,
        partyId: 3,
        partyCategory: "agencier",
        status: "CLOSED",
        closedByUserId: 15,
      },
      2,
    );
    expect(list.ok && list.data.pageSize).toBe(HISTORICAL_ASSIGNMENT_PAGE_SIZE);
  });

  it("does not query when an explicit filter is not a stored value", async () => {
    const list = await readHistoricalAssignmentList(
      { candidateId: "abc", partyCategory: "Agency" },
      { resolveUser: async () => viewer("sadmin"), query },
    );
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.data.rows).toEqual([]);
    expect(query).not.toHaveBeenCalled();
    expect(parseAssignmentListQuery({ status: "OPEN" }).kind).toBe("empty");
  });

  it("keeps null and empty string in the serialized row", () => {
    const body = serializeHistoricalAssignment(
      row({ originalAddress: "", presentAddressHouse: null, closureReason: "", closedByUserId: null, closedAt: null }),
    );
    expect(body.originalAddress).toBe("");
    expect(body.presentAddressHouse).toBeNull();
    expect(body.closureReason).toBe("");
    expect(body.closedByUserId).toBeNull();
    expect(body.closedAt).toBeNull();
    expect(body.becameActiveAt).toBe(activatedAt.toISOString());
    const closed = serializeHistoricalAssignment(row({ status: "CLOSED", closureReason: "Done", closedByUserId: 15, closedAt }));
    expect(closed.closedAt).toBe(closedAt.toISOString());
    expect(closed.closedByUserId).toBe(15);
  });
});

describe("historical assignment view surface", () => {
  const files = [
    "src/lib/historical-party-assignment-view.ts",
    "src/server/historical-party-assignment-view.ts",
    "src/server/historical-party-assignment-json.ts",
    "src/app/api/historical-party-assignments/route.ts",
    "src/app/api/historical-party-assignments/[id]/route.ts",
    "src/app/(workspace)/historical-assignments/page.tsx",
    "src/app/(workspace)/historical-assignments/[id]/page.tsx",
    "src/components/historical-assignments/view.tsx",
  ].map((file) => readFileSync(path.join(process.cwd(), file), "utf8"));

  it("exposes no write method and does not call close", () => {
    const source = files.join("\n");
    expect(source).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)\b/);
    expect(source).not.toMatch(/closeHistorical|reopen|reassign/i);
    expect(source).not.toMatch(/historicalPartyAssignment\.(create|update|delete|upsert|createMany|updateMany|deleteMany)\b/);
    expect(source).not.toMatch(/method=["']post["']/i);
    expect(source).not.toMatch(/hasFullAccess|hasGrant|hasPermission|canBrowseTable|canMutateTable/);
    expect(files[1]).toContain("getCurrentUser");
    expect(files[3]).toContain("export async function GET");
    expect(files[4]).toContain("export async function GET");
    expect(files[4]).toContain("getHistoricalPartyAssignment");
  });

  it("leaves the close service on its own entry", () => {
    const closeServer = readFileSync(path.join(process.cwd(), "src/server/historical-party-assignment-close.ts"), "utf8");
    const closeLib = readFileSync(path.join(process.cwd(), "src/lib/historical-party-assignment.ts"), "utf8");
    expect(closeServer).toContain("export async function closeHistoricalPartyAssignment");
    expect(closeServer).not.toContain("historical-party-assignment-view");
    expect(closeLib).toContain("export async function closeHistoricalAssignment");
    expect(closeLib).not.toContain("readHistoricalAssignment");
  });
});

describe("session view entry", () => {
  const getCurrentUser = vi.hoisted(() => vi.fn());
  const findMany = vi.hoisted(() => vi.fn());
  const findUnique = vi.hoisted(() => vi.fn());
  const count = vi.hoisted(() => vi.fn());

  vi.mock("@/lib/db", () => ({
    prisma: {
      historicalPartyAssignment: {
        findMany,
        findUnique,
        count,
      },
    },
  }));
  vi.mock("@/server/current-user", () => ({
    getCurrentUser,
  }));

  beforeEach(() => {
    getCurrentUser.mockReset();
    findMany.mockReset();
    findUnique.mockReset();
    count.mockReset();
    findMany.mockResolvedValue([row({ originalAddress: null })]);
    findUnique.mockResolvedValue(row({ status: "CLOSED", closureReason: "Done", closedByUserId: 15, closedAt }));
    count.mockResolvedValue(1);
  });

  it("uses the session role for list and detail and ignores a client role", async () => {
    getCurrentUser.mockResolvedValue({ id: 15, roleName: "owner", status: "A" });
    const { listHistoricalPartyAssignments, getHistoricalPartyAssignment } = await import(
      "@/server/historical-party-assignment-view"
    );
    const list = await listHistoricalPartyAssignments({ q: "North", role: "Agent", page: "1" });
    const detail = await getHistoricalPartyAssignment({ assignmentId: "7", role: "sadmin", actorId: 4 });
    expect(getCurrentUser).toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledOnce();
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 7 }, select: expect.any(Object) });
    expect(list.ok).toBe(true);
    expect(detail.ok).toBe(true);
    if (list.ok) expect(list.data.rows[0]?.originalAddress).toBeNull();
    if (detail.ok && detail.data) expect(detail.data.closedByUserId).toBe(15);
  });

  it("does not read when the session is missing or the role is not a viewer", async () => {
    const { listHistoricalPartyAssignments, getHistoricalPartyAssignment } = await import(
      "@/server/historical-party-assignment-view"
    );
    getCurrentUser.mockResolvedValue(null);
    expect(await listHistoricalPartyAssignments({ page: "3", candidateId: "11" })).toEqual({
      ok: false,
      code: "unauthenticated",
    });
    expect(await getHistoricalPartyAssignment({ assignmentId: "7" })).toEqual({ ok: false, code: "unauthenticated" });
    getCurrentUser.mockResolvedValue({ id: 4, roleName: "Agent", status: "A", permissions: ["edit_candidates"] });
    expect(await listHistoricalPartyAssignments({ q: "North", role: "admin" })).toEqual({ ok: false, code: "forbidden" });
    expect(await getHistoricalPartyAssignment({ assignmentId: "7", permission: "browse_candidates" })).toEqual({
      ok: false,
      code: "forbidden",
    });
    getCurrentUser.mockResolvedValue({ id: 15, roleName: "admin", status: "I" });
    expect(await getHistoricalPartyAssignment({ assignmentId: "7" })).toEqual({ ok: false, code: "forbidden" });
    expect(findMany).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  it.each([
    ["blank", ""],
    ["blank whitespace", "  "],
    ["NULL", null],
    ["missing", undefined],
    ["non-A", "I"],
  ] as const)("does not read when the session status is %s", async (_label, status) => {
    const { listHistoricalPartyAssignments, getHistoricalPartyAssignment } = await import(
      "@/server/historical-party-assignment-view"
    );
    getCurrentUser.mockResolvedValue({ id: 15, roleName: "owner", status });
    expect(await listHistoricalPartyAssignments({ q: "North", page: "2" })).toEqual({ ok: false, code: "forbidden" });
    expect(await getHistoricalPartyAssignment({ assignmentId: "7" })).toEqual({ ok: false, code: "forbidden" });
    expect(findMany).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  it("does not read when the session omits status", async () => {
    const { listHistoricalPartyAssignments, getHistoricalPartyAssignment } = await import(
      "@/server/historical-party-assignment-view"
    );
    getCurrentUser.mockResolvedValue({ id: 15, roleName: "sadmin" });
    expect(await listHistoricalPartyAssignments({ q: "North" })).toEqual({ ok: false, code: "forbidden" });
    expect(await getHistoricalPartyAssignment({ assignmentId: "7" })).toEqual({ ok: false, code: "forbidden" });
    expect(findMany).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });
});
