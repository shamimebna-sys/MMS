import { beforeEach, describe, expect, it, vi } from "vitest";
import { PASSWORD_RESET_POLICY_ERROR, PASSWORD_RESET_TRANSACTION, RESET_LINK_INVALID } from "@/server/password-reset";

const db = vi.hoisted(() => ({
  order: [] as string[],
  passwordSeen: "",
  writtenHash: "",
  options: undefined as unknown,
  tokenRow: null as { id: bigint; userId: number } | null,
  audits: [] as Array<{ data: Record<string, unknown> }>,
}));

vi.mock("@/lib/db", () => ({
  pool: { connect: vi.fn() },
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>, options: unknown) => {
      db.order.push("transaction");
      db.options = options;
      return fn({
        $queryRaw: async () => (db.tokenRow ? [db.tokenRow] : []),
        user: {
          update: async (args: { data: { password: string } }) => {
            db.order.push("password");
            db.writtenHash = args.data.password;
          },
        },
        passwordResetToken: {
          updateMany: async () => ({ count: db.tokenRow ? 1 : 0 }),
        },
        session: {
          updateMany: async () => {
            db.order.push("sessions");
          },
        },
      });
    },
    auditLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        db.order.push("audit");
        db.audits.push(args);
      },
    },
  },
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: async (password: string) => {
    db.order.push("hash");
    db.passwordSeen = password;
    return "precomputed-hash";
  },
  verifyPassword: async () => false,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }),
  headers: async () => ({ get: () => null }),
}));

vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  },
}));

vi.mock("@/server/current-user", () => ({
  requestIp: async () => "203.0.113.9",
  getCurrentUser: async () => null,
}));

import { resetPasswordAction } from "@/app/login/actions";

function form(token: string, password: string): FormData {
  const data = new FormData();
  data.set("token", token);
  data.set("password", password);
  return data;
}

describe("password reset action responses", () => {
  beforeEach(() => {
    db.order = [];
    db.passwordSeen = "";
    db.writtenHash = "";
    db.options = undefined;
    db.tokenRow = null;
    db.audits = [];
  });

  it("keeps the password policy error and does not hash or open a transaction", async () => {
    const shortPassword = await resetPasswordAction(undefined, form("t".repeat(20), "p".repeat(11)));
    const longPassword = await resetPasswordAction(undefined, form("t".repeat(20), "p".repeat(201)));
    const shortToken = await resetPasswordAction(undefined, form("t".repeat(19), "p".repeat(12)));
    expect(shortPassword).toEqual({ error: PASSWORD_RESET_POLICY_ERROR, done: false });
    expect(longPassword).toEqual(shortPassword);
    expect(shortToken).toEqual(shortPassword);
    expect(PASSWORD_RESET_POLICY_ERROR).toBe("Use at least 12 characters.");
    expect(db.order).toEqual([]);
    expect(db.audits).toEqual([]);
  });

  it("hashes before the transaction and leaves an invalid token unchanged", async () => {
    const password = "p".repeat(12);
    const result = await resetPasswordAction(undefined, form("t".repeat(20), password));
    expect(result).toEqual({ error: RESET_LINK_INVALID, done: false });
    expect(db.passwordSeen).toBe(password);
    expect(db.order).toEqual(["hash", "transaction"]);
    expect(db.writtenHash).toBe("");
    expect(db.options).toEqual(PASSWORD_RESET_TRANSACTION);
    expect(db.audits).toEqual([]);
  });

  it("stores the precomputed hash and writes the existing reset audit after commit", async () => {
    db.tokenRow = { id: BigInt(9), userId: 4 };
    const password = "p".repeat(12);
    const result = await resetPasswordAction(undefined, form("t".repeat(24), password));
    expect(result).toEqual({ error: "", done: true });
    expect(db.passwordSeen).toBe(password);
    expect(db.writtenHash).toBe("precomputed-hash");
    expect(db.order).toEqual(["hash", "transaction", "password", "sessions", "audit"]);
    expect(db.options).toEqual(PASSWORD_RESET_TRANSACTION);
    expect(PASSWORD_RESET_TRANSACTION).toEqual({ isolationLevel: "ReadCommitted", maxWait: 5_000, timeout: 20_000 });
    expect(db.audits).toEqual([
      {
        data: expect.objectContaining({
          userId: 4,
          action: "password_reset",
          entityType: "users",
          entityId: "4",
          ip: "203.0.113.9",
        }),
      },
    ]);
  });
});
