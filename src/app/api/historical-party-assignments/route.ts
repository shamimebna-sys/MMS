import { assignmentReadResponse, serializeHistoricalAssignment } from "@/server/historical-party-assignment-json";
import { listHistoricalPartyAssignments } from "@/server/historical-party-assignment-view";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await listHistoricalPartyAssignments({
    q: url.searchParams.get("q") ?? undefined,
    candidateId: url.searchParams.get("candidateId") ?? undefined,
    partyId: url.searchParams.get("partyId") ?? undefined,
    partyCategory: url.searchParams.get("partyCategory") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    closedByUserId: url.searchParams.get("closedByUserId") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
    role: url.searchParams.get("role") ?? undefined,
    actorId: url.searchParams.get("actorId") ?? undefined,
    permission: url.searchParams.get("permission") ?? undefined,
  });
  if (!result.ok) return assignmentReadResponse(result);
  return assignmentReadResponse({
    ok: true,
    body: {
      rows: result.data.rows.map(serializeHistoricalAssignment),
      page: result.data.page,
      pageSize: result.data.pageSize,
      total: result.data.total,
      hasMore: result.data.hasMore,
    },
  });
}
