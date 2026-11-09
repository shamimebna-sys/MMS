"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ABSOLUTE_MS, SESSION_COOKIE, sessionCookieOptions, signSessionToken } from "@/lib/auth/jwt";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/server/audit";
import { getCurrentUser, requestIp } from "@/server/current-user";
import type { ProfileActionResult } from "@/features/profile/schema";
import { profilePayloadFromForm, runPasswordChange, runProfileUpdate } from "@/server/profile";

function refreshProfile(): void {
  revalidatePath("/profile", "layout");
}

export async function updateProfileAction(formData: FormData): Promise<ProfileActionResult> {
  const user = await getCurrentUser();
  const result = await runProfileUpdate(user?.id ?? null, formData.get("userId"), profilePayloadFromForm(formData), {
    findAccount: async (id) => {
      const row = await prisma.user.findUnique({ where: { id }, select: { email: true } });
      return row ? { email: row.email } : null;
    },
    emailTaken: async (email, id) => {
      const row = await prisma.user.findFirst({
        where: { id: { not: id }, email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      });
      return row != null;
    },
    save: async (id, data) => {
      await prisma.user.update({
        where: { id },
        data: {
          name: data.name,
          email: data.email,
          ...(data.clearEmailVerified ? { emailVerifiedAt: null } : {}),
          updatedAt: new Date(),
        },
      });
    },
  });
  if (result.ok && user) {
    await writeAudit({
      userId: user.id,
      action: "profile_update",
      entityType: "users",
      entityId: String(user.id),
      ip: await requestIp(),
    });
    refreshProfile();
  }
  return result;
}

export async function changePasswordAction(formData: FormData): Promise<ProfileActionResult> {
  const user = await getCurrentUser();
  const input: Record<string, unknown> = {
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  };
  for (const [key, value] of formData.entries()) {
    if (key === "userId" || typeof value !== "string" || key in input) continue;
    input[key] = value;
  }
  const result = await runPasswordChange(user?.id ?? null, formData.get("userId"), input, {
    findPassword: async (id) => {
      const row = await prisma.user.findUnique({ where: { id }, select: { password: true } });
      return row?.password ?? null;
    },
    commit: async (id, passwordHash) => {
      const sid = randomBytes(32).toString("hex");
      const absoluteExpiresAt = new Date(Date.now() + ABSOLUTE_MS);
      const ip = await requestIp();
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id }, data: { password: passwordHash, updatedAt: new Date() } });
        await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.session.create({
          data: {
            id: sid,
            userId: id,
            expiresAt: absoluteExpiresAt,
            absoluteExpiresAt,
            ip,
            userAgent: null,
          },
        });
      });
      const token = await signSessionToken({ sid, userId: id, absoluteExpiresAt });
      (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(absoluteExpiresAt));
    },
  });
  if (result.ok && user) {
    await writeAudit({
      userId: user.id,
      action: "password_change",
      entityType: "users",
      entityId: String(user.id),
      ip: await requestIp(),
    });
    refreshProfile();
  }
  return result;
}
