import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { HistoricalAssignmentRow, PartyCategory } from "@/lib/historical-party-assignment";
import { assignmentCloseSql } from "@/lib/historical-party-assignment";
import {
  assignmentActiveLockSql,
  assignmentInsertSql,
  assignmentInsertValues,
  createHistoricalAssignment,
  reassignHistoricalAssignment,
  type AssignmentWriteResult,
  type CreateHistoricalAssignmentInput,
  type NewActiveAssignment,
  type PartySnapshotSource,
  type ReassignHistoricalAssignmentInput,
  type WritablePartyCategory,
} from "@/lib/historical-party-assignment-write";
import { getCurrentUser } from "@/server/current-user";

const INSERT_SQL = assignmentInsertSql();
const ACTIVE_LOCK_SQL = assignmentActiveLockSql();
const CLOSE_SQL = assignmentCloseSql();

type RawAssignment = {
  id: number | string;
  candidateId: number | string;
  partyCategory: string;
  partyId: number | string;
  originalName: string;
  originalAddress: string | null;
  presentAddressHouse: string | null;
  presentAddressRoad: string | null;
  presentAddressVillage: string | null;
  presentAddressPost: string | null;
  presentAddressThanaId: number | string | null;
  presentAddressDistrictId: number | string | null;
  presentAddressDivisionId: number | string | null;
  permanentAddressHouse: string | null;
  permanentAddressRoad: string | null;
  permanentAddressVillage: string | null;
  permanentAddressPost: string | null;
  permanentAddressThanaId: number | string | null;
  permanentAddressDistrictId: number | string | null;
  permanentAddressDivisionId: number | string | null;
  status: string;
  becameActiveAt: Date | string;
  closureReason: string | null;
  closedByUserId: number | string | null;
  closedAt: Date | string | null;
};

type Queryable = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
};

type WriterTx = Prisma.TransactionClient & Queryable;

/**
 * Creates one ACTIVE Agent, Sub-Agent, Agencier, or Companier assignment for the signed-in user.
 * Role and status come from the session user loaded by getCurrentUser.
 * A body actor, role, status, name, address, or activation time is ignored.
 */
export async function createHistoricalPartyAssignment(
  input: CreateHistoricalAssignmentInput,
): Promise<AssignmentWriteResult> {
  return createHistoricalAssignment(input, {
    resolveUser: resolveWriter,
    transaction: (run) =>
      prisma.$transaction(async (tx) => run(createDb(tx as WriterTx)), {
        isolationLevel: "ReadCommitted",
        maxWait: 5_000,
        timeout: 20_000,
      }),
  });
}

/**
 * Closes one ACTIVE assignment and inserts its replacement in the same transaction.
 * The category stays the category of the locked row.
 * Agent, Sub-Agent, Agencier, and Companier are accepted. Employer is not.
 */
export async function reassignHistoricalPartyAssignment(
  input: ReassignHistoricalAssignmentInput,
): Promise<AssignmentWriteResult> {
  return reassignHistoricalAssignment(input, {
    resolveUser: resolveWriter,
    transaction: (run) =>
      prisma.$transaction(async (tx) => run(reassignDb(tx as WriterTx)), {
        isolationLevel: "ReadCommitted",
        maxWait: 5_000,
        timeout: 20_000,
      }),
  });
}

async function resolveWriter() {
  const user = await getCurrentUser();
  if (!user) return null;
  return { id: user.id, roleName: user.roleName, status: user.status };
}

function createDb(tx: WriterTx) {
  return {
    candidateExists: (id: number) => candidateExists(tx, id),
    readParty: (category: WritablePartyCategory, partyId: number) => readParty(tx, category, partyId),
    lockActive: async (candidateId: number, category: WritablePartyCategory) => {
      const rows = await tx.$queryRawUnsafe<RawAssignment[]>(ACTIVE_LOCK_SQL, candidateId, category);
      const row = rows[0];
      return row ? mapAssignment(row) : null;
    },
    insertActive: (row: NewActiveAssignment) => insertActive(tx, row),
  };
}

