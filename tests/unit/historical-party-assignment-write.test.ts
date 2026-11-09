import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { HistoricalAssignmentRow, SplitAddressSource } from "@/lib/historical-party-assignment";
import { snapshotSingleAddress } from "@/lib/historical-party-assignment";
import {
  HistoricalAssignmentWriteError,
  assignmentActiveLockSql,
  assignmentInsertSql,
  assignmentInsertValues,
  assignmentReassignCloseSql,
  canWriteHistoricalAssignment,
  createHistoricalAssignment,
  identifyingName,
  reassignHistoricalAssignment,
  type AssignmentWriter,
  type HistoricalAssignmentCreateDb,
  type HistoricalAssignmentReassignDb,
  type NewActiveAssignment,
  type PartySnapshotSource,
  type WritablePartyCategory,
} from "@/lib/historical-party-assignment-write";

const activatedAt = new Date("2026-11-09T03:00:00.000Z");
const replacedAt = new Date("2026-11-09T04:00:00.000Z");

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

const STATUSES = [
  ["blank", ""],
  ["blank whitespace", " "],
  ["blank whitespace", "  "],
  ["NULL", null],
  ["missing", undefined],
  ["non-A", "I"],
  ["non-A", "a"],
  ["non-A", " A"],
  ["non-A", "A "],
] as const;

function writer(roleName: string | null, status?: string | null, id = 9): AssignmentWriter {
  if (arguments.length < 2) return { id, roleName, status: "A" };
  return { id, roleName, status };
}

function row(overrides: Partial<HistoricalAssignmentRow> = {}): HistoricalAssignmentRow {
  return {
    id: 7,
    candidateId: 11,
    partyCategory: "agencier",
    partyId: 3,
    originalName: "North Agency",
    ...snapshotSingleAddress(null),
    status: "ACTIVE",
    becameActiveAt: activatedAt,
    closureReason: null,
    closedByUserId: null,
    closedAt: null,
    ...overrides,
  };
}

function partyKey(category: WritablePartyCategory, id: number) {
  return `${category}:${id}`;
}

describe("historical assignment write permission", () => {
  it.each(["sadmin", "admin", "owner"] as const)("allows an active %s", (roleName) => {
    expect(canWriteHistoricalAssignment(writer(roleName, "A"))).toBe(true);
  });

  it.each(OTHER_ROLES)("denies %s", (roleName) => {
    expect(canWriteHistoricalAssignment(writer(roleName, "A"))).toBe(false);
  });

  it.each(STATUSES)("denies %s status %j", (_label, status) => {
    expect(canWriteHistoricalAssignment(writer("sadmin", status))).toBe(false);
    expect(canWriteHistoricalAssignment(writer("admin", status))).toBe(false);
    expect(canWriteHistoricalAssignment(writer("owner", status))).toBe(false);
  });
});

describe("identifying name", () => {
  it("keeps exact non-blank text and rejects blank values without classifying placeholders", () => {
    expect(identifyingName("  North  ")).toBe("  North  ");
    expect(identifyingName("N/A")).toBe("N/A");
    expect(identifyingName("Unknown")).toBe("Unknown");
    expect(identifyingName(".")).toBe(".");
    expect(identifyingName(null)).toBeNull();
    expect(identifyingName("")).toBeNull();
    expect(identifyingName("   ")).toBeNull();
    expect(identifyingName("\n\t")).toBeNull();
  });
});

