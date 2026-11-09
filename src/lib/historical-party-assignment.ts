/**
 * Historical assignment identity is a distinct record.
 * It is not agencies, companies, or employer_candidates.
 * candidate id, party id, and closing user id are stored without foreign keys.
 * A05-09 remains proposed. A missing parent does not delete history.
 * Close does not check that those parents still exist, and it does not add a key.
 * View is a separate read-only permission. Create, reassignment, and edit stay unimplemented.
 * Employer is not part of this lifecycle.
 */

export const HISTORICAL_ASSIGNMENT_TABLE = "historical_party_assignments";

export const HISTORICAL_ASSIGNMENT_CLOSER_ROLES = ["sadmin", "admin", "owner"] as const;

export type HistoricalAssignmentCloserRole = (typeof HISTORICAL_ASSIGNMENT_CLOSER_ROLES)[number];

export const PARTY_CATEGORIES = ["agent", "sub_agent", "agencier", "companier"] as const;

export type PartyCategory = (typeof PARTY_CATEGORIES)[number];

/**
 * Agent and Sub-Agent have no approved single original address.
 * Present and permanent parts stay separate. They are not concatenated,
 * and neither side is chosen as the canonical address.
 */
export const CANONICAL_AGENT_ADDRESS_UNRESOLVED =
  "A single canonical original address for Agent and Sub-Agent is unresolved. Present and permanent parts are stored separately and are not concatenated.";

export type SplitAddressSource = {
  presentAddressHouse: string | null;
  presentAddressRoad: string | null;
  presentAddressVillage: string | null;
  presentAddressPost: string | null;
  presentAddressThanaId: number | null;
  presentAddressDistrictId: number | null;
  presentAddressDivisionId: number | null;
  permanentAddressHouse: string | null;
  permanentAddressRoad: string | null;
  permanentAddressVillage: string | null;
  permanentAddressPost: string | null;
  permanentAddressThanaId: number | null;
  permanentAddressDistrictId: number | null;
  permanentAddressDivisionId: number | null;
};

export type AddressSnapshotColumns = SplitAddressSource & {
  originalAddress: string | null;
};

export type HistoricalAssignmentRow = AddressSnapshotColumns & {
  id: number;
  candidateId: number;
  partyCategory: PartyCategory;
  partyId: number;
  originalName: string;
  status: "ACTIVE" | "CLOSED";
  becameActiveAt: Date;
  closureReason: string | null;
  closedByUserId: number | null;
  closedAt: Date | null;
};

export type CloseHistoricalAssignmentResult =
  | { ok: true; assignment: HistoricalAssignmentRow }
  | {
      ok: false;
      code: "unauthenticated" | "forbidden" | "invalid_reason" | "not_found" | "conflict";
    };

export type CloseHistoricalAssignmentInput = {
  assignmentId: unknown;
  reason: unknown;
  /** Ignored. The actor is the authenticated session user. */
  actorId?: unknown;
  /** Ignored. The role is resolved on the server from users.role_id. */
  role?: unknown;
};

export type SessionCloser = {
  id: number;
  roleName: string | null;
};

export type HistoricalAssignmentCloseDb = {
  lock(id: number): Promise<HistoricalAssignmentRow | null>;
  closeActive(id: number, reason: string, closedByUserId: number): Promise<HistoricalAssignmentRow | null>;
};

const TABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;

const SPLIT_TEXT_KEYS = [
  "presentAddressHouse",
  "presentAddressRoad",
  "presentAddressVillage",
  "presentAddressPost",
  "permanentAddressHouse",
  "permanentAddressRoad",
  "permanentAddressVillage",
  "permanentAddressPost",
] as const;

const SPLIT_ID_KEYS = [
  "presentAddressThanaId",
  "presentAddressDistrictId",
  "presentAddressDivisionId",
  "permanentAddressThanaId",
  "permanentAddressDistrictId",
  "permanentAddressDivisionId",
] as const;

/** Exact stored role name. Display labels are not closure authority. */
export function isHistoricalAssignmentCloser(roleName: string | null | undefined): roleName is HistoricalAssignmentCloserRole {
  return roleName === "sadmin" || roleName === "admin" || roleName === "owner";
}

/**
 * Copies the Agencier or Companier address column.
 * Null stays null. An empty string stays empty. The value is not trimmed.
 */
export function snapshotSingleAddress(address: string | null): AddressSnapshotColumns {
  return {
    originalAddress: exactText(address, "address"),
    ...emptySplitAddress(),
  };
}

/**
 * Copies Agent or Sub-Agent present and permanent parts separately.
 * originalAddress stays null because no canonical address is approved.
 */
