import { assignmentReadResponse, serializeHistoricalAssignment } from "@/server/historical-party-assignment-json";
import { getHistoricalPartyAssignment } from "@/server/historical-party-assignment-view";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const result = await getHistoricalPartyAssignment({
    assignmentId: id,
    role: url.searchParams.get("role") ?? undefined,
    actorId: url.searchParams.get("actorId") ?? undefined,
    permission: url.searchParams.get("permission") ?? undefined,
  });
  if (!result.ok) return assignmentReadResponse(result);
  if (!result.data) {
    return Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return assignmentReadResponse({ ok: true, body: { assignment: serializeHistoricalAssignment(result.data) } });
}
