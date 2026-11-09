/**
 * Create and reassign historical assignments for Agent, Sub-Agent, Agencier, and Companier.
 * Active sadmin, admin, and owner are the only writers. Status must be exactly A.
 * The actor, role, and status come from resolveUser. Client authority fields are ignored.
 * The original name is copied from the party row. It is not client text.
 * Agencier and Companier copy their single address column. Split address columns stay null.
 * Agent and Sub-Agent copy each present and permanent address part separately.
 * Those parts are not concatenated, trimmed, or chosen as a primary address.
 * originalAddress stays null for Agent and Sub-Agent.
 * Employer is not created or reassigned here.
 * A05-09 stays proposed: candidate and party ids are checked, then stored without a foreign key.
 */

import {
  HISTORICAL_ASSIGNMENT_TABLE,
  assignmentCloseSql,
  closureReason,
  isHistoricalAssignmentCloser,
  snapshotSingleAddress,
  snapshotSplitAddress,
  type AddressSnapshotColumns,
  type HistoricalAssignmentRow,
  type SplitAddressSource,
} from "@/lib/historical-party-assignment";

export const WRITABLE_PARTY_CATEGORIES = ["agent", "sub_agent", "agencier", "companier"] as const;

export type WritablePartyCategory = (typeof WRITABLE_PARTY_CATEGORIES)[number];

export type AssignmentWriter = {
  id: number;
  roleName: string | null;
  /** users.status. Write access requires the exact value A. */
  status?: string | null;
};

export type AssignmentWriteCode =
  | "unauthenticated"
  | "forbidden"
  | "invalid_category"
  | "invalid_candidate"
  | "invalid_party"
  | "invalid_name"
  | "invalid_reason"
  | "not_found"
  | "conflict";

export type AssignmentWriteResult =
  | { ok: true; assignment: HistoricalAssignmentRow; closed: HistoricalAssignmentRow | null }
  | { ok: false; code: AssignmentWriteCode };

export type IgnoredWriteAuthority = {
  /** Ignored. The actor is the authenticated session user. */
  actorId?: unknown;
  /** Ignored. The role is resolved on the server from users.role_id. */
  role?: unknown;
  /** Ignored. Status is read from the session user. */
  status?: unknown;
  /** Ignored. The name is copied from the party row. */
  originalName?: unknown;
  /** Ignored. Agencier and Companier address text is copied from the party row. */
  originalAddress?: unknown;
  /** Ignored. Agent and Sub-Agent address parts are copied from the party row. */
  presentAddress?: unknown;
  /** Ignored. Agent and Sub-Agent address parts are copied from the party row. */
  permanentAddress?: unknown;
  /** Ignored. became_active_at is clock_timestamp() in the insert. */
  becameActiveAt?: unknown;
  /** Ignored. New rows are ACTIVE. */
  assignmentStatus?: unknown;
  /** Ignored. */
  permission?: unknown;
};

export type CreateHistoricalAssignmentInput = IgnoredWriteAuthority & {
  candidateId: unknown;
  partyCategory: unknown;
  partyId: unknown;
};

export type ReassignHistoricalAssignmentInput = IgnoredWriteAuthority & {
  assignmentId: unknown;
  partyId: unknown;
  /** When present, must match the locked assignment category. */
  partyCategory?: unknown;
  reason: unknown;
};

export type SinglePartySnapshot = {
  name: string | null;
  address: string | null;
};

export type SplitPartySnapshot = { name: string | null } & SplitAddressSource;

export type PartySnapshotSource = SinglePartySnapshot | SplitPartySnapshot;

export type NewActiveAssignment = {
  candidateId: number;
  partyCategory: WritablePartyCategory;
  partyId: number;
  originalName: string;
} & AddressSnapshotColumns;

export type HistoricalAssignmentCreateDb = {
  candidateExists(id: number): Promise<boolean>;
  readParty(category: WritablePartyCategory, partyId: number): Promise<PartySnapshotSource | null>;
  lockActive(candidateId: number, category: WritablePartyCategory): Promise<HistoricalAssignmentRow | null>;
  insertActive(row: NewActiveAssignment): Promise<HistoricalAssignmentRow>;
};

