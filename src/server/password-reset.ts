import type { PrismaClient } from "@/generated/prisma/client";
import { z } from "zod";
import { hashToken, newToken, type PasswordResetMailResult } from "@/server/mail";

export const PASSWORD_RESET_ACK = "If that account exists, a reset message has been sent.";
export const PASSWORD_RESET_FAILED = "We could not send a reset message right now. Try again later.";
export const PASSWORD_RESET_POLICY_ERROR = "Use at least 12 characters.";
export const RESET_LINK_INVALID = "This reset link is invalid or expired.";
const RESET_TTL_MS = 30 * 60 * 1000;

const emailSchema = z.string().trim().email().max(255);

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(12).max(200),
});

export type PasswordResetRequestResult = {
  message: string;
  delivered: boolean;
};

export function isResetEligibleStatus(status: string | null | undefined): boolean {
  if (!status) return true;
  return status.trim() === "A";
}

/** The browser only receives the public sentence. Delivery state stays on the server. */
export function toPasswordResetClientResult(result: PasswordResetRequestResult): { message: string } {
  return { message: result.message };
}

type ActiveResetUser = { id: number; email: string };

/**
 * Asks for a password reset.
 * An unknown address and a delivered reset share the same public sentence.
 * When SMTP is not configured, every address gets the same failure sentence and nothing is marked sent.
 * A transport rejection is not marked sent. Its public sentence matches an unknown address.
 */
export async function requestPasswordReset(input: {
  email: string;
  now?: number;
  appUrl?: string;
  token?: string;
  transportReady: () => boolean;
  reportUnavailable: () => void;
  findActiveUser: (email: string) => Promise<ActiveResetUser | null>;
  saveToken: (row: { userId: number; tokenHash: string; expiresAt: Date }) => Promise<void>;
  deliver: (message: { to: string; subject: string; text: string }) => Promise<PasswordResetMailResult>;
  markSent: (userId: number) => Promise<void>;
}): Promise<PasswordResetRequestResult> {
  const parsed = emailSchema.safeParse(input.email);
  if (!parsed.success) return { message: PASSWORD_RESET_ACK, delivered: false };
  if (!input.transportReady()) {
    input.reportUnavailable();
    return { message: PASSWORD_RESET_FAILED, delivered: false };
  }

  const user = await input.findActiveUser(parsed.data);
  if (!user) return { message: PASSWORD_RESET_ACK, delivered: false };

  const now = input.now ?? Date.now();
  const token = input.token ?? newToken();
  const appUrl = input.appUrl ?? process.env.APP_URL ?? "http://127.0.0.1:3000";
  await input.saveToken({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(now + RESET_TTL_MS),
  });
  const link = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  let delivery: PasswordResetMailResult;
  try {
    delivery = await input.deliver({
      to: user.email,
      subject: "Reset your MMS password",
      text: `Use this link within 30 minutes to choose a new password:\n${link}\n`,
    });
  } catch {
    console.error("password reset mail delivery_failed");
    return { message: PASSWORD_RESET_ACK, delivered: false };
  }
  if (!delivery.ok) return { message: PASSWORD_RESET_ACK, delivered: false };
  await input.markSent(user.id);
  return { message: PASSWORD_RESET_ACK, delivered: true };
}

export type LockedResetToken = { id: bigint; userId: number };

export type PasswordResetTx = {
  /** Locks one unused, unexpired token row until this transaction ends. */
  lockValidToken(tokenHash: string, now: Date): Promise<LockedResetToken | null>;
  updatePassword(userId: number, passwordHash: string, now: Date): Promise<void>;
  consumeToken(id: bigint, now: Date): Promise<void>;
  revokeSessions(userId: number, now: Date): Promise<void>;
};

export type PasswordResetCompletion =
  | { ok: true; userId: number }
  | { ok: false; error: string };

/** The token row was claimed by another committed reset. The surrounding transaction must roll back. */
export class ResetTokenUnavailable extends Error {
  constructor() {
    super("Reset token is no longer available.");
    this.name = "ResetTokenUnavailable";
  }
}

