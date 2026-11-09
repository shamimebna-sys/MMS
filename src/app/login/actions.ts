"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { applyLoginAttempt, LOCKOUT_MESSAGE } from "@/lib/auth/lockout";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { ABSOLUTE_MS, SESSION_COOKIE, sessionCookieOptions, signSessionToken } from "@/lib/auth/jwt";
import { loginDestination } from "@/lib/candidate-access";
import { prisma } from "@/lib/db";
import { hashToken, passwordResetTransportReady, reportPasswordResetMailUnavailable, sendPasswordResetMail } from "@/server/mail";
import {
  completePasswordReset,
  isResetEligibleStatus,
  PASSWORD_RESET_POLICY_ERROR,
  requestPasswordReset,
  resetPasswordSchema,
  toPasswordResetClientResult,
  withPasswordResetTransaction,
} from "@/server/password-reset";
import { createLoginAttemptStore } from "@/server/login-lock";
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
  const ip = await requestIp();
  const outcome = await applyLoginAttempt({
    email: parsed.data.email,
    atMs: Date.now(),
    store: createLoginAttemptStore(ip),
    verifyPassword: (passwordHash) => verifyPassword(parsed.data.password, passwordHash),
  });
  if (outcome.kind === "locked") return { error: LOCKOUT_MESSAGE };
  if (outcome.kind === "failure") return { error: "The email or password is incorrect." };
  const user = outcome.user;
  const destination = loginDestination({
    roleName: user.roleName,
    candidateId: user.candidateId,
    requested: safeNext(parsed.data.next),
  });

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
  redirect(destination.href);
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

export async function forgotPasswordAction(_state: { message?: string } | undefined, formData: FormData): Promise<{ message: string }> {
  const result = await requestPasswordReset({
    email: String(formData.get("email") ?? ""),
    transportReady: passwordResetTransportReady,
    reportUnavailable: reportPasswordResetMailUnavailable,
    findActiveUser: async (email) => {
      const user = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true, email: true, status: true },
      });
      if (!user || !isResetEligibleStatus(user.status)) return null;
      return { id: user.id, email: user.email };
    },
    saveToken: async (row) => {
      await prisma.passwordResetToken.create({ data: row });
    },
    deliver: (message) => sendPasswordResetMail(message),
    markSent: async (userId) => {
      await writeAudit({
        userId,
        action: "password_reset_requested",
        entityType: "users",
        entityId: String(userId),
        ip: await requestIp(),
      });
    },
  });
  return toPasswordResetClientResult(result);
}

export async function resetPasswordAction(
  _state: { error: string; done: boolean } | undefined,
  formData: FormData,
): Promise<{ error: string; done: boolean }> {
  const parsed = resetPasswordSchema.safeParse({ token: formData.get("token"), password: formData.get("password") });
  if (!parsed.success) return { error: PASSWORD_RESET_POLICY_ERROR, done: false };
  const result = await completePasswordReset({
    tokenHash: hashToken(parsed.data.token),
    hashPassword: () => hashPassword(parsed.data.password),
    transaction: (run) => withPasswordResetTransaction(prisma, run),
  });
  if (!result.ok) return { error: result.error, done: false };
  await writeAudit({
    userId: result.userId,
    action: "password_reset",
    entityType: "users",
    entityId: String(result.userId),
    ip: await requestIp(),
  });
  return { error: "", done: true };
}
