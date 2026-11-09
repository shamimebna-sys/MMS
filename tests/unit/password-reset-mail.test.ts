import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashToken, sendMail, sendPasswordResetMail } from "@/server/mail";
import {
  isResetEligibleStatus,
  PASSWORD_RESET_ACK,
  PASSWORD_RESET_FAILED,
  requestPasswordReset,
  toPasswordResetClientResult,
  type PasswordResetRequestResult,
} from "@/server/password-reset";
import type { PasswordResetMailResult } from "@/server/mail";

const transport = vi.hoisted(() => {
  const sendMail = vi.fn();
  const createTransport = vi.fn(() => ({ sendMail }));
  return { sendMail, createTransport };
});

const files = vi.hoisted(() => ({
  mkdir: vi.fn(async () => undefined),
  writeFile: vi.fn(async () => undefined),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: transport.createTransport },
}));

vi.mock("node:fs/promises", () => ({
  default: { mkdir: files.mkdir, writeFile: files.writeFile },
}));

const envKeys = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]])) as Record<(typeof envKeys)[number], string | undefined>;
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

function restoreEnv(): void {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function loggedText(): string {
  return errorSpy.mock.calls.map((call) => call.map(String).join(" ")).join("\n");
}

afterAll(() => {
  errorSpy.mockRestore();
  restoreEnv();
});

beforeEach(() => {
  transport.sendMail.mockReset();
  transport.createTransport.mockClear();
  files.mkdir.mockClear();
  files.writeFile.mockClear();
  errorSpy.mockClear();
  restoreEnv();
});

afterEach(() => {
  restoreEnv();
});

describe("password reset SMTP delivery", () => {
  const password = "super-secret-password";
  const token = "reset-token-0123456789abcdef";
  const text = `Use this link within 30 minutes to choose a new password:\nhttps://mms.example/reset-password?token=${token}\n`;

  function configureSmtp(): void {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "2525";
    process.env.SMTP_SECURE = "true";
    process.env.SMTP_USER = "smtp-user-secret";
    process.env.SMTP_PASSWORD = password;
    process.env.SMTP_FROM = "MMS <reset@example.com>";
  }

  it("accepts a reset message only after the configured SMTP transport accepts it", async () => {
    configureSmtp();
    transport.sendMail.mockResolvedValue({ accepted: ["User@Example.com"], rejected: [] });
    const result = await sendPasswordResetMail({
      to: "user@example.com",
      subject: "Reset your MMS password",
      text,
    });
    expect(result).toEqual({ ok: true });
    expect(transport.createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 2525,
      secure: true,
      auth: { user: "smtp-user-secret", pass: password },
    });
    expect(transport.sendMail).toHaveBeenCalledWith({
      from: "MMS <reset@example.com>",
      to: "user@example.com",
      subject: "Reset your MMS password",
      text,
    });
    expect(files.writeFile).not.toHaveBeenCalled();
    expect(files.mkdir).not.toHaveBeenCalled();
    expect(loggedText()).toBe("");
  });

  it("returns a safe failure when SMTP is missing or the transport rejects the message", async () => {
    process.env.SMTP_PASSWORD = password;
    delete process.env.SMTP_HOST;
    const missing = await sendPasswordResetMail({ to: "user@example.com", subject: "Reset your MMS password", text });
    expect(missing).toEqual({ ok: false, reason: "smtp_not_configured" });
    expect(transport.createTransport).not.toHaveBeenCalled();
    expect(files.writeFile).not.toHaveBeenCalled();
    expect(loggedText()).toContain("smtp_not_configured");
    expect(loggedText()).not.toContain(password);
    expect(loggedText()).not.toContain(token);

    errorSpy.mockClear();
    configureSmtp();
    transport.sendMail.mockRejectedValue(new Error(`535 ${password} ${text}`));
    const failed = await sendPasswordResetMail({ to: "user@example.com", subject: "Reset your MMS password", text });
    expect(failed).toEqual({ ok: false, reason: "delivery_failed" });
    expect(files.writeFile).not.toHaveBeenCalled();
    expect(loggedText()).toContain("delivery_failed");
    expect(loggedText()).toContain("[redacted]");
    expect(loggedText()).not.toContain(password);
    expect(loggedText()).not.toContain("smtp-user-secret");
    expect(loggedText()).not.toContain(token);
    expect(loggedText()).not.toContain("user@example.com");

    errorSpy.mockClear();
    transport.sendMail.mockResolvedValue({ accepted: [], rejected: ["user@example.com"] });
    const rejected = await sendPasswordResetMail({ to: "user@example.com", subject: "Reset your MMS password", text });
    expect(rejected).toEqual({ ok: false, reason: "delivery_failed" });
    expect(files.writeFile).not.toHaveBeenCalled();
  });

  it("keeps the local file fallback for other outbound mail", async () => {
    delete process.env.SMTP_HOST;
    const delivered = await sendMail({ to: "info@eujobbd.com", subject: "Website newsletter", text: "hello" });
    expect(delivered).toBe("file");
    expect(files.writeFile).toHaveBeenCalledTimes(1);
    expect(transport.createTransport).not.toHaveBeenCalled();
  });
});