describe("create historical assignment", () => {
  it.each(["sadmin", "admin", "owner"] as const)("creates an active %s assignment from the party row", async (roleName) => {
    const db = memory();
    const result = await createHistoricalAssignment(
      {
        candidateId: 11,
        partyCategory: "companier",
        partyId: 5,
        actorId: 1,
        role: "Agent",
        status: "I",
        originalName: "Client name",
        originalAddress: "Client address",
        becameActiveAt: "2001-01-01T00:00:00.000Z",
        assignmentStatus: "CLOSED",
      },
      {
        resolveUser: async () => writer(roleName, "A", 9),
        transaction: db.transaction,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.closed).toBeNull();
    expect(result.assignment.status).toBe("ACTIVE");
    expect(result.assignment.partyCategory).toBe("companier");
    expect(result.assignment.originalName).toBe("  South Co  ");
    expect(result.assignment.originalAddress).toBe("");
    expect(result.assignment.presentAddressHouse).toBeNull();
    expect(result.assignment.becameActiveAt).toEqual(activatedAt);
    expect(result.assignment.closureReason).toBeNull();
    expect(result.assignment.closedByUserId).toBeNull();
    expect(db.rows.filter((item) => item.status === "ACTIVE")).toHaveLength(1);
  });

  it.each(["agencier", "companier"] as const)("accepts %s and copies null and spaced addresses exactly", async (category) => {
    const db = memory();
    db.parties.set(partyKey(category, 8), { name: "Kept", address: category === "agencier" ? null : "  Road 1  " });
    const result = await createHistoricalAssignment(
      { candidateId: "11", partyCategory: category, partyId: "8" },
      { resolveUser: async () => writer("admin"), transaction: db.transaction },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.assignment.originalAddress).toBe(category === "agencier" ? null : "  Road 1  ");
    expect(result.assignment.originalName).toBe("Kept");
  });

  it.each(["employer", "Agency", "unknown", ""])("rejects category %j before writing", async (partyCategory) => {
    const db = memory();
    const result = await createHistoricalAssignment(
      { candidateId: 11, partyCategory, partyId: 3, role: "sadmin", actorId: 9, status: "A" },
      { resolveUser: async () => writer("owner"), transaction: db.transaction },
    );
    expect(result).toEqual({ ok: false, code: "invalid_category" });
    expect(db.transactions).toBe(0);
    expect(db.rows).toHaveLength(0);
  });

  it.each(OTHER_ROLES)("denies create for %s", async (roleName) => {
    const db = memory();
    const result = await createHistoricalAssignment(
      { candidateId: 11, partyCategory: "agencier", partyId: 3, role: "sadmin", status: "A" },
      { resolveUser: async () => writer(roleName), transaction: db.transaction },
    );
    expect(result).toEqual({ ok: false, code: "forbidden" });
    expect(db.rows).toHaveLength(0);
  });

  it.each(STATUSES)("denies create for %s status", async (_label, status) => {
    const db = memory();
    const result = await createHistoricalAssignment(
      { candidateId: 11, partyCategory: "agencier", partyId: 3, status: "A" },
      { resolveUser: async () => writer("sadmin", status), transaction: db.transaction },
    );
    expect(result).toEqual({ ok: false, code: "forbidden" });
    expect(db.rows).toHaveLength(0);
  });

  it("rejects a missing session before writing", async () => {
    const db = memory();
    const result = await createHistoricalAssignment(
      { candidateId: 11, partyCategory: "agencier", partyId: 3, actorId: 9, role: "owner" },
      { resolveUser: async () => null, transaction: db.transaction },
    );
    expect(result).toEqual({ ok: false, code: "unauthenticated" });
    expect(db.transactions).toBe(0);
  });

  it("rejects a blank identifying name and a missing party or candidate without inserting", async () => {
    const db = memory();
    db.parties.set(partyKey("agencier", 3), { name: "   ", address: "Road" });
    const blank = await createHistoricalAssignment(
      { candidateId: 11, partyCategory: "agencier", partyId: 3 },
      { resolveUser: async () => writer("sadmin"), transaction: db.transaction },
    );
    expect(blank).toEqual({ ok: false, code: "invalid_name" });
    const missingParty = await createHistoricalAssignment(
      { candidateId: 11, partyCategory: "agencier", partyId: 99 },
      { resolveUser: async () => writer("sadmin"), transaction: db.transaction },
    );
    expect(missingParty).toEqual({ ok: false, code: "invalid_party" });
    const missingCandidate = await createHistoricalAssignment(
      { candidateId: 12, partyCategory: "agencier", partyId: 4 },
      { resolveUser: async () => writer("sadmin"), transaction: db.transaction },
    );
    expect(missingCandidate).toEqual({ ok: false, code: "invalid_candidate" });
    expect(db.rows).toHaveLength(0);
  });

  it("does not open a second active assignment for the same candidate and category", async () => {
    const db = memory();
    db.rows.push(row());
    const result = await createHistoricalAssignment(
      { candidateId: 11, partyCategory: "agencier", partyId: 4 },
      { resolveUser: async () => writer("admin"), transaction: db.transaction },
    );
    expect(result).toEqual({ ok: false, code: "conflict" });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]?.status).toBe("ACTIVE");
  });
});

