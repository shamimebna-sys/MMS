import { revalidatePath } from "next/cache";
import { authorizeOwnAccount } from "@/features/profile/schema";
import { PROFILE_IMAGE_MAX_BYTES } from "@/server/profile-image";
import { removeProfilePhoto, saveProfilePhoto } from "@/server/profile";
import { writeAudit } from "@/server/audit";
import { getCurrentUser, requestIp } from "@/server/current-user";
import { prisma } from "@/lib/db";
import { deleteStoredFile, storePreparedProfileImage } from "@/server/uploads";

export const dynamic = "force-dynamic";

function photoDeps(userId: number) {
  return {
    storeImage: (prepared: Parameters<typeof storePreparedProfileImage>[0]["prepared"]) =>
      storePreparedProfileImage({ prepared, createdBy: userId, ownerId: String(userId) }),
    readAvatar: async () => {
      const row = await prisma.user.findUnique({ where: { id: userId }, select: { avatar: true } });
      return row?.avatar ?? null;
    },
    writeAvatar: async (avatar: string | null) => {
      await prisma.user.update({ where: { id: userId }, data: { avatar, updatedAt: new Date() } });
    },
    removeStoredFile: deleteStoredFile,
  };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const form = await request.formData();
  const auth = authorizeOwnAccount(user?.id ?? null, form.get("userId"));
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: user ? 403 : 401 });
  }

  if (form.get("remove") === "1") {
    const result = await removeProfilePhoto(photoDeps(auth.userId));
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    await writeAudit({
      userId: auth.userId,
      action: "profile_photo_remove",
      entityType: "users",
      entityId: String(auth.userId),
      ip: await requestIp(),
    });
    revalidatePath("/profile", "layout");
    return Response.json({ message: result.message, avatar: "" });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose an image." }, { status: 400 });
  if (file.size > PROFILE_IMAGE_MAX_BYTES) {
    return Response.json({ error: "Image must be between 1 byte and 5 MB." }, { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await saveProfilePhoto(photoDeps(auth.userId), bytes);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  await writeAudit({
    userId: auth.userId,
    action: "profile_photo_update",
    entityType: "users",
    entityId: String(auth.userId),
    ip: await requestIp(),
  });
  revalidatePath("/profile", "layout");
  return Response.json({ message: result.message, avatar: result.avatar ?? "" });
}
