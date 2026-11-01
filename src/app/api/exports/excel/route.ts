import { getCurrentUser, requestIp } from "@/server/current-user";
import { workbookBuffer } from "@/server/exports";
import { exportRecords, getResource } from "@/server/resources";
import { writeAudit } from "@/server/audit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const url = new URL(request.url);
  const resource = getResource(url.searchParams.get("resource") ?? "");
  if (!resource) return new Response("Unknown module", { status: 404 });
  try {
    const rows = await exportRecords(resource, user, url.searchParams.get("q") ?? "");
    await writeAudit({
      userId: user.id,
      action: "export_excel",
      entityType: resource.table,
      metadata: { rows: rows.length },
      ip: await requestIp(),
    });
    const body = workbookBuffer(resource, rows);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${resource.slug}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
}