describe("reassign historical assignment", () => {
  it.each(["sadmin", "admin", "owner"] as const)("lets active %s close and open in one transaction", async (roleName) => {
    const db = memory();
    db.rows.push(row({ originalAddress: "  Old  " }));
    const result = await reassignHistoricalAssignment(
      {
        assignmentId: 7,
        partyId: 4,
        reason: "  Contract ended  ",
        actorId: 1,
        role: "Agent",
        status: "I",
        originalName: "Forged",
        originalAddress: "Forged address",
        becameActiveAt: "1999-01-01T00:00:00.000Z",
      },
      { resolveUser: async () => writer(roleName, "A", 15), transaction: db.transaction },
    );
    expect(result.ok).toBe(true);
    if (!result.ok || !result.closed) return;
    expect(db.transactions).toBe(1);
    expect(result.closed.status).toBe("CLOSED");
    expect(result.closed.closureReason).toBe("Contract ended");
    expect(result.closed.closedByUserId).toBe(15);
    expect(result.closed.originalName).toBe("North Agency");
    expect(result.closed.originalAddress).toBe("  Old  ");
    expect(result.closed.becameActiveAt).toEqual(activatedAt);
    expect(result.assignment.status).toBe("ACTIVE");
    expect(result.assignment.partyId).toBe(4);
    expect(result.assignment.candidateId).toBe(11);
    expect(result.assignment.originalName).toBe("East House");
    expect(result.assignment.originalAddress).toBeNull();
    expect(result.assignment.presentAddressHouse).toBeNull();
    expect(result.assignment.permanentAddressHouse).toBeNull();
    expect(result.assignment.becameActiveAt).toEqual(replacedAt);
    expect(db.rows.filter((item) => item.status === "ACTIVE")).toHaveLength(1);
  });

  it.each(["", "   ", "\n\t", null, 12])("requires a closure reason and does not write for %j", async (reason) => {
    const db = memory();
    db.rows.push(row());
    const result = await reassignHistoricalAssignment(
      { assignmentId: 7, partyId: 4, reason },
      { resolveUser: async () => writer("owner"), transaction: db.transaction },
    );
    expect(result).toEqual({ ok: false, code: "invalid_reason" });
    expect(db.transactions).toBe(0);
    expect(db.rows[0]?.status).toBe("ACTIVE");
  });

  it.each(OTHER_ROLES)("denies reassign for %s", async (roleName) => {
    const db = memory();
    db.rows.push(row());
    const result = await reassignHistoricalAssignment(
      { assignmentId: 7, partyId: 4, reason: "Moved", role: "sadmin", status: "A", actorId: 9 },
      { resolveUser: async () => writer(roleName), transaction: db.transaction },
    );
    expect(result).toEqual({ ok: false, code: "forbidden" });
    expect(db.rows[0]?.status).toBe("ACTIVE");
  });

  it.each(STATUSES)("denies reassign for %s status", async (_label, status) => {
    const db = memory();
    db.rows.push(row());
    const result = await reassignHistoricalAssignment(
      { assignmentId: 7, partyId: 4, reason: "Moved", status: "A" },
      { resolveUser: async () => writer("admin", status), transaction: db.transaction },
    );
    expect(result).toEqual({ ok: false, code: "forbidden" });
    expect(db.rows[0]?.status).toBe("ACTIVE");
  });

  it.each(["employer", "unknown"])("rejects category %s without closing", async (partyCategory) => {
    const db = memory();
    db.rows.push(row());
    const result = await reassignHistoricalAssignment(
      { assignmentId: 7, partyId: 4, partyCategory, reason: "Moved" },
      { resolveUser: async () => writer("sadmin"), transaction: db.transaction },
    );
    expect(result).toEqual({ ok: false, code: "invalid_category" });
    expect(db.rows[0]?.status).toBe("ACTIVE");
    expect(db.rows).toHaveLength(1);
  });

  it("does not close an agencier row when the request names agent", async () => {
    const db = memory();
    db.rows.push(row({ originalAddress: "  Old  " }));
    const result = await reassignHistoricalAssignment(
      { assignmentId: 7, partyId: 4, partyCategory: "agent", reason: "Moved" },
      { resolveUser: async () => writer("sadmin"), transaction: db.transaction },
    );
    expect(result).toEqual({ ok: false, code: "invalid_category" });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]?.status).toBe("ACTIVE");
    expect(db.rows[0]?.originalAddress).toBe("  Old  ");
  });

  it("does not reassign a closed assignment", async () => {
    const db = memory();
    db.rows.push(row({ status: "CLOSED", closureReason: "Kept", closedByUserId: 4, closedAt: activatedAt }));
    const closed = await reassignHistoricalAssignment(
      { assignmentId: 7, partyId: 4, reason: "Again" },
      { resolveUser: async () => writer("sadmin"), transaction: db.transaction },
    );
    expect(closed).toEqual({ ok: false, code: "conflict" });
    expect(db.rows.filter((item) => item.status === "ACTIVE")).toHaveLength(0);
  });

  it("rolls back the closure when the replacement insert fails", async () => {
    const db = memory();
    db.rows.push(row());
    db.failInsert = true;
    const result = await reassignHistoricalAssignment(
      { assignmentId: 7, partyId: 4, reason: "Moved" },
      { resolveUser: async () => writer("admin", "A", 15), transaction: db.transaction },
    );
    expect(result).toEqual({ ok: false, code: "conflict" });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]?.status).toBe("ACTIVE");
    expect(db.rows[0]?.closureReason).toBeNull();
    expect(db.rows[0]?.closedByUserId).toBeNull();
  });

  it("does not let concurrent reassignment leave two active rows", async () => {
    const db = memory();
    db.rows.push(row());
    const [first, second] = await Promise.all([
      reassignHistoricalAssignment(
        { assignmentId: 7, partyId: 4, reason: "Winner", actorId: 1, role: "owner" },
        { resolveUser: async () => writer("sadmin", "A", 15), transaction: db.transaction },
      ),
      reassignHistoricalAssignment(
        { assignmentId: 7, partyId: 5, reason: "Loser", actorId: 15, role: "sadmin" },
        { resolveUser: async () => writer("admin", "A", 16), transaction: db.transaction },
      ),
    ]);
    const results = [first, second];
    expect(results.filter((item) => item.ok)).toHaveLength(1);
    expect(results.filter((item) => !item.ok && item.code === "conflict")).toHaveLength(1);
    expect(db.rows.filter((item) => item.status === "ACTIVE")).toHaveLength(1);
    expect(db.rows.filter((item) => item.status === "CLOSED")).toHaveLength(1);
    const winner = results.find((item) => item.ok);
    if (!winner || !winner.ok) return;
    expect([15, 16]).toContain(winner.closed?.closedByUserId);
    expect(winner.assignment.closedByUserId).toBeNull();
    expect([4, 5]).toContain(winner.assignment.partyId);
  });
});

