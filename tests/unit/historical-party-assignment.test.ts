import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CANONICAL_AGENT_ADDRESS_UNRESOLVED,
  assignmentCloseSql,
  closeHistoricalAssignment,
  closureReason,
  isHistoricalAssignmentCloser,
  snapshotSingleAddress,
  snapshotSplitAddress,
  type HistoricalAssignmentCloseDb,
  type HistoricalAssignmentRow,
  type SplitAddressSource,
} from "@/lib/historical-party-assignment";

const migrationPath = path.join(
  process.cwd(),
  "prisma/migrations/20261109120000_historical_party_assignments/migration.sql",
);
const migrationSql = readFileSync(migrationPath, "utf8");
const serverSource = readFileSync(
  path.join(process.cwd(), "src/server/historical-party-assignment-close.ts"),
  "utf8",
);

const activatedAt = new Date("2026-11-09T01:00:00.000Z");

function activeRow(overrides: Partial<HistoricalAssignmentRow> = {}): HistoricalAssignmentRow {
  return {
    id: 7,
    candidateId: 11,
    partyCategory: "agencier",
    partyId: 3,
    originalName: "North Agency",
    originalAddress: null,
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

function splitSource(overrides: Partial<SplitAddressSource> = {}): SplitAddressSource {
  return {
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
    ...overrides,
  };
}

describe("historical assignment closure rules", () => {
  let row: HistoricalAssignmentRow;
  let closeCalls: Array<{ id: number; reason: string; closedByUserId: number }>;
  const db: HistoricalAssignmentCloseDb = {
    lock: async (id) => (row.id === id ? { ...row } : null),
    closeActive: async (id, reason, closedByUserId) => {
      closeCalls.push({ id, reason, closedByUserId });
      if (row.id !== id || row.status !== "ACTIVE") return null;
      row = {
        ...row,
        status: "CLOSED",
        closureReason: reason,
        closedByUserId,
        closedAt: activatedAt,
      };
      return { ...row };
    },
  };

  beforeEach(() => {
    row = activeRow();
    closeCalls = [];
  });

  async function close(input: {
    assignmentId?: unknown;
    reason?: unknown;
    actorId?: unknown;
    role?: unknown;
    roleName?: string | null;
    userId?: number | null;
  }) {
    return closeHistoricalAssignment(
      {
        assignmentId: input.assignmentId ?? 7,
        reason: Object.hasOwn(input, "reason") ? input.reason : "Contract ended",
        actorId: input.actorId,
        role: input.role,
      },
      {
        resolveUser: async () => {
          if (input.userId === null) return null;
          return { id: input.userId ?? 9, roleName: input.roleName === undefined ? "sadmin" : input.roleName };
        },
        transaction: async (run) => run(db),
      },
    );
  }

  it("rejects a blank closure reason before writing", async () => {
    for (const reason of ["", "   ", "\n\t", 12, null]) {
      const result = await close({ reason });
      expect(result).toEqual({ ok: false, code: "invalid_reason" });
    }
    expect(closeCalls).toEqual([]);
    expect(row.status).toBe("ACTIVE");
  });

  it("stores trimmed free text and keeps internal spaces", () => {
    expect(closureReason("  left the post  ")).toBe("left the post");
  });

  it.each(["sadmin", "admin", "owner"] as const)("allows the exact role name %s", async (roleName) => {
    const result = await close({ roleName, actorId: 1, role: "Super Admin" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.assignment.closedByUserId).toBe(9);
    expect(closeCalls).toEqual([{ id: 7, reason: "Contract ended", closedByUserId: 9 }]);
  });

  it("does not treat display labels as closure authority", () => {
    expect(isHistoricalAssignmentCloser("Super Admin")).toBe(false);
    expect(isHistoricalAssignmentCloser("Administrator")).toBe(false);
    expect(isHistoricalAssignmentCloser("Owner")).toBe(false);
    expect(isHistoricalAssignmentCloser("sadmin")).toBe(true);
  });

  it("rejects a display label even when the client sends an allowed role", async () => {
    const result = await close({ roleName: "Agent", role: "sadmin", actorId: 9 });
    expect(result).toEqual({ ok: false, code: "forbidden" });
    expect(closeCalls).toEqual([]);
  });

  it("rejects a signed-out or inactive session before locking", async () => {
    const result = await close({ userId: null, role: "owner", actorId: 9 });
    expect(result).toEqual({ ok: false, code: "unauthenticated" });
    expect(closeCalls).toEqual([]);
  });

  it("closes an ACTIVE assignment once and rejects a second close", async () => {
    const first = await close({ reason: "  First reason  " });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.assignment.status).toBe("CLOSED");
      expect(first.assignment.closureReason).toBe("First reason");
      expect(first.assignment.becameActiveAt).toEqual(activatedAt);
      expect(first.assignment.originalName).toBe("North Agency");
    }
    const second = await close({ reason: "Another reason" });
    expect(second).toEqual({ ok: false, code: "conflict" });
    expect(row.closureReason).toBe("First reason");
    expect(row.closedByUserId).toBe(9);
    expect(closeCalls).toHaveLength(1);
  });

  it("returns conflict when the row is no longer ACTIVE", async () => {
    row = activeRow({ status: "CLOSED", closureReason: "Kept", closedByUserId: 4, closedAt: activatedAt });
    const result = await close({ reason: "Overwrite" });
    expect(result).toEqual({ ok: false, code: "conflict" });
    expect(closeCalls).toEqual([]);
    expect(row.closureReason).toBe("Kept");
  });

  it("returns not found without writing when the assignment is absent", async () => {
    const result = await close({ assignmentId: 8 });
    expect(result).toEqual({ ok: false, code: "not_found" });
    expect(closeCalls).toEqual([]);
  });

  it("uses the database clock in the close statement and no client timestamp", () => {
    const sql = assignmentCloseSql();
    expect(sql.close).toContain("closed_at = clock_timestamp()");
    expect(sql.close).toContain("status = 'CLOSED'");
    expect(sql.close).toContain("AND status = 'ACTIVE'");
    expect(sql.close).not.toMatch(/\$4/);
    expect(sql.close.toLowerCase()).not.toContain("delete");
    expect(sql.lock).toContain("FOR UPDATE");
    expect(serverSource).toContain("getCurrentUser");
    expect(serverSource).not.toMatch(/hasFullAccess|hasPermission|hasGrant|canMutateTable/);
  });
});

describe("historical assignment address snapshots", () => {
  it("copies an agencier address exactly, including null and empty string", () => {
    expect(snapshotSingleAddress(null).originalAddress).toBeNull();
    const empty = snapshotSingleAddress("");
    expect(empty.originalAddress).toBe("");
    expect(empty.presentAddressHouse).toBeNull();
    expect(empty.permanentAddressHouse).toBeNull();
    const spaced = snapshotSingleAddress("  Road 1  ");
    expect(spaced.originalAddress).toBe("  Road 1  ");
  });

  it("keeps agent present and permanent parts separate", () => {
    const snapshot = snapshotSplitAddress(
      splitSource({
        presentAddressHouse: "",
        presentAddressRoad: null,
        permanentAddressHouse: "12",
        permanentAddressThanaId: 5,
      }),
    );
    expect(snapshot.originalAddress).toBeNull();
    expect(snapshot.presentAddressHouse).toBe("");
    expect(snapshot.presentAddressRoad).toBeNull();
    expect(snapshot.permanentAddressHouse).toBe("12");
    expect(snapshot.permanentAddressThanaId).toBe(5);
    expect(CANONICAL_AGENT_ADDRESS_UNRESOLVED).toContain("unresolved");
    expect(JSON.stringify(snapshot)).not.toContain("12 /");
  });
});

describe("historical assignment migration text", () => {
  it("enforces one ACTIVE pair, immutability, and no foreign key", () => {
    expect(migrationSql).toContain("CREATE UNIQUE INDEX historical_party_assignments_one_active");
    expect(migrationSql).toContain("WHERE status = 'ACTIVE'");
    expect(migrationSql).toContain("historical assignment records cannot be physically deleted");
    expect(migrationSql).toContain("historical assignment identity and snapshots cannot be changed");
    expect(migrationSql).toContain("a CLOSED historical assignment cannot be reopened");
    expect(migrationSql).toContain("CLOSED historical assignment closure facts cannot be rewritten");
    expect(migrationSql).toContain("NEW.became_active_at := clock_timestamp()");
    expect(migrationSql).toContain("NEW.closed_at := clock_timestamp()");
    expect(migrationSql).not.toMatch(/\bREFERENCES\b/);
    expect(migrationSql).not.toMatch(/\bFOREIGN KEY\b/i);
    expect(migrationSql).not.toContain("deleted_at");
    expect(migrationSql).not.toContain("created_at");
    expect(migrationSql).not.toContain("updated_at");
    expect(migrationSql).not.toContain("employer");
    expect(migrationSql.toLowerCase()).not.toContain("agencies");
    expect(migrationSql.toLowerCase()).not.toContain("companies");
  });
});

describe("concurrent close attempts", () => {
  it("lets the first committed close stand", async () => {
    let row = activeRow();
    let tail = Promise.resolve();
    const transaction = <T,>(run: (db: HistoricalAssignmentCloseDb) => Promise<T>) => {
      const runNow = tail.then(() =>
        run({
          lock: async () => ({ ...row }),
          closeActive: async (id, reason, closedByUserId) => {
            if (row.id !== id || row.status !== "ACTIVE") return null;
            row = { ...row, status: "CLOSED", closureReason: reason, closedByUserId, closedAt: activatedAt };
            return { ...row };
          },
        }),
      );
      tail = runNow.then(
        () => undefined,
        () => undefined,
      );
      return runNow;
    };
    const [first, second] = await Promise.all([
      closeHistoricalAssignment(
        { assignmentId: 7, reason: "Winner", actorId: 1, role: "admin" },
        { resolveUser: async () => ({ id: 9, roleName: "admin" }), transaction },
      ),
      closeHistoricalAssignment(
        { assignmentId: 7, reason: "Loser", actorId: 9, role: "sadmin" },
        { resolveUser: async () => ({ id: 4, roleName: "owner" }), transaction },
      ),
    ]);
    const results = [first, second];
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok && result.code === "conflict")).toHaveLength(1);
    expect(row.closureReason).toBe("Winner");
    expect(row.closedByUserId).toBe(9);
    expect(row.status).toBe("CLOSED");
  });
});

