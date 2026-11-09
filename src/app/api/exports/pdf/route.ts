import { getCurrentUser, requestIp } from "@/server/current-user";
import { loadDashboard } from "@/server/dashboard";
import { pdfBuffer } from "@/server/exports";
import { announcementClassGroupExportLines, loadAnnouncementClassGroups } from "@/server/announcement-class-groups";
import { experienceExportLines, loadExperiences } from "@/server/experiences";
import { educationExportLines, loadEducations } from "@/server/educations";
import { loadSkills, skillExportLines } from "@/server/skills";
import { loadTrainings, trainingExportLines } from "@/server/trainings";
import { languageExportLines, loadLanguageList } from "@/server/language-list";
import { loadThanas, thanaExportLines } from "@/server/thanas";
import { loadUnions, upazilaUnionExportLines } from "@/server/unions";
import { loadUpazilas } from "@/server/upazilas";
import { loadNotificationClassGroups, notificationClassGroupExportLines } from "@/server/notification-class-groups";
import { invoiceCandidateExportLines, loadInvoiceCandidates } from "@/server/invoice-candidates";
import { licensePositionExportLines, loadLicensePositions } from "@/server/license-positions";
import { invoiceLineExportLines, loadInvoiceLines } from "@/server/invoice-lines";
import { loadTicketInvoiceLines, ticketInvoiceLineExportLines } from "@/server/ticket-invoice-lines";
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
      if (resource.table === "invoices") {
        lines = [...lines, ...invoiceLineExportLines(await loadInvoiceLines(id))];
        lines = [...lines, ...invoiceCandidateExportLines(await loadInvoiceCandidates(id))];
      }
      if (resource.table === "licenses") {
        lines = [...lines, ...licensePositionExportLines(await loadLicensePositions(id))];
      }
      if (resource.table === "announcements") {
        lines = [...lines, ...announcementClassGroupExportLines(await loadAnnouncementClassGroups(id))];
      }
      if (resource.table === "notifications") {
        lines = [...lines, ...notificationClassGroupExportLines(await loadNotificationClassGroups(id))];
      }
      if (resource.table === "users") {
        lines = [...lines, ...experienceExportLines(await loadExperiences(id))];
        lines = [...lines, ...educationExportLines(await loadEducations(id))];
        lines = [...lines, ...skillExportLines(await loadSkills(id))];
        lines = [...lines, ...trainingExportLines(await loadTrainings(id))];
        lines = [...lines, ...languageExportLines(await loadLanguageList(id))];
      }
      if (resource.table === "districts") {
        lines = [...lines, ...thanaExportLines(await loadThanas(id))];
        const upazilas = await loadUpazilas(id);
        lines = [...lines, ...upazilaUnionExportLines(upazilas, await loadUnions(upazilas.map((row) => row.id)))];
      }
      if (resource.table === "ticket_invoices") {
        lines = [...lines, ...ticketInvoiceLineExportLines(await loadTicketInvoiceLines(id))];
      }
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
