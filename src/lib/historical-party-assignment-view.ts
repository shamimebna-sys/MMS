/**
 * Read-only historical assignment view.
 * Allowed roles are the exact stored names sadmin, admin, and owner.
 * This is not closure authority, a menu grant, or a candidate permission.
 * Further lifecycle changes are not part of this module.
 */

import type { HistoricalAssignmentRow, PartyCategory } from "@/lib/historical-party-assignment";
import { PARTY_CATEGORIES } from "@/lib/historical-party-assignment";

export const HISTORICAL_ASSIGNMENT_VIEWER_ROLES = ["sadmin", "admin", "owner"] as const;

export type HistoricalAssignmentViewerRole = (typeof HISTORICAL_ASSIGNMENT_VIEWER_ROLES)[number];

export const HISTORICAL_ASSIGNMENT_PAGE_SIZE = 25;

export type AssignmentViewer = {
  id: number;
  roleName: string | null;
  /** users.status. View access requires the exact value A. */
  status?: string | null;
};

export type AssignmentListFilter = {
  originalNameContains?: string;
  candidateId?: number;
  partyId?: number;
  partyCategory?: PartyCategory;
  status?: "ACTIVE" | "CLOSED";
  closedByUserId?: number;
};

export type AssignmentListQuery = {
  q?: unknown;
  candidateId?: unknown;
  partyId?: unknown;
  partyCategory?: unknown;
  status?: unknown;
  closedByUserId?: unknown;
  page?: unknown;
  /** Ignored. Page size is fixed. */
  pageSize?: unknown;
  /** Ignored. The role comes from the session loader. */
  role?: unknown;
  /** Ignored. */
  actorId?: unknown;
  /** Ignored. */
  permission?: unknown;
};

export type AssignmentReadResult<T> =
  | { ok: false; code: "unauthenticated" | "forbidden" }
  | { ok: true; data: T };

export type AssignmentListPage = {
  rows: HistoricalAssignmentRow[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

/** Exact stored role name. Display labels and grants are not view authority. */
export function isHistoricalAssignmentViewer(
  roleName: string | null | undefined,
): roleName is HistoricalAssignmentViewerRole {
  return roleName === "sadmin" || roleName === "admin" || roleName === "owner";
}

/**
 * Active session user with one of the three role names.
 * Status must be exactly A. Blank, null, missing, and any other value are denied.
 * This check does not change the session loader.
 */
export function canViewHistoricalAssignments(user: AssignmentViewer | null | undefined): user is AssignmentViewer {
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return false;
  if (user.status !== "A") return false;
  return isHistoricalAssignmentViewer(user.roleName);
}

type ParsedList =
  | { kind: "empty"; page: number }
  | { kind: "query"; filter: AssignmentListFilter; page: number };

export function parseAssignmentListQuery(input: AssignmentListQuery): ParsedList {
  const page = pageNumber(input.page);
  const filter: AssignmentListFilter = {};
  if (explicit(input.q)) {
    if (typeof input.q !== "string" || input.q.length > 255) return { kind: "empty", page };
    if (input.q.length > 0) filter.originalNameContains = input.q;
  }
  if (explicit(input.candidateId)) {
    const id = positiveInt(input.candidateId);
    if (id === null) return { kind: "empty", page };
    filter.candidateId = id;
  }
  if (explicit(input.partyId)) {
    const id = positiveInt(input.partyId);
    if (id === null) return { kind: "empty", page };
    filter.partyId = id;
  }
  if (explicit(input.closedByUserId)) {
    const id = positiveInt(input.closedByUserId);
    if (id === null) return { kind: "empty", page };
    filter.closedByUserId = id;
  }
  if (explicit(input.partyCategory)) {
    const category = categoryOf(input.partyCategory);
    if (!category) return { kind: "empty", page };
    filter.partyCategory = category;
  }
  if (explicit(input.status)) {
    const status = statusOf(input.status);
    if (!status) return { kind: "empty", page };
    filter.status = status;
  }
  return { kind: "query", filter, page };
}

export function assignmentListHref(
  filters: {
    q?: string;
    candidateId?: string;
    partyId?: string;
    partyCategory?: string;
    status?: string;
    closedByUserId?: string;
  },
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (!value) continue;
    params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/historical-assignments?${query}` : "/historical-assignments";
}

export async function readHistoricalAssignmentList(
  input: AssignmentListQuery,
  deps: {
    resolveUser: () => Promise<AssignmentViewer | null>;
    query: (filter: AssignmentListFilter, page: number) => Promise<{ rows: HistoricalAssignmentRow[]; total: number }>;
  },
): Promise<AssignmentReadResult<AssignmentListPage>> {
  ignoreClientAuthority(input);
  const access = await viewAccess(deps.resolveUser);
  if (!access.ok) return access;
  const parsed = parseAssignmentListQuery(input);
  if (parsed.kind === "empty") {
    return { ok: true, data: emptyPage(parsed.page) };
  }
  const { rows, total } = await deps.query(parsed.filter, parsed.page);
  return {
    ok: true,
    data: {
      rows,
      page: parsed.page,
      pageSize: HISTORICAL_ASSIGNMENT_PAGE_SIZE,
      total,
      hasMore: parsed.page * HISTORICAL_ASSIGNMENT_PAGE_SIZE < total,
    },
  };
}

export async function readHistoricalAssignment(
  input: { assignmentId: unknown; role?: unknown; actorId?: unknown; permission?: unknown },
  deps: {
    resolveUser: () => Promise<AssignmentViewer | null>;
    find: (id: number) => Promise<HistoricalAssignmentRow | null>;
  },
): Promise<AssignmentReadResult<HistoricalAssignmentRow | null>> {
  ignoreClientAuthority(input);
  const access = await viewAccess(deps.resolveUser);
  if (!access.ok) return access;
  const id = positiveInt(input.assignmentId);
  if (id === null) return { ok: true, data: null };
  return { ok: true, data: await deps.find(id) };
}

async function viewAccess(
  resolveUser: () => Promise<AssignmentViewer | null>,
): Promise<{ ok: true } | { ok: false; code: "unauthenticated" | "forbidden" }> {
  const user = await resolveUser();
  if (!user) return { ok: false, code: "unauthenticated" };
  if (!canViewHistoricalAssignments(user)) return { ok: false, code: "forbidden" };
  return { ok: true };
}

function emptyPage(page: number): AssignmentListPage {
  return { rows: [], page, pageSize: HISTORICAL_ASSIGNMENT_PAGE_SIZE, total: 0, hasMore: false };
}

function ignoreClientAuthority(input: { role?: unknown; actorId?: unknown; permission?: unknown }): void {
  void input.role;
  void input.actorId;
  void input.permission;
}

function explicit(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.length > 0;
  return true;
}

function pageNumber(value: unknown): number {
  const page = positiveInt(value);
  return page ?? 1;
}

function positiveInt(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value <= 0) return null;
    return value;
  }
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return id;
}

function categoryOf(value: unknown): PartyCategory | null {
  if (typeof value !== "string") return null;
  return PARTY_CATEGORIES.find((category) => category === value) ?? null;
}

function statusOf(value: unknown): "ACTIVE" | "CLOSED" | null {
  if (value === "ACTIVE" || value === "CLOSED") return value;
  return null;
}
