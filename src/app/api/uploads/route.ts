import { getCurrentUser, requestIp } from "@/server/current-user";
import { storeUpload } from "@/server/uploads";
import { writeAudit } from "@/server/audit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return new Response("Choose a file.", { status: 400 });
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const stored = await storeUpload({
      bytes,
      originalName: file.name,
      ownerTable: typeof form.get("ownerTable") === "string" ? String(form.get("ownerTable")) : undefined,
      ownerId: typeof form.get("ownerId") === "string" ? String(form.get("ownerId")) : undefined,
      createdBy: user.id,
    });
    await writeAudit({ userId: user.id, action: "upload", entityType: "stored_files", entityId: stored.id, ip: await requestIp() });
    return Response.json({ id: stored.id });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Upload failed", { status: 400 });
  }
}
