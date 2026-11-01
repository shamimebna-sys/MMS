"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isAccountLocked, LOCKOUT_MESSAGE, lockoutWindowStart } from "@/lib/auth/lockout";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { ABSOLUTE_MS, SESSION_COOKIE, sessionCookieOptions, signSessionToken } from "@/lib/auth/jwt";
import { prisma } from "@/lib/db";
import { hashToken, newToken, sendMail } from "@/server/mail";
import { writeAudit } from "@/server/audit";
import { getCurrentUser, requestIp } from "@/server/current-user";

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export async function loginAction(_state: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });
  if (!parsed.success) return { error: "Enter the email and password." };
  const email = parsed.data.email.toLowerCase();
  const ip = await requestIp();
  const since = lockoutWindowStart();
  const failures = await prisma.loginAttempt.count({
    where: { email, success: false, createdAt: { gt: since } },
  });
  if (isAccountLocked(failures)) return { error: LOCKOUT_MESSAGE };

  const user = await prisma.user.findFirst({
    where: { email: { equals: parsed.data.email, mode: "insensitive" } },
    include: { roleIdRef: true },
  });
  const status = user?.status?.trim() || null;
  const valid = user ? await verifyPassword(parsed.data.password, user.password) : false;
  if (!user || !valid || (status && status !== "A")) {
    await prisma.loginAttempt.create({ data: { email, ip, success: false } });
    return { error: "The email or password is incorrect." };
  }
  await prisma.loginAttempt.deleteMany({ where: { email, success: false } });
  await prisma.loginAttempt.create({ data: { email, ip, success: true } });

  const sid = randomBytes(32).toString("hex");
  const absoluteExpiresAt = new Date(Date.now() + ABSOLUTE_MS);
  await prisma.session.create({
    data: {
      id: sid,
      userId: user.id,
      expiresAt: absoluteExpiresAt,
      absoluteExpiresAt,
      ip,
      userAgent: null,
    },
  });
  const token = await signSessionToken({ sid, userId: user.id, absoluteExpiresAt });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(absoluteExpiresAt));
  await writeAudit({ userId: user.id, action: "login", entityType: "sessions", entityId: sid, ip });
  redirect(safeNext(parsed.data.next));
}

export async function logoutAction(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await getCurrentUser();
  if (token) {
    const { verifySessionToken } = await import("@/lib/auth/jwt");
    const claims = await verifySessionToken(token);
    if (claims) {
      await prisma.session.updateMany({
        where: { id: claims.sid, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }
  (await cookies()).delete(SESSION_COOKIE);
  if (user) await writeAudit({ userId: user.id, action: "logout", entityType: "sessions", ip: await requestIp() });
  redirect("/login");
}

const forgotSchema = z.object({ email: z.string().trim().email().max(255) });

export async function forgotPasswordAction(_state: { message?: string } | undefined, formData: FormData): Promise<{ message: string }> {
  const parsed = forgotSchema.safeParse({ email: formData.get("email") });
  const message = "If that account exists, a reset message has been sent.";
  if (!parsed.success) return { message };
  const user = await prisma.user.findFirst({
    where: { email: { equals: parsed.data.email, mode: "insensitive" } },
    select: { id: true, email: true, status: true },
  });
  if (!user || (user.status && user.status.trim() !== "A")) return { message };
  const token = newToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });
  const link = `${process.env.APP_URL || "http://127.0.0.1:3000"}/reset-password?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: user.email,
    subject: "Reset your MMS password",
    text: `Use this link within 30 minutes to choose a new password:\n${link}\n`,
  });
  await writeAudit({ userId: user.id, action: "password_reset_requested", entityType: "users", entityId: String(user.id), ip: await requestIp() });
  return { message };
}

const resetSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(12).max(200),
});

export async function resetPasswordAction(
  _state: { error: string; done: boolean } | undefined,
  formData: FormData,
): Promise<{ error: string; done: boolean }> {
  const parsed = resetSchema.safeParse({ token: formData.get("token"), password: formData.get("password") });
  if (!parsed.success) return { error: "Use at least 12 characters.", done: false };
  const row = await prisma.passwordResetToken.findFirst({
    where: { tokenHash: hashToken(parsed.data.token), usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!row) return { error: "This reset link is invalid or expired.", done: false };
  await prisma.user.update({ where: { id: row.userId }, data: { password: await hashPassword(parsed.data.password), updatedAt: new Date() } });
  await prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  await prisma.session.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await writeAudit({ userId: row.userId, action: "password_reset", entityType: "users", entityId: String(row.userId), ip: await requestIp() });
  return { error: "", done: true };
}