export type HistoricalAssignmentReassignDb = {
  lockAssignment(id: number): Promise<HistoricalAssignmentRow | null>;
  candidateExists(id: number): Promise<boolean>;
  readParty(category: WritablePartyCategory, partyId: number): Promise<PartySnapshotSource | null>;
  closeActive(id: number, reason: string, closedByUserId: number): Promise<HistoricalAssignmentRow | null>;
  insertActive(row: NewActiveAssignment): Promise<HistoricalAssignmentRow>;
};

const TABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;

const RETURNING = `
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

export class HistoricalAssignmentWriteError extends Error {
  readonly reason = "conflict" as const;

  constructor() {
    super("conflict");
    this.name = "HistoricalAssignmentWriteError";
  }
}

/** Exact status A and one of the three stored role names. Display labels are not authority. */
export function canWriteHistoricalAssignment(user: AssignmentWriter | null | undefined): user is AssignmentWriter {
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return false;
  if (user.status !== "A") return false;
  return isHistoricalAssignmentCloser(user.roleName);
}

/**
 * Non-blank identifying name. Null, empty, and whitespace-only values fail.
 * The stored text is not trimmed. Placeholder words are not classified here.
 */
export function identifyingName(value: string | null): string | null {
  if (typeof value !== "string") return null;
  if (value.trim().length === 0) return null;
  if (value.length > 255) return null;
  return value;
}

export function writablePartyCategory(value: unknown): WritablePartyCategory | null {
  if (value === "agent" || value === "sub_agent" || value === "agencier" || value === "companier") return value;
  return null;
}

const SPLIT_TEXT_LIMITS = {
  presentAddressHouse: 200,
  presentAddressRoad: 20,
  presentAddressVillage: 20,
  presentAddressPost: 20,
  permanentAddressHouse: 200,
  permanentAddressRoad: 20,
  permanentAddressVillage: 20,
  permanentAddressPost: 20,
} as const;

export function assignmentInsertSql(table = HISTORICAL_ASSIGNMENT_TABLE): string {
  if (!TABLE_NAME.test(table)) throw new Error("Invalid historical assignment table.");
  return `INSERT INTO ${table} (
      candidate_id,
      party_category,
      party_id,
      original_name,
      original_address,
      present_address_house,
      present_address_road,
      present_address_village,
      present_address_post,
      present_address_thana_id,
      present_address_district_id,
      present_address_division_id,
      permanent_address_house,
      permanent_address_road,
      permanent_address_village,
      permanent_address_post,
      permanent_address_thana_id,
      permanent_address_district_id,
      permanent_address_division_id,
      status,
      became_active_at,
      closure_reason,
      closed_by_user_id,
      closed_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10, $11, $12,
      $13, $14, $15, $16, $17, $18, $19,
      'ACTIVE', clock_timestamp(),
      NULL, NULL, NULL
    )
    RETURNING ${RETURNING}`;
}

export function assignmentInsertValues(row: NewActiveAssignment): unknown[] {
  return [
    row.candidateId,
    row.partyCategory,
    row.partyId,
    row.originalName,
    row.originalAddress,
    row.presentAddressHouse,
    row.presentAddressRoad,
    row.presentAddressVillage,
    row.presentAddressPost,
    row.presentAddressThanaId,
    row.presentAddressDistrictId,
    row.presentAddressDivisionId,
    row.permanentAddressHouse,
    row.permanentAddressRoad,
    row.permanentAddressVillage,
    row.permanentAddressPost,
    row.permanentAddressThanaId,
    row.permanentAddressDistrictId,
    row.permanentAddressDivisionId,
  ];
}

export function assignmentActiveLockSql(table = HISTORICAL_ASSIGNMENT_TABLE): string {
  if (!TABLE_NAME.test(table)) throw new Error("Invalid historical assignment table.");
  return `SELECT ${RETURNING}
    FROM ${table}
    WHERE candidate_id = $1
      AND party_category = $2
      AND status = 'ACTIVE'
    FOR UPDATE`;
}

export async function createHistoricalAssignment(
  input: CreateHistoricalAssignmentInput,
  deps: {
    resolveUser: () => Promise<AssignmentWriter | null>;
    transaction: <T>(run: (db: HistoricalAssignmentCreateDb) => Promise<T>) => Promise<T>;
  },
): Promise<AssignmentWriteResult> {
  ignoreClientAuthority(input);
  const user = await authorizedWriter(deps.resolveUser);
  if (user.ok === false) return user;

  const partyCategory = writablePartyCategory(input.partyCategory);
  if (!partyCategory) return { ok: false, code: "invalid_category" };
  const candidateId = positiveId(input.candidateId);
  if (candidateId === null) return { ok: false, code: "invalid_candidate" };
  const partyId = positiveId(input.partyId);
  if (partyId === null) return { ok: false, code: "invalid_party" };

  try {
    return await deps.transaction(async (db) => {
      if (!(await db.candidateExists(candidateId))) return { ok: false, code: "invalid_candidate" as const };
      const party = await db.readParty(partyCategory, partyId);
      const snapshot = snapshotOf(partyCategory, party);
      if (snapshot.ok === false) return snapshot;
      const existing = await db.lockActive(candidateId, partyCategory);
      if (existing) return { ok: false, code: "conflict" as const };
      const assignment = await db.insertActive({
        candidateId,
        partyCategory,
        partyId,
        originalName: snapshot.name,
        ...snapshot.address,
      });
      if (assignment.status !== "ACTIVE" || assignment.originalName !== snapshot.name) {
        throw new HistoricalAssignmentWriteError();
      }
      if (!sameAddress(assignment, snapshot.address)) throw new HistoricalAssignmentWriteError();
      return { ok: true as const, assignment, closed: null };
    });
  } catch (error) {
    if (isWriteConflict(error)) return { ok: false, code: "conflict" };
    throw error;
  }
}

export async function reassignHistoricalAssignment(
  input: ReassignHistoricalAssignmentInput,
  deps: {
    resolveUser: () => Promise<AssignmentWriter | null>;
    transaction: <T>(run: (db: HistoricalAssignmentReassignDb) => Promise<T>) => Promise<T>;
  },
): Promise<AssignmentWriteResult> {
  ignoreClientAuthority(input);
  const user = await authorizedWriter(deps.resolveUser);
  if (user.ok === false) return user;

  const reason = closureReason(input.reason);
  if (!reason) return { ok: false, code: "invalid_reason" };
  const assignmentId = positiveId(input.assignmentId);
  if (assignmentId === null) return { ok: false, code: "not_found" };
  const partyId = positiveId(input.partyId);
  if (partyId === null) return { ok: false, code: "invalid_party" };

  let requestedCategory: WritablePartyCategory | undefined;
  if (input.partyCategory !== undefined && input.partyCategory !== null) {
    const category = writablePartyCategory(input.partyCategory);
    if (!category) return { ok: false, code: "invalid_category" };
    requestedCategory = category;
  }

  try {
    return await deps.transaction(async (db) => {
      const locked = await db.lockAssignment(assignmentId);
      if (!locked) return { ok: false, code: "not_found" as const };
      if (locked.status !== "ACTIVE") return { ok: false, code: "conflict" as const };
      const category = writablePartyCategory(locked.partyCategory);
      if (!category) return { ok: false, code: "invalid_category" as const };
      if (requestedCategory && requestedCategory !== category) return { ok: false, code: "invalid_category" as const };
      if (!(await db.candidateExists(locked.candidateId))) return { ok: false, code: "invalid_candidate" as const };
      const party = await db.readParty(category, partyId);
      const snapshot = snapshotOf(category, party);
      if (snapshot.ok === false) return snapshot;

      const closed = await db.closeActive(assignmentId, reason, user.writer.id);
      if (!closed || closed.status !== "CLOSED" || closed.closedByUserId !== user.writer.id) {
        throw new HistoricalAssignmentWriteError();
      }
      if (closed.originalName !== locked.originalName || !sameAddress(closed, locked)) {
        throw new HistoricalAssignmentWriteError();
      }
      const assignment = await db.insertActive({
        candidateId: locked.candidateId,
        partyCategory: category,
        partyId,
        originalName: snapshot.name,
        ...snapshot.address,
      });
      if (assignment.status !== "ACTIVE" || assignment.candidateId !== locked.candidateId) {
        throw new HistoricalAssignmentWriteError();
      }
      if (assignment.originalName !== snapshot.name || !sameAddress(assignment, snapshot.address)) {
        throw new HistoricalAssignmentWriteError();
      }
      return { ok: true as const, assignment, closed };
    });
  } catch (error) {
    if (isWriteConflict(error)) return { ok: false, code: "conflict" };
    throw error;
  }
}

export function assignmentReassignCloseSql(table = HISTORICAL_ASSIGNMENT_TABLE): string {
  return assignmentCloseSql(table).close;
}

async function authorizedWriter(
  resolveUser: () => Promise<AssignmentWriter | null>,
): Promise<{ ok: true; writer: AssignmentWriter } | { ok: false; code: "unauthenticated" | "forbidden" }> {
  const user = await resolveUser();
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return { ok: false, code: "unauthenticated" };
  if (!canWriteHistoricalAssignment(user)) return { ok: false, code: "forbidden" };
  return { ok: true, writer: user };
}

function snapshotOf(
  category: WritablePartyCategory,
  party: PartySnapshotSource | null,
): { ok: true; name: string; address: AddressSnapshotColumns } | { ok: false; code: "invalid_party" | "invalid_name" } {
  if (!party) return { ok: false, code: "invalid_party" };
  const name = identifyingName(party.name);
  if (!name) return { ok: false, code: "invalid_name" };
  if (category === "agencier" || category === "companier") {
    if (!isSingleParty(party)) return { ok: false, code: "invalid_party" };
    if (party.address !== null && party.address.length > 255) return { ok: false, code: "invalid_party" };
    return { ok: true, name, address: snapshotSingleAddress(party.address) };
  }
  if (!isSplitParty(party)) return { ok: false, code: "invalid_party" };
  let address: AddressSnapshotColumns;
  try {
    address = snapshotSplitAddress(party);
  } catch {
    return { ok: false, code: "invalid_party" };
  }
  if (address.originalAddress !== null) return { ok: false, code: "invalid_party" };
  for (const key of Object.keys(SPLIT_TEXT_LIMITS) as (keyof typeof SPLIT_TEXT_LIMITS)[]) {
    const value = address[key];
    if (value !== null && value.length > SPLIT_TEXT_LIMITS[key]) return { ok: false, code: "invalid_party" };
  }
  return { ok: true, name, address };
}

function isSingleParty(party: PartySnapshotSource): party is SinglePartySnapshot {
  return "address" in party;
}

function isSplitParty(party: PartySnapshotSource): party is SplitPartySnapshot {
  return "presentAddressHouse" in party;
}

const ADDRESS_KEYS = [
  "originalAddress",
  "presentAddressHouse",
  "presentAddressRoad",
  "presentAddressVillage",
  "presentAddressPost",
  "presentAddressThanaId",
  "presentAddressDistrictId",
  "presentAddressDivisionId",
  "permanentAddressHouse",
  "permanentAddressRoad",
  "permanentAddressVillage",
  "permanentAddressPost",
  "permanentAddressThanaId",
  "permanentAddressDistrictId",
  "permanentAddressDivisionId",
] as const satisfies readonly (keyof AddressSnapshotColumns)[];

function sameAddress(left: AddressSnapshotColumns, right: AddressSnapshotColumns): boolean {
  return ADDRESS_KEYS.every((key) => left[key] === right[key]);
}

function ignoreClientAuthority(input: IgnoredWriteAuthority): void {
  void input.actorId;
  void input.role;
  void input.status;
  void input.originalName;
  void input.originalAddress;
  void input.presentAddress;
  void input.permanentAddress;
  void input.becameActiveAt;
  void input.assignmentStatus;
  void input.permission;
}

function positiveId(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value <= 0) return null;
    return value;
  }
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    return id;
  }
  return null;
}

function isWriteConflict(error: unknown): boolean {
  if (error instanceof HistoricalAssignmentWriteError) return true;
  const code = errorCode(error);
  if (code === "23505" || code === "23514" || code === "23001" || code === "P2002") return true;
  const message = error instanceof Error ? error.message : "";
  return /duplicate key|historical_party_assignments_one_active|cannot be reopened|only an ACTIVE to CLOSED|cannot be changed|cannot carry closure facts/i.test(
    message,
  );
}

function errorCode(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  if ("code" in error && (typeof error.code === "string" || typeof error.code === "number")) return String(error.code);
  if ("cause" in error) return errorCode(error.cause);
  return "";
}
