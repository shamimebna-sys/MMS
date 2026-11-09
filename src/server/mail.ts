import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";

export type PasswordResetMailResult = { ok: true } | { ok: false; reason: "smtp_not_configured" | "delivery_failed" };

type SmtpAcceptance = { accepted?: unknown; rejected?: unknown };

function smtpTransportOptions() {
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || "" } : undefined,
  };
}

function mailFrom(): string {
  return process.env.SMTP_FROM || "MMS <noreply@mms.local>";
}

export function passwordResetTransportReady(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

function redactOperationalDetail(detail: string, secretText?: string): string {
  let safe = detail;
  const secrets = [process.env.SMTP_PASSWORD, process.env.SMTP_USER, secretText];
  const token = secretText?.match(/token=([^\s&]+)/)?.[1];
  if (token) secrets.push(token, decodeURIComponent(token));
  for (const secret of secrets) {
    if (secret) safe = safe.split(secret).join("[redacted]");
  }
  return safe.slice(0, 300);
}

function logPasswordResetMailFailure(reason: "smtp_not_configured" | "delivery_failed", error?: unknown, secretText?: string): void {
  const detail = error instanceof Error ? redactOperationalDetail(error.message, secretText) : "";
  console.error(`password reset mail ${reason}${detail ? `: ${detail}` : ""}`);
}

export function reportPasswordResetMailUnavailable(): void {
  logPasswordResetMailFailure("smtp_not_configured");
}

function smtpAccepted(info: SmtpAcceptance, recipient: string): boolean {
  const rejected = Array.isArray(info.rejected) ? info.rejected : [];
  if (rejected.length > 0) return false;
  if (!Array.isArray(info.accepted)) return false;
  const target = recipient.toLowerCase();
  return info.accepted.some((entry) => String(entry).toLowerCase() === target);
}

/** Password reset mail. SMTP acceptance is the only success. A local file is not delivery. */
export async function sendPasswordResetMail(input: { to: string; subject: string; text: string }): Promise<PasswordResetMailResult> {
  if (!passwordResetTransportReady()) {
    reportPasswordResetMailUnavailable();
    return { ok: false, reason: "smtp_not_configured" };
  }
  try {
    const transport = nodemailer.createTransport(smtpTransportOptions());
    const info = await transport.sendMail({
      from: mailFrom(),
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    if (!smtpAccepted(info, input.to)) {
      logPasswordResetMailFailure("delivery_failed", new Error("SMTP did not accept the message."), input.text);
      return { ok: false, reason: "delivery_failed" };
    }
    return { ok: true };
  } catch (error) {
    logPasswordResetMailFailure("delivery_failed", error, input.text);
    return { ok: false, reason: "delivery_failed" };
  }
}

export async function sendMail(input: { to: string; subject: string; text: string }): Promise<"smtp" | "file"> {
  if (!process.env.SMTP_HOST) {
    const dir = path.resolve("data", "dev-mail");
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${randomBytes(4).toString("hex")}.txt`);
    await fs.writeFile(file, `To: ${input.to}\nSubject: ${input.subject}\n\n${input.text}\n`, { mode: 0o600 });
    return "file";
  }
  const transport = nodemailer.createTransport(smtpTransportOptions());
  await transport.sendMail({
    from: mailFrom(),
    to: input.to,
    subject: input.subject,
    text: input.text,
  });
  return "smtp";
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}
