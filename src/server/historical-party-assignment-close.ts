import { prisma } from "@/lib/db";
import {
  assignmentCloseSql,
  closeHistoricalAssignment,
  type CloseHistoricalAssignmentInput,
  type CloseHistoricalAssignmentResult,
  type HistoricalAssignmentRow,
  type PartyCategory,
} from "@/lib/historical-party-assignment";
import { getCurrentUser } from "@/server/current-user";

const SQL = assignmentCloseSql();

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

/**
 * Closes one historical assignment for the signed-in user.
 * The role is users.role_id → roles.name from the existing session loader.
 * A body user id or role is ignored. No route is registered here.
 * loadCurrentUser already returns null when status is present and not A,
 * so an inactive user is rejected without a new assignment status rule.
 */
export async function closeHistoricalPartyAssignment(
  input: CloseHistoricalAssignmentInput,
): Promise<CloseHistoricalAssignmentResult> {
  return closeHistoricalAssignment(input, {
    resolveUser: async () => {
      const user = await getCurrentUser();
      if (!user) return null;
      return { id: user.id, roleName: user.roleName };
    },
    transaction: (run) =>
      prisma.$transaction(
        async (tx) =>
          run({
            lock: async (id) => {
              const rows = await (tx as Queryable).$queryRawUnsafe<RawAssignment[]>(SQL.lock, id);
              const row = rows[0];
              return row ? mapAssignment(row) : null;
            },
            closeActive: async (id, reason, closedByUserId) => {
              const rows = await (tx as Queryable).$queryRawUnsafe<RawAssignment[]>(
                SQL.close,
                reason,
                closedByUserId,
                id,
              );
              const row = rows[0];
              return row ? mapAssignment(row) : null;
            },
          }),
        { isolationLevel: "ReadCommitted", maxWait: 5_000, timeout: 20_000 },
      ),
  });
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
