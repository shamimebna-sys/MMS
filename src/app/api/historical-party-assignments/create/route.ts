import { serializeHistoricalAssignment } from "@/server/historical-party-assignment-json";
import { createHistoricalPartyAssignment } from "@/server/historical-party-assignment-write";
import type { AssignmentWriteResult } from "@/lib/historical-party-assignment-write";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readBody(request);
  if (body === null) return json({ error: "invalid_body" }, 400);
  const result = await createHistoricalPartyAssignment({
    candidateId: body.candidateId,
    partyCategory: body.partyCategory,
    partyId: body.partyId,
    actorId: body.actorId,
    role: body.role,
    status: body.status,
    originalName: body.originalName,
    presentAddress: body.presentAddress,
    permanentAddress: body.permanentAddress,
    becameActiveAt: body.becameActiveAt,
    assignmentStatus: body.assignmentStatus,
    permission: body.permission,
  });
  return writeResponse(result);
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

function writeResponse(result: AssignmentWriteResult): Response {
  if (!result.ok) return json({ error: result.code }, statusFor(result.code));
  return json(
    {
      assignment: serializeHistoricalAssignment(result.assignment),
      closed: result.closed ? serializeHistoricalAssignment(result.closed) : null,
    },
    201,
  );
}

function statusFor(code: string): number {
  if (code === "unauthenticated") return 401;
  if (code === "forbidden") return 403;
  if (code === "not_found") return 404;
  if (code === "conflict") return 409;
  return 422;
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
