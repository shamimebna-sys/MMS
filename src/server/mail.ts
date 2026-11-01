import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";

export async function sendMail(input: { to: string; subject: string; text: string }): Promise<"smtp" | "file"> {
  if (!process.env.SMTP_HOST) {
    const dir = path.resolve("data", "dev-mail");
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${randomBytes(4).toString("hex")}.txt`);
    await fs.writeFile(file, `To: ${input.to}\nSubject: ${input.subject}\n\n${input.text}\n`, { mode: 0o600 });
    return "file";
  }
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || "" }
      : undefined,
  });
  await transport.sendMail({
    from: process.env.SMTP_FROM || "MMS <noreply@mms.local>",
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