describe("agent and sub-agent create and reassign", () => {
  const first = splitParty("  Agent One  ", {
    presentAddressHouse: null,
    presentAddressRoad: "",
    presentAddressVillage: "  Village  ",
    presentAddressPost: "Post",
    presentAddressThanaId: null,
    presentAddressDistrictId: 0,
    presentAddressDivisionId: 4,
    permanentAddressHouse: "",
    permanentAddressRoad: null,
    permanentAddressVillage: "West",
    permanentAddressPost: "  ",
    permanentAddressThanaId: 9,
    permanentAddressDistrictId: null,
    permanentAddressDivisionId: 2,
  });
  const second = splitParty("Sub Two", {
    presentAddressHouse: "House",
    presentAddressRoad: null,
    presentAddressVillage: "",
    presentAddressPost: null,
    presentAddressThanaId: 3,
    presentAddressDistrictId: null,
    presentAddressDivisionId: null,
    permanentAddressHouse: null,
    permanentAddressRoad: "",
    permanentAddressVillage: null,
    permanentAddressPost: "Lane",
    permanentAddressThanaId: null,
    permanentAddressDistrictId: 8,
    permanentAddressDivisionId: null,
  });

  it.each(["agent", "sub_agent"] as const)("creates %s and keeps present and permanent parts separate", async (category) => {
    const db = memory();
    db.parties.set(partyKey(category, 21), first);
    const result = await createHistoricalAssignment(
      {
        candidateId: 11,
        partyCategory: category,
        partyId: 21,
        role: "Agent",
        status: "I",
        actorId: 1,
        originalName: "Client",
        originalAddress: "Joined present and permanent",
        presentAddress: { presentAddressHouse: "CLIENT" },
        permanentAddress: { permanentAddressHouse: "CLIENT" },
      },
      { resolveUser: async () => writer("owner", "A", 9), transaction: db.transaction },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.assignment.partyCategory).toBe(category);
    expect(result.assignment.originalName).toBe("  Agent One  ");
    expect(result.assignment.originalAddress).toBeNull();
    expect(result.assignment.presentAddressHouse).toBeNull();
    expect(result.assignment.presentAddressRoad).toBe("");
    expect(result.assignment.presentAddressVillage).toBe("  Village  ");
    expect(result.assignment.presentAddressDistrictId).toBe(0);
    expect(result.assignment.permanentAddressHouse).toBe("");
    expect(result.assignment.permanentAddressRoad).toBeNull();
    expect(result.assignment.permanentAddressPost).toBe("  ");
    expect(result.assignment.permanentAddressThanaId).toBe(9);
    expect(result.assignment.status).toBe("ACTIVE");
    expect(result.assignment.closureReason).toBeNull();
    const stored = JSON.stringify(result.assignment);
    expect(stored).not.toContain("Joined present and permanent");
    expect(stored).not.toContain("CLIENT");
  });

  it.each(OTHER_ROLES)("denies agent create for %s", async (roleName) => {
    const db = memory();
    db.parties.set(partyKey("agent", 21), first);
    const result = await createHistoricalAssignment(
      { candidateId: 11, partyCategory: "agent", partyId: 21, role: "sadmin", status: "A" },
      { resolveUser: async () => writer(roleName, "A"), transaction: db.transaction },
    );
    expect(result).toEqual({ ok: false, code: "forbidden" });
    expect(db.rows).toHaveLength(0);
  });

  it.each(STATUSES)("denies sub-agent create for %s status", async (_label, status) => {
    const db = memory();
    db.parties.set(partyKey("sub_agent", 21), first);
    const result = await createHistoricalAssignment(
      { candidateId: 11, partyCategory: "sub_agent", partyId: 21, status: "A" },
      { resolveUser: async () => writer("sadmin", status), transaction: db.transaction },
    );
    expect(result).toEqual({ ok: false, code: "forbidden" });
    expect(db.rows).toHaveLength(0);
  });

  it("rejects an address part that does not fit without trimming or writing", async () => {
    const db = memory();
    db.parties.set(partyKey("agent", 21), {
      name: "Agent",
      ...addressOf(first),
      presentAddressRoad: "x".repeat(21),
    });
    const result = await createHistoricalAssignment(
      { candidateId: 11, partyCategory: "agent", partyId: 21 },
      { resolveUser: async () => writer("admin"), transaction: db.transaction },
    );
    expect(result).toEqual({ ok: false, code: "invalid_party" });
    expect(db.rows).toHaveLength(0);
  });

  it.each(["agent", "sub_agent"] as const)("reassigns %s in one transaction and keeps the closed snapshot", async (category) => {
    const db = memory();
    db.parties.set(partyKey(category, 21), first);
    db.parties.set(partyKey(category, 22), second);
    db.rows.push(row({
      partyCategory: category,
      partyId: 21,
      originalName: "  Agent One  ",
      originalAddress: null,
      ...addressOf(first),
    }));
    const missing = await reassignHistoricalAssignment(
      { assignmentId: 7, partyId: 22, partyCategory: category, reason: "   " },
      { resolveUser: async () => writer("sadmin", "A", 15), transaction: db.transaction },
    );
    expect(missing).toEqual({ ok: false, code: "invalid_reason" });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]?.status).toBe("ACTIVE");
    const result = await reassignHistoricalAssignment(
      {
        assignmentId: 7,
        partyId: 22,
        partyCategory: category,
        reason: "  Moved  ",
        actorId: 1,
        role: "Agent",
        status: "I",
        originalAddress: "Forged",
        presentAddress: { presentAddressHouse: "CLIENT" },
      },
      { resolveUser: async () => writer("admin", "A", 15), transaction: db.transaction },
    );
    expect(result.ok).toBe(true);
    if (!result.ok || !result.closed) return;
    expect(result.closed.status).toBe("CLOSED");
    expect(result.closed.closureReason).toBe("Moved");
    expect(result.closed.closedByUserId).toBe(15);
    expect(result.closed.originalName).toBe("  Agent One  ");
    expect(result.closed.originalAddress).toBeNull();
    expect(result.closed.presentAddressRoad).toBe("");
    expect(result.closed.presentAddressVillage).toBe("  Village  ");
    expect(result.closed.permanentAddressHouse).toBe("");
    expect(result.assignment.partyId).toBe(22);
    expect(result.assignment.originalName).toBe("Sub Two");
    expect(result.assignment.originalAddress).toBeNull();
    expect(result.assignment.presentAddressHouse).toBe("House");
    expect(result.assignment.presentAddressRoad).toBeNull();
    expect(result.assignment.permanentAddressRoad).toBe("");
    expect(result.assignment.permanentAddressPost).toBe("Lane");
    expect(db.rows.filter((item) => item.status === "ACTIVE")).toHaveLength(1);
    expect(db.rows.filter((item) => item.status === "CLOSED")).toHaveLength(1);
  });

  it("rolls back an agent reassignment when the replacement insert fails", async () => {
    const db = memory();
    db.parties.set(partyKey("agent", 22), second);
    db.rows.push(row({ partyCategory: "agent", originalAddress: null, presentAddressRoad: "" }));
    db.failInsert = true;
    const result = await reassignHistoricalAssignment(
      { assignmentId: 7, partyId: 22, reason: "Moved" },
      { resolveUser: async () => writer("owner", "A", 15), transaction: db.transaction },
    );
    expect(result).toEqual({ ok: false, code: "conflict" });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]?.status).toBe("ACTIVE");
    expect(db.rows[0]?.presentAddressRoad).toBe("");
    expect(db.rows[0]?.closureReason).toBeNull();
  });

  it("does not let concurrent sub-agent reassignment leave two active rows", async () => {
    const db = memory();
    db.parties.set(partyKey("sub_agent", 21), first);
    db.parties.set(partyKey("sub_agent", 22), second);
    db.rows.push(row({ partyCategory: "sub_agent", originalAddress: null, ...addressOf(first) }));
    const [left, right] = await Promise.all([
      reassignHistoricalAssignment(
        { assignmentId: 7, partyId: 21, reason: "Winner" },
        { resolveUser: async () => writer("sadmin", "A", 15), transaction: db.transaction },
      ),
      reassignHistoricalAssignment(
        { assignmentId: 7, partyId: 22, reason: "Loser" },
        { resolveUser: async () => writer("admin", "A", 16), transaction: db.transaction },
      ),
    ]);
    expect([left, right].filter((item) => item.ok)).toHaveLength(1);
    expect([left, right].filter((item) => !item.ok && item.code === "conflict")).toHaveLength(1);
    expect(db.rows.filter((item) => item.status === "ACTIVE")).toHaveLength(1);
    expect(db.rows.filter((item) => item.status === "CLOSED")).toHaveLength(1);
  });

  it("does not change an agencier assignment while an agent assignment is open", async () => {
    const db = memory();
    db.rows.push(row({ id: 7, partyCategory: "agencier", originalAddress: "  Old  " }));
    db.rows.push(row({ id: 8, partyCategory: "agent", originalAddress: null, presentAddressHouse: "Kept" }));
    const result = await reassignHistoricalAssignment(
      { assignmentId: 7, partyId: 4, reason: "Moved" },
      { resolveUser: async () => writer("sadmin"), transaction: db.transaction },
    );
    expect(result.ok).toBe(true);
    const agent = db.rows.find((item) => item.id === 8);
    expect(agent?.status).toBe("ACTIVE");
    expect(agent?.presentAddressHouse).toBe("Kept");
    expect(agent?.originalAddress).toBeNull();
  });
});