type RawResetRow = { id: bigint | number | string; userId: bigint | number | string };

/**
 * Read Committed plus a row lock. A waiting reset re-reads the token after that lock is released.
 * Password hashing runs before this transaction opens, so the timeout is only a database safety limit.
 */
export const PASSWORD_RESET_TRANSACTION = {
  isolationLevel: "ReadCommitted" as const,
  maxWait: 5_000,
  timeout: 20_000,
};

/**
 * Locks the matching reset-token row. Only that row is locked, and only while it is unused and unexpired.
 * The raw token is never sent; callers pass its hash.
 */
export async function lockValidResetToken(
  queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<readonly RawResetRow[]>,
  tokenHash: string,
  now: Date,
): Promise<LockedResetToken | null> {
  const rows = await queryRaw`
    SELECT id, user_id AS "userId"
    FROM password_reset_tokens
    WHERE token_hash = ${tokenHash}
      AND used_at IS NULL
      AND expires_at > ${now}
    ORDER BY id
    LIMIT 1
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) return null;
  return { id: toTokenId(row.id), userId: toUserId(row.userId) };
}

/** Conditional consume of the locked row. A count other than one rolls the password change back. */
export async function consumeResetToken(
  updateMany: (args: { where: { id: bigint; usedAt: null }; data: { usedAt: Date } }) => Promise<{ count: number }>,
  id: bigint,
  now: Date,
): Promise<void> {
  const consumed = await updateMany({ where: { id, usedAt: null }, data: { usedAt: now } });
  if (consumed.count !== 1) throw new ResetTokenUnavailable();
}

/**
 * Hashes the new password before opening a transaction, then locks the token and checks it again.
 * A missing, expired, or already-used token changes nothing.
 * Password update, token consumption, and session revocation commit or roll back together.
 */
export async function completePasswordReset(input: {
  tokenHash: string;
  now?: Date;
  hashPassword: () => Promise<string>;
  transaction: <T>(run: (tx: PasswordResetTx) => Promise<T>) => Promise<T>;
}): Promise<PasswordResetCompletion> {
  const passwordHash = await input.hashPassword();
  const now = input.now ?? new Date();
  try {
    return await input.transaction(async (tx) => {
      const row = await tx.lockValidToken(input.tokenHash, now);
      if (!row) return { ok: false, error: RESET_LINK_INVALID };
      await tx.updatePassword(row.userId, passwordHash, now);
      await tx.consumeToken(row.id, now);
      await tx.revokeSessions(row.userId, now);
      return { ok: true, userId: row.userId };
    });
  } catch (error) {
    if (error instanceof ResetTokenUnavailable) return { ok: false, error: RESET_LINK_INVALID };
    throw error;
  }
}

/** One PostgreSQL transaction: lock the token, then update the password, consume it, and revoke sessions. */
export async function withPasswordResetTransaction<T>(
  db: PrismaClient,
  run: (tx: PasswordResetTx) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    return run({
      lockValidToken: (tokenHash, now) =>
        lockValidResetToken(
          (query, ...values) => tx.$queryRaw<RawResetRow[]>(query, ...values),
          tokenHash,
          now,
        ),
      updatePassword: async (userId, passwordHash, now) => {
        await tx.user.update({ where: { id: userId }, data: { password: passwordHash, updatedAt: now } });
      },
      consumeToken: (id, now) => consumeResetToken((args) => tx.passwordResetToken.updateMany(args), id, now),
      revokeSessions: async (userId, now) => {
        await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
      },
    });
  }, PASSWORD_RESET_TRANSACTION);
}

function toTokenId(value: bigint | number | string): bigint {
  if (typeof value === "bigint" && value > BigInt(0)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return BigInt(value);
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return BigInt(value);
  throw new Error("Password reset token id is invalid.");
}

function toUserId(value: bigint | number | string): number {
  const id = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Password reset user id is invalid.");
  return id;
}