describe("password reset response", () => {
  const now = Date.parse("2026-11-05T12:00:00.000Z");
  const token = "fixed-reset-token-0123456789abcdef";

  function harness(options: { user: { id: number; email: string } | null; ready?: boolean; deliver?: () => Promise<PasswordResetMailResult> }) {
    const saved: Array<{ userId: number; tokenHash: string; expiresAt: Date }> = [];
    const sent: Array<{ to: string; subject: string; text: string }> = [];
    const audits: number[] = [];
    let lookups = 0;
    let unavailable = 0;
    return {
      saved,
      sent,
      audits,
      lookups: () => lookups,
      unavailable: () => unavailable,
      run: (email: string) =>
        requestPasswordReset({
          email,
          now,
          appUrl: "https://mms.example",
          token,
          transportReady: () => options.ready ?? true,
          reportUnavailable: () => {
            unavailable += 1;
          },
          findActiveUser: async () => {
            lookups += 1;
            return options.user;
          },
          saveToken: async (row) => {
            saved.push(row);
          },
          deliver: async (message) => {
            sent.push(message);
            if (options.deliver) return options.deliver();
            return { ok: true };
          },
          markSent: async (userId) => {
            audits.push(userId);
          },
        }),
    };
  }

  function client(result: PasswordResetRequestResult): { message: string } {
    return toPasswordResetClientResult(result);
  }

  it("sends the reset link when SMTP accepts it and keeps the same public response for an unknown address", async () => {
    const present = harness({ user: { id: 7, email: "user@example.com" } });
    const absent = harness({ user: null });
    const sent = await present.run("User@Example.com");
    const missing = await absent.run("nobody@example.com");
    expect(sent).toEqual({ message: PASSWORD_RESET_ACK, delivered: true });
    expect(client(sent)).toEqual(client(missing));
    expect(client(sent)).toEqual({ message: PASSWORD_RESET_ACK });
    expect(JSON.stringify(client(sent))).not.toContain("user@example.com");
    expect(JSON.stringify(client(missing))).not.toContain("nobody@example.com");
    expect(Object.keys(client(sent))).toEqual(["message"]);
    expect(present.audits).toEqual([7]);
    expect(absent.audits).toEqual([]);
    expect(absent.saved).toEqual([]);
    expect(present.saved).toEqual([
      { userId: 7, tokenHash: hashToken(token), expiresAt: new Date(now + 30 * 60 * 1000) },
    ]);
    expect(present.sent).toEqual([
      {
        to: "user@example.com",
        subject: "Reset your MMS password",
        text: `Use this link within 30 minutes to choose a new password:\nhttps://mms.example/reset-password?token=${encodeURIComponent(token)}\n`,
      },
    ]);
  });

  it("does not reveal whether an address exists when SMTP is down, delivery fails, or the address is invalid", async () => {
    const presentDown = harness({ user: { id: 7, email: "user@example.com" }, ready: false });
    const absentDown = harness({ user: null, ready: false });
    const knownDown = await presentDown.run("user@example.com");
    const unknownDown = await absentDown.run("nobody@example.com");
    expect(knownDown).toEqual({ message: PASSWORD_RESET_FAILED, delivered: false });
    expect(unknownDown).toEqual(knownDown);
    expect(presentDown.lookups()).toBe(0);
    expect(absentDown.lookups()).toBe(0);
    expect(presentDown.saved).toHaveLength(0);
    expect(presentDown.audits).toHaveLength(0);
    expect(presentDown.sent).toHaveLength(0);
    expect(presentDown.unavailable()).toBe(1);
    expect(JSON.stringify(client(knownDown))).not.toContain("user@example.com");
    expect(JSON.stringify(client(knownDown))).not.toMatch(/not found|does not exist|registered|no account/i);

    const presentFailed = harness({
      user: { id: 7, email: "user@example.com" },
      deliver: async () => ({ ok: false, reason: "delivery_failed" }),
    });
    const absent = harness({ user: null });
    const failed = await presentFailed.run("user@example.com");
    const missing = await absent.run("nobody@example.com");
    expect(failed.delivered).toBe(false);
    expect(client(failed)).toEqual(client(missing));
    expect(presentFailed.audits).toHaveLength(0);
    expect(presentFailed.saved).toHaveLength(1);
    expect(JSON.stringify(client(failed))).not.toContain(token);
    expect(JSON.stringify(client(failed))).not.toContain("user@example.com");

    const thrown = harness({
      user: { id: 7, email: "user@example.com" },
      deliver: async () => {
        throw new Error(`535 ${token}`);
      },
    });
    const threw = await thrown.run("user@example.com");
    expect(threw.delivered).toBe(false);
    expect(client(threw)).toEqual(client(missing));
    expect(thrown.audits).toHaveLength(0);
    expect(loggedText()).not.toContain(token);

    const invalid = harness({ user: { id: 7, email: "user@example.com" }, ready: false });
    const bad = await invalid.run("not-an-email");
    expect(bad).toEqual({ message: PASSWORD_RESET_ACK, delivered: false });
    expect(invalid.lookups()).toBe(0);
    expect(invalid.unavailable()).toBe(0);
  });

  it("keeps inactive accounts on the same public response as an unknown address", () => {
    expect(isResetEligibleStatus(null)).toBe(true);
    expect(isResetEligibleStatus("")).toBe(true);
    expect(isResetEligibleStatus("A")).toBe(true);
    expect(isResetEligibleStatus(" A ")).toBe(true);
    expect(isResetEligibleStatus("  ")).toBe(false);
    expect(isResetEligibleStatus("I")).toBe(false);
  });
});
