import { getCurrentUser, requestIp } from "@/server/current-user";
import { loadDashboard } from "@/server/dashboard";
import { pdfBuffer } from "@/server/exports";
import { displayValue } from "@/lib/utils";
import { getResource, readRecord } from "@/server/resources";
import { writeAudit } from "@/server/audit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const url = new URL(request.url);
  try {
    let title = "MMS report";
    let lines: string[] = [];
    if (url.searchParams.get("kind") === "pipeline") {
      const data = await loadDashboard(user);
      title = "Pipeline summary";
      lines = [
        `Registration: ${data.pipeline.registration}`,
        `Profile / CV file present: ${data.pipeline.profileCv}`,
        `Group assigned: ${data.pipeline.grouped}`,
        `Selection rows: ${data.pipeline.selection}`,
        `Labour contracts: ${data.pipeline.labour}`,
        `Police clearances: ${data.pipeline.police}`,
        `Medicals: ${data.pipeline.medical}`,
        `Visas: ${data.pipeline.visa}`,
        `Manpower training: ${data.pipeline.manpower}`,
        `Flights: ${data.pipeline.flight}`,
        `Exam results (not an interview flag): ${data.pipeline.exams}`,
        ...data.money.map((row) => `Payments ${row.type || "(blank)"}: ${row.total}`),
      ];
    } else {
      const resource = getResource(url.searchParams.get("resource") ?? "");
      const id = Number(url.searchParams.get("id"));
      if (!resource || !Number.isInteger(id)) return new Response("Unknown record", { status: 404 });
      const row = await readRecord(resource, user, id);
      if (!row) return new Response("Not found", { status: 404 });
      title = `${resource.title} ${id}`;
      lines = resource.columns.map((column) => `${column}: ${displayValue(row[column])}`);
    }
    const body = await pdfBuffer(title, lines);
    await writeAudit({ userId: user.id, action: "export_pdf", entityType: "reports", ip: await requestIp() });
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="mms-report.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Could not build the PDF", { status: 500 });
  }
}