function reassignDb(tx: WriterTx) {
  return {
    lockAssignment: async (id: number) => {
      const rows = await tx.$queryRawUnsafe<RawAssignment[]>(CLOSE_SQL.lock, id);
      const row = rows[0];
      return row ? mapAssignment(row) : null;
    },
    candidateExists: (id: number) => candidateExists(tx, id),
    readParty: (category: WritablePartyCategory, partyId: number) => readParty(tx, category, partyId),
    closeActive: async (id: number, reason: string, closedByUserId: number) => {
      const rows = await tx.$queryRawUnsafe<RawAssignment[]>(CLOSE_SQL.close, reason, closedByUserId, id);
      const row = rows[0];
      return row ? mapAssignment(row) : null;
    },
    insertActive: (row: NewActiveAssignment) => insertActive(tx, row),
  };
}

async function candidateExists(tx: WriterTx, id: number): Promise<boolean> {
  const row = await tx.candidate.findUnique({ where: { id }, select: { id: true } });
  return row !== null;
}

async function readParty(
  tx: WriterTx,
  category: WritablePartyCategory,
  partyId: number,
): Promise<PartySnapshotSource | null> {
  if (category === "agencier" || category === "companier") {
    const select = { name: true, address: true } as const;
    if (category === "agencier") return tx.agencier.findUnique({ where: { id: partyId }, select });
    return tx.companier.findUnique({ where: { id: partyId }, select });
  }
  const select = {
    name: true,
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
  } as const;
  if (category === "agent") return tx.agent.findUnique({ where: { id: partyId }, select });
  return tx.subAgent.findUnique({ where: { id: partyId }, select });
}

async function insertActive(tx: WriterTx, row: NewActiveAssignment): Promise<HistoricalAssignmentRow> {
  const rows = await tx.$queryRawUnsafe<RawAssignment[]>(INSERT_SQL, ...assignmentInsertValues(row));
  const inserted = rows[0];
  if (!inserted) throw new Error("Historical assignment insert returned no row.");
  return mapAssignment(inserted);
}

function mapAssignment(row: RawAssignment): HistoricalAssignmentRow {
  const status = row.status === "ACTIVE" || row.status === "CLOSED" ? row.status : null;
  const partyCategory = partyCategoryOf(row.partyCategory);
  if (!status || !partyCategory) throw new Error("Historical assignment row is invalid.");
  return {
    id: requiredInt(row.id, "id"),
    candidateId: requiredInt(row.candidateId, "candidateId"),
    partyCategory,
    partyId: requiredInt(row.partyId, "partyId"),
    originalName: row.originalName,
    originalAddress: row.originalAddress,
    presentAddressHouse: row.presentAddressHouse,
    presentAddressRoad: row.presentAddressRoad,
    presentAddressVillage: row.presentAddressVillage,
    presentAddressPost: row.presentAddressPost,
    presentAddressThanaId: optionalInt(row.presentAddressThanaId, "presentAddressThanaId"),
    presentAddressDistrictId: optionalInt(row.presentAddressDistrictId, "presentAddressDistrictId"),
    presentAddressDivisionId: optionalInt(row.presentAddressDivisionId, "presentAddressDivisionId"),
    permanentAddressHouse: row.permanentAddressHouse,
    permanentAddressRoad: row.permanentAddressRoad,
    permanentAddressVillage: row.permanentAddressVillage,
    permanentAddressPost: row.permanentAddressPost,
    permanentAddressThanaId: optionalInt(row.permanentAddressThanaId, "permanentAddressThanaId"),
    permanentAddressDistrictId: optionalInt(row.permanentAddressDistrictId, "permanentAddressDistrictId"),
    permanentAddressDivisionId: optionalInt(row.permanentAddressDivisionId, "permanentAddressDivisionId"),
    status,
    becameActiveAt: requiredDate(row.becameActiveAt, "becameActiveAt"),
    closureReason: row.closureReason,
    closedByUserId: optionalInt(row.closedByUserId, "closedByUserId"),
    closedAt: row.closedAt === null ? null : requiredDate(row.closedAt, "closedAt"),
  };
}

function partyCategoryOf(value: string): PartyCategory | null {
  if (value === "agent" || value === "sub_agent" || value === "agencier" || value === "companier") return value;
  return null;
}

function requiredInt(value: number | string, label: string): number {
  const id = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(id)) throw new Error(`Historical assignment ${label} is invalid.`);
  return id;
}

function optionalInt(value: number | string | null, label: string): number | null {
  if (value === null) return null;
  return requiredInt(value, label);
}

function requiredDate(value: Date | string, label: string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Historical assignment ${label} is invalid.`);
  return date;
}
