import fs from "node:fs/promises";
import { getCurrentUser } from "@/server/current-user";
import { resolveStoredFile } from "@/server/uploads";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await context.params;
  const file = await resolveStoredFile(id);
  if (!file) return new Response("Not found", { status: 404 });
  const bytes = await fs.readFile(file.absolute);
  return new Response(bytes, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${file.originalName.replace(/["\r\n]/g, "")}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