describe("session close entry", () => {
  const getCurrentUser = vi.hoisted(() => vi.fn());
  const queryRawUnsafe = vi.hoisted(() => vi.fn());
  const transaction = vi.hoisted(() => vi.fn());

  vi.mock("@/lib/db", () => ({
    prisma: { $transaction: transaction },
  }));
  vi.mock("@/server/current-user", () => ({
    getCurrentUser,
  }));

  it("uses the session user and ignores a client actor and role", async () => {
    getCurrentUser.mockResolvedValue({ id: 15, roleName: "owner" });
    queryRawUnsafe
      .mockResolvedValueOnce([
        {
          ...activeRow(),
          becameActiveAt: activatedAt,
          closedAt: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          ...activeRow(),
          status: "CLOSED",
          closureReason: "Done",
          closedByUserId: 15,
          closedAt: activatedAt,
          becameActiveAt: activatedAt,
        },
      ]);
    transaction.mockImplementation(async (run: (tx: { $queryRawUnsafe: typeof queryRawUnsafe }) => Promise<unknown>) =>
      run({ $queryRawUnsafe: queryRawUnsafe }),
    );
    const { closeHistoricalPartyAssignment } = await import("@/server/historical-party-assignment-close");
    const result = await closeHistoricalPartyAssignment({
      assignmentId: 7,
      reason: "Done",
      actorId: 1,
      role: "sadmin",
    });
    expect(getCurrentUser).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.assignment.closedByUserId).toBe(15);
    const closeSql = String(queryRawUnsafe.mock.calls[1]?.[0]);
    expect(closeSql).toContain("clock_timestamp()");
    expect(queryRawUnsafe.mock.calls[1]?.[2]).toBe(15);
  });
});
