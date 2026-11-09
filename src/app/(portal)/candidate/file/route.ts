import { getCurrentUser, requestIp } from "@/server/current-user";
import { openCandidateFile } from "@/server/candidate-portal";
import { writeAudit } from "@/server/audit";

export const dynamic = "force-dynamic";

function safeName(name: string): string {
  const base = name.split(/[/\\]/).pop() || "file";
  return base.replace(/["\r\n]/g, "").slice(0, 180) || "file";
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const ref = new URL(request.url).searchParams.get("ref") ?? "";
  const file = await openCandidateFile(user, ref);
  if (!file) return new Response("Not found", { status: 404 });
  await writeAudit({
    userId: user.id,
    action: "candidate_file_open",
    entityType: "candidates",
    entityId: String(user.candidateId ?? ""),
    metadata: { ref },
    ip: await requestIp(),
  });
  const bytes = Buffer.from(file.bytes);
  return new Response(bytes, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename="${safeName(file.name)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
