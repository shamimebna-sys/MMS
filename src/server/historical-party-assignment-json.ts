import type { HistoricalAssignmentRow } from "@/lib/historical-party-assignment";

export function serializeHistoricalAssignment(row: HistoricalAssignmentRow) {
  return {
    id: row.id,
    candidateId: row.candidateId,
    partyCategory: row.partyCategory,
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
    status: row.status,
    becameActiveAt: row.becameActiveAt.toISOString(),
    closureReason: row.closureReason,
    closedByUserId: row.closedByUserId,
    closedAt: row.closedAt === null ? null : row.closedAt.toISOString(),
  };
}

export function assignmentReadResponse(result: { ok: false; code: "unauthenticated" | "forbidden" } | { ok: true; body: unknown }): Response {
  if (!result.ok) {
    return Response.json(
      { error: result.code },
      { status: result.code === "unauthenticated" ? 401 : 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(result.body, { headers: { "Cache-Control": "no-store" } });
}