export function snapshotSplitAddress(source: SplitAddressSource): AddressSnapshotColumns {
  const columns = emptySplitAddress();
  for (const key of SPLIT_TEXT_KEYS) {
    columns[key] = exactText(source[key], key);
  }
  for (const key of SPLIT_ID_KEYS) {
    columns[key] = exactId(source[key], key);
  }
  return { originalAddress: null, ...columns };
}

export function closureReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reason = value.trim();
  return reason.length > 0 ? reason : null;
}

export function assignmentCloseSql(table = HISTORICAL_ASSIGNMENT_TABLE): { lock: string; close: string } {
  if (!TABLE_NAME.test(table)) throw new Error("Invalid historical assignment table.");
  const returning = `
    id,
    candidate_id AS "candidateId",
    party_category AS "partyCategory",
    party_id AS "partyId",
    original_name AS "originalName",
    original_address AS "originalAddress",
    present_address_house AS "presentAddressHouse",
    present_address_road AS "presentAddressRoad",
    present_address_village AS "presentAddressVillage",
    present_address_post AS "presentAddressPost",
    present_address_thana_id AS "presentAddressThanaId",
    present_address_district_id AS "presentAddressDistrictId",
    present_address_division_id AS "presentAddressDivisionId",
    permanent_address_house AS "permanentAddressHouse",
    permanent_address_road AS "permanentAddressRoad",
    permanent_address_village AS "permanentAddressVillage",
    permanent_address_post AS "permanentAddressPost",
    permanent_address_thana_id AS "permanentAddressThanaId",
    permanent_address_district_id AS "permanentAddressDistrictId",
    permanent_address_division_id AS "permanentAddressDivisionId",
    status,
    became_active_at AS "becameActiveAt",
    closure_reason AS "closureReason",
    closed_by_user_id AS "closedByUserId",
    closed_at AS "closedAt"`;
  return {
    lock: `SELECT ${returning} FROM ${table} WHERE id = $1 FOR UPDATE`,
    close: `UPDATE ${table}
      SET status = 'CLOSED',
          closure_reason = $1,
          closed_by_user_id = $2,
          closed_at = clock_timestamp()
      WHERE id = $3
        AND status = 'ACTIVE'
      RETURNING ${returning}`,
  };
}

/**
 * Closes one ACTIVE assignment.
 * The actor and role come from resolveUser, which must load users.role_id.
 * actorId and role on the input are discarded.
 * Inactive and signed-out users are rejected when resolveUser returns null.
 * That is the existing session loader. This function does not add a status rule.
 */
export async function closeHistoricalAssignment(
  input: CloseHistoricalAssignmentInput,
  deps: {
    resolveUser: () => Promise<SessionCloser | null>;
    transaction: <T>(run: (db: HistoricalAssignmentCloseDb) => Promise<T>) => Promise<T>;
  },
): Promise<CloseHistoricalAssignmentResult> {
  ignoreClientAuthority(input);
  const user = await deps.resolveUser();
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return { ok: false, code: "unauthenticated" };
  if (!isHistoricalAssignmentCloser(user.roleName)) return { ok: false, code: "forbidden" };

  const reason = closureReason(input.reason);
  if (!reason) return { ok: false, code: "invalid_reason" };

  const assignmentId = assignmentIdOf(input.assignmentId);
  if (assignmentId === null) return { ok: false, code: "not_found" };

  try {
    return await deps.transaction(async (db) => {
      const locked = await db.lock(assignmentId);
      if (!locked) return { ok: false, code: "not_found" as const };
      if (locked.status !== "ACTIVE") return { ok: false, code: "conflict" as const };
      const closed = await db.closeActive(assignmentId, reason, user.id);
      if (!closed || closed.status !== "CLOSED" || closed.closedByUserId !== user.id) {
        return { ok: false, code: "conflict" as const };
      }
      return { ok: true, assignment: closed };
    });
  } catch (error) {
    if (isClosureConflict(error)) return { ok: false, code: "conflict" };
    throw error;
  }
}

function ignoreClientAuthority(input: CloseHistoricalAssignmentInput): void {
  void input.actorId;
  void input.role;
}

function assignmentIdOf(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

function exactText(value: string | null, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${label} must be a string or null.`);
  return value;
}

function exactId(value: number | null, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`${label} must be an integer or null.`);
  return value;
}

function emptySplitAddress(): SplitAddressSource {
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
  };
}

function isClosureConflict(error: unknown): boolean {
  const code = errorCode(error);
  if (code === "23514" || code === "23001") return true;
  const message = error instanceof Error ? error.message : "";
  return /cannot be reopened|closure facts cannot be rewritten|only an ACTIVE to CLOSED|cannot be changed|cannot carry closure facts|cannot be physically deleted/i.test(
    message,
  );
}

function errorCode(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  if ("code" in error && (typeof error.code === "string" || typeof error.code === "number")) return String(error.code);
  if ("cause" in error) return errorCode(error.cause);
  return "";
}
