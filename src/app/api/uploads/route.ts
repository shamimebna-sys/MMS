import { UploadDeniedError, assertCanSaveUpload, parseUploadRecordId } from "@/server/bread-form";
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
  const ownerField = form.get("ownerTable");
  const ownerTable = typeof ownerField === "string" ? ownerField : "";
  try {
    const recordId = parseUploadRecordId(form.get("ownerId"));
    const target = await assertCanSaveUpload(user, ownerTable, recordId);
    const bytes = Buffer.from(await file.arrayBuffer());
    const stored = await storeUpload({
      bytes,
      originalName: file.name,
      declaredType: file.type,
      ownerTable: target.slug,
      ownerId: recordId == null ? undefined : String(recordId),
      createdBy: user.id,
    });
    await writeAudit({ userId: user.id, action: "upload", entityType: "stored_files", entityId: stored.id, ip: await requestIp() });
    return Response.json({ id: stored.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return new Response(message, { status: error instanceof UploadDeniedError ? 403 : 400 });
  }
}