function splitParty(name: string, address: SplitAddressSource): PartySnapshotSource {
  return { name, ...address };
}

function addressOf(party: PartySnapshotSource): SplitAddressSource {
  if (!("presentAddressHouse" in party)) throw new Error("expected split address");
  const { name: _name, ...address } = party;
  return address;
}

describe("historical assignment write sql", () => {
  const serverSource = readFileSync(path.join(process.cwd(), "src/server/historical-party-assignment-write.ts"), "utf8");
  const closeLib = readFileSync(path.join(process.cwd(), "src/lib/historical-party-assignment.ts"), "utf8");
  const closeServer = readFileSync(path.join(process.cwd(), "src/server/historical-party-assignment-close.ts"), "utf8");

  it("inserts with the database clock and does not update party tables", () => {
    const insert = assignmentInsertSql();
    const lock = assignmentActiveLockSql();
    expect(insert).toContain("clock_timestamp()");
    expect(insert).toContain("'ACTIVE'");
    expect(insert).toContain("$19");
    expect(insert).not.toMatch(/\$20/);
    expect(insert).toContain("NULL, NULL, NULL");
    expect(assignmentInsertValues({
      candidateId: 1,
      partyCategory: "agent",
      partyId: 2,
      originalName: "Name",
      originalAddress: null,
      presentAddressHouse: "",
      presentAddressRoad: null,
      presentAddressVillage: null,
      presentAddressPost: null,
      presentAddressThanaId: null,
      presentAddressDistrictId: null,
      presentAddressDivisionId: null,
      permanentAddressHouse: null,
      permanentAddressRoad: "",
      permanentAddressVillage: null,
      permanentAddressPost: null,
      permanentAddressThanaId: null,
      permanentAddressDistrictId: null,
      permanentAddressDivisionId: null,
    })[4]).toBeNull();
    expect(insert).not.toMatch(/\bUPDATE\b/i);
    expect(insert).not.toMatch(/\bDELETE\b/i);
    expect(lock).toContain("FOR UPDATE");
    expect(assignmentReassignCloseSql()).toContain("closed_at = clock_timestamp()");
    expect(assignmentReassignCloseSql()).toContain("AND status = 'ACTIVE'");
    expect(serverSource).toContain("getCurrentUser");
    expect(serverSource).toContain("status: user.status");
    expect(serverSource).toContain("prisma.$transaction");
    expect(serverSource).not.toMatch(/\bagencies\b|\bcompanies\b/);
    expect(serverSource).not.toMatch(/hasFullAccess|hasPermission|hasGrant|canMutateTable/);
    expect(serverSource).toContain("tx.agent.findUnique");
    expect(serverSource).toContain("tx.subAgent.findUnique");
    expect(serverSource).not.toMatch(/\.(update|delete|upsert|updateMany|deleteMany)\(/);
    expect(closeLib).toContain("export async function closeHistoricalAssignment");
    expect(closeLib).not.toContain("historical-party-assignment-write");
    expect(closeServer).toContain("export async function closeHistoricalPartyAssignment");
    expect(closeServer).not.toContain("historical-party-assignment-write");
  });
});

function memory() {
  const state: {
    rows: HistoricalAssignmentRow[];
    parties: Map<string, PartySnapshotSource>;
    candidates: Set<number>;
    transactions: number;
    failInsert: boolean;
    tail: Promise<void>;
  } = {
    rows: [],
    parties: new Map([
      [partyKey("agencier", 3), { name: "North Agency", address: "  Old  " }],
      [partyKey("agencier", 4), { name: "East House", address: null }],
      [partyKey("agencier", 5), { name: "West House", address: "" }],
      [partyKey("companier", 5), { name: "  South Co  ", address: "" }],
    ]),
    candidates: new Set([11]),
    transactions: 0,
    failInsert: false,
    tail: Promise.resolve(),
  };

  function snapshot() {
    return state.rows.map((item) => ({ ...item, becameActiveAt: new Date(item.becameActiveAt), closedAt: item.closedAt ? new Date(item.closedAt) : null }));
  }

  const db = {
    get rows() {
      return state.rows;
    },
    get parties() {
      return state.parties;
    },
    get transactions() {
      return state.transactions;
    },
    set failInsert(value: boolean) {
      state.failInsert = value;
    },
    transaction: <T,>(run: (connection: HistoricalAssignmentCreateDb & HistoricalAssignmentReassignDb) => Promise<T>) => {
      const runNow = state.tail.then(async () => {
        const saved = snapshot();
        state.transactions += 1;
        try {
          return await run(connection());
        } catch (error) {
          state.rows = saved;
          throw error;
        }
      });
      state.tail = runNow.then(
        () => undefined,
        () => undefined,
      );
      return runNow;
    },
  };

  function connection(): HistoricalAssignmentCreateDb & HistoricalAssignmentReassignDb {
    return {
      candidateExists: async (id) => state.candidates.has(id),
      readParty: async (category, partyId) => state.parties.get(partyKey(category, partyId)) ?? null,
      lockActive: async (candidateId, category) => {
        const found = state.rows.find((item) => item.candidateId === candidateId && item.partyCategory === category && item.status === "ACTIVE");
        return found ? { ...found } : null;
      },
      lockAssignment: async (id) => {
        const found = state.rows.find((item) => item.id === id);
        return found ? { ...found } : null;
      },
      closeActive: async (id, reason, closedByUserId) => {
        const found = state.rows.find((item) => item.id === id && item.status === "ACTIVE");
        if (!found) return null;
        found.status = "CLOSED";
        found.closureReason = reason;
        found.closedByUserId = closedByUserId;
        found.closedAt = replacedAt;
        return { ...found };
      },
      insertActive: async (input: NewActiveAssignment) => {
        if (state.failInsert) throw new HistoricalAssignmentWriteError();
        const active = state.rows.find((item) => item.candidateId === input.candidateId && item.partyCategory === input.partyCategory && item.status === "ACTIVE");
        if (active) throw new HistoricalAssignmentWriteError();
        const created = row({
          id: Math.max(0, ...state.rows.map((item) => item.id)) + 1,
          candidateId: input.candidateId,
          partyCategory: input.partyCategory,
          partyId: input.partyId,
          originalName: input.originalName,
          originalAddress: input.originalAddress,
          presentAddressHouse: input.presentAddressHouse,
          presentAddressRoad: input.presentAddressRoad,
          presentAddressVillage: input.presentAddressVillage,
          presentAddressPost: input.presentAddressPost,
          presentAddressThanaId: input.presentAddressThanaId,
          presentAddressDistrictId: input.presentAddressDistrictId,
          presentAddressDivisionId: input.presentAddressDivisionId,
          permanentAddressHouse: input.permanentAddressHouse,
          permanentAddressRoad: input.permanentAddressRoad,
          permanentAddressVillage: input.permanentAddressVillage,
          permanentAddressPost: input.permanentAddressPost,
          permanentAddressThanaId: input.permanentAddressThanaId,
          permanentAddressDistrictId: input.permanentAddressDistrictId,
          permanentAddressDivisionId: input.permanentAddressDivisionId,
          becameActiveAt: state.rows.length === 0 ? activatedAt : replacedAt,
          status: "ACTIVE",
          closureReason: null,
          closedByUserId: null,
          closedAt: null,
        });
        state.rows.push(created);
        return { ...created };
      },
    };
  }

  return db;
}
