import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { HistoricalAssignmentRow, PartyCategory } from "@/lib/historical-party-assignment";
import {
  HISTORICAL_ASSIGNMENT_PAGE_SIZE,
  readHistoricalAssignment,
  readHistoricalAssignmentList,
  type AssignmentListFilter,
  type AssignmentListPage,
  type AssignmentListQuery,
  type AssignmentReadResult,
  type AssignmentViewer,
} from "@/lib/historical-party-assignment-view";
import { getCurrentUser } from "@/server/current-user";

const select = {
  id: true,
  candidateId: true,
  partyCategory: true,
  partyId: true,
  originalName: true,
  originalAddress: true,
  presentAddressHouse: true,
  presentAddressRoad: true,
  presentAddressVillage: true,
  presentAddressPost: true,
  presentAddressThanaId: true,
  presentAddressDistrictId: true,
  presentAddressDivisionId: true,
  permanentAddressHouse: true,
  permanentAddressRoad: true,
  permanentAddressVillage: true,
  permanentAddressPost: true,
  permanentAddressThanaId: true,
  permanentAddressDistrictId: true,
  permanentAddressDivisionId: true,
  status: true,
  becameActiveAt: true,
  closureReason: true,
  closedByUserId: true,
  closedAt: true,
} satisfies Prisma.HistoricalPartyAssignmentSelect;

type StoredAssignment = Prisma.HistoricalPartyAssignmentGetPayload<{ select: typeof select }>;

/**
 * Lists historical assignments for the signed-in user.
 * The role is users.role_id → roles.name from the existing session loader.
 * A query role, actor id, or permission is ignored. No write is issued.
 */
export async function listHistoricalPartyAssignments(
  input: AssignmentListQuery,
): Promise<AssignmentReadResult<AssignmentListPage>> {
  return readHistoricalAssignmentList(input, {
    resolveUser: resolveViewer,
    query: queryAssignments,
  });
}

/**
 * Reads one historical assignment for the signed-in user.
 * Missing and forbidden callers do not reach the query.
 */
export async function getHistoricalPartyAssignment(input: {
  assignmentId: unknown;
  role?: unknown;
  actorId?: unknown;
  permission?: unknown;
}): Promise<AssignmentReadResult<HistoricalAssignmentRow | null>> {
  return readHistoricalAssignment(input, {
    resolveUser: resolveViewer,
    find: findAssignment,
  });
}

async function resolveViewer(): Promise<AssignmentViewer | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return { id: user.id, roleName: user.roleName, status: user.status };
}

async function queryAssignments(
  filter: AssignmentListFilter,
  page: number,
): Promise<{ rows: HistoricalAssignmentRow[]; total: number }> {
  const where = whereOf(filter);
  const skip = (page - 1) * HISTORICAL_ASSIGNMENT_PAGE_SIZE;
  const [stored, total] = await Promise.all([
    prisma.historicalPartyAssignment.findMany({
      where,
      select,
      orderBy: { id: "desc" },
      skip,
      take: HISTORICAL_ASSIGNMENT_PAGE_SIZE,
    }),
    prisma.historicalPartyAssignment.count({ where }),
  ]);
  return { rows: stored.map(mapAssignment), total };
}

async function findAssignment(id: number): Promise<HistoricalAssignmentRow | null> {
  const stored = await prisma.historicalPartyAssignment.findUnique({ where: { id }, select });
  return stored ? mapAssignment(stored) : null;
}

function whereOf(filter: AssignmentListFilter): Prisma.HistoricalPartyAssignmentWhereInput {
  const where: Prisma.HistoricalPartyAssignmentWhereInput = {};
  if (filter.originalNameContains !== undefined) {
    where.originalName = { contains: filter.originalNameContains, mode: "insensitive" };
  }
  if (filter.candidateId !== undefined) where.candidateId = filter.candidateId;
  if (filter.partyId !== undefined) where.partyId = filter.partyId;
  if (filter.partyCategory !== undefined) where.partyCategory = filter.partyCategory;
  if (filter.status !== undefined) where.status = filter.status;
  if (filter.closedByUserId !== undefined) where.closedByUserId = filter.closedByUserId;
  return where;
}

function mapAssignment(row: StoredAssignment): HistoricalAssignmentRow {
  const status = row.status === "ACTIVE" || row.status === "CLOSED" ? row.status : null;
  const partyCategory = partyCategoryOf(row.partyCategory);
  if (!status || !partyCategory) throw new Error("Historical assignment row is invalid.");
  return {
    id: row.id,
    candidateId: row.candidateId,
    partyCategory,
    partyId: row.partyId,
    originalName: row.originalName,
    originalAddress: row.originalAddress,
    presentAddressHouse: row.presentAddressHouse,
    presentAddressRoad: row.presentAddressRoad,
    presentAddressVillage: row.presentAddressVillage,
    presentAddressPost: row.presentAddressPost,
    presentAddressThanaId: row.presentAddressThanaId,
    presentAddressDistrictId: row.presentAddressDistrictId,
    presentAddressDivisionId: row.presentAddressDivisionId,
    permanentAddressHouse: row.permanentAddressHouse,
    permanentAddressRoad: row.permanentAddressRoad,
    permanentAddressVillage: row.permanentAddressVillage,
    permanentAddressPost: row.permanentAddressPost,
    permanentAddressThanaId: row.permanentAddressThanaId,
    permanentAddressDistrictId: row.permanentAddressDistrictId,
    permanentAddressDivisionId: row.permanentAddressDivisionId,
    status,
    becameActiveAt: row.becameActiveAt,
    closureReason: row.closureReason,
    closedByUserId: row.closedByUserId,
    closedAt: row.closedAt,
  };
}

function partyCategoryOf(value: string): PartyCategory | null {
  if (value === "agent" || value === "sub_agent" || value === "agencier" || value === "companier") return value;
  return null;
}
