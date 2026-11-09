import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  completePasswordReset,
  consumeResetToken,
  lockValidResetToken,
  PASSWORD_RESET_POLICY_ERROR,
  PASSWORD_RESET_TRANSACTION,
  RESET_LINK_INVALID,
  ResetTokenUnavailable,
  resetPasswordSchema,
  withPasswordResetTransaction,
  type PasswordResetTx,
} from "@/server/password-reset";

const now = new Date("2026-11-05T12:00:00.000Z");
const later = new Date(now.getTime() + 60_000);
const earlier = new Date(now.getTime() - 60_000);
const tokenHash = "a".repeat(64);
const otherHash = "b".repeat(64);

type TokenRow = {
  id: bigint;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
};

type SessionRow = { id: string; userId: number; revokedAt: Date | null };

type ResetHooks = {
  beforePasswordWrite?: () => Promise<void> | void;
  beforeConsume?: () => Promise<void> | void;
  beforeSessionRevoke?: () => Promise<void> | void;
};

/**
 * Models one PostgreSQL transaction around SELECT ... FOR UPDATE.
 * The matching token row stays locked until commit or rollback, and a waiter re-reads committed state.
 */
function createResetDatabase(
  initial: { tokens: TokenRow[]; passwords: Map<number, string>; sessions: SessionRow[] },
  hooks: ResetHooks = {},
) {
  const tokens = initial.tokens.map((row) => ({ ...row }));
  const passwords = new Map(initial.passwords);
  const sessions = initial.sessions.map((row) => ({ ...row }));
  const locks = new Map<bigint, { locked: boolean; waiters: Array<() => void> }>();
  let waiting = 0;
  let passwordCommits = 0;

  function lockFor(id: bigint) {
    let lock = locks.get(id);
    if (!lock) {
      lock = { locked: false, waiters: [] };
      locks.set(id, lock);
    }
    return lock;
  }

  function acquire(id: bigint): Promise<void> {
    const lock = lockFor(id);
    if (!lock.locked) {
      lock.locked = true;
      return Promise.resolve();
    }
    waiting += 1;
    return new Promise<void>((resolve) => {
      lock.waiters.push(() => {
        waiting -= 1;
        resolve();
      });
    });
  }

  function release(id: bigint): void {
    const lock = lockFor(id);
    const next = lock.waiters.shift();
    if (next) next();
    else lock.locked = false;
  }

  return {
    tokens,
    passwords,
    sessions,
    get waiting() {
      return waiting;
    },
    get passwordCommits() {
      return passwordCommits;
    },
    transaction: async <T>(run: (tx: PasswordResetTx) => Promise<T>): Promise<T> => {
      let lockedId: bigint | null = null;
      const staged: {
        password: { userId: number; passwordHash: string } | null;
        used: { id: bigint; at: Date } | null;
        revoked: Array<{ userId: number; at: Date }>;
      } = { password: null, used: null, revoked: [] };
      try {
        const result = await run({
          async lockValidToken(hash, at) {
            const candidate = tokens.find((row) => row.tokenHash === hash);
            if (!candidate) return null;
            await acquire(candidate.id);
            lockedId = candidate.id;
            const current = tokens.find((row) => row.id === candidate.id);
            if (!current || current.usedAt !== null || current.expiresAt.getTime() <= at.getTime()) return null;
            return { id: current.id, userId: current.userId };
          },
          async updatePassword(userId, passwordHash) {
            await hooks.beforePasswordWrite?.();
            staged.password = { userId, passwordHash };
          },
          async consumeToken(id, at) {
            await hooks.beforeConsume?.();
            const current = tokens.find((row) => row.id === id);
            if (!current || current.usedAt !== null) throw new ResetTokenUnavailable();
            staged.used = { id, at };
          },
          async revokeSessions(userId, at) {
            await hooks.beforeSessionRevoke?.();
            staged.revoked.push({ userId, at });
          },
        });
        if (staged.password) {
          passwords.set(staged.password.userId, staged.password.passwordHash);
          passwordCommits += 1;
        }
        if (staged.used) {
          const row = tokens.find((token) => token.id === staged.used?.id);
          if (!row || row.usedAt !== null) throw new Error("token commit conflict");
          row.usedAt = staged.used.at;
        }
        for (const revoke of staged.revoked) {
          for (const session of sessions) {
            if (session.userId === revoke.userId && session.revokedAt === null) session.revokedAt = revoke.at;
          }
        }
        return result;
      } finally {
        if (lockedId !== null) release(lockedId);
      }
    },
  };
}

function validToken(id: bigint, hash: string, userId = 4): TokenRow {
  return { id, userId, tokenHash: hash, expiresAt: later, usedAt: null };
}

function database(tokens: TokenRow[], hooks?: ResetHooks) {
  return createResetDatabase(
    {
      tokens,
      passwords: new Map([[4, "old-hash"], [5, "other-hash"]]),
      sessions: [
        { id: "open", userId: 4, revokedAt: null },
        { id: "closed", userId: 4, revokedAt: earlier },
        { id: "other-user", userId: 5, revokedAt: null },
      ],
    },
    hooks,
  );
}

async function finish(db: ReturnType<typeof database>, hash: string, passwordHash = "new-hash") {
  return completePasswordReset({
    tokenHash: hash,
    now,
    hashPassword: async () => passwordHash,
    transaction: (run) => db.transaction(run),
  });
}

describe("password reset policy", () => {
  it("keeps the existing token and password limits", () => {
    const token = "t".repeat(20);
    const password = "p".repeat(12);
    expect(PASSWORD_RESET_POLICY_ERROR).toBe("Use at least 12 characters.");
    expect(resetPasswordSchema.safeParse({ token, password }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ token, password: "p".repeat(11) }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token, password: "p".repeat(200) }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ token, password: "p".repeat(201) }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: "t".repeat(19), password }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: "t".repeat(200), password }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ token: "t".repeat(201), password }).success).toBe(false);
  });
});

describe("password reset token lock", () => {
  it("locks one unused unexpired row and keeps the hash out of the SQL text", async () => {
    const hostile = "hash' OR 1=1 --";
    let seen: unknown[] = [];
    const row = await lockValidResetToken(
      (query, ...values) => {
        const sql = query.join("?");
        expect(sql).toContain("FROM password_reset_tokens");
        expect(sql).toContain("token_hash =");
        expect(sql).toContain("used_at IS NULL");
        expect(sql).toContain("expires_at >");
        expect(sql).toContain("ORDER BY id");
        expect(sql).toContain("LIMIT 1");
        expect(sql).toContain("FOR UPDATE");
        expect(sql).not.toContain("SKIP LOCKED");
        expect(sql).not.toMatch(/UPDATE\s+password_reset_tokens/i);
        expect(sql).not.toContain(hostile);
        seen = values;
        return Promise.resolve([{ id: "15", userId: 4 }]);
      },
      hostile,
      now,
    );
    expect(seen).toEqual([hostile, now]);
    expect(row).toEqual({ id: BigInt(15), userId: 4 });
  });

  it("returns no row when the lock query finds nothing", async () => {
    const row = await lockValidResetToken(async () => [], tokenHash, now);
    expect(row).toBeNull();
  });

  it("consumes only the locked row when it is still unused", async () => {
    const args: Array<{ where: { id: bigint; usedAt: null }; data: { usedAt: Date } }> = [];
    await consumeResetToken(async (update) => {
      args.push(update);
      return { count: 1 };
    }, BigInt(15), now);
    expect(args).toEqual([{ where: { id: BigInt(15), usedAt: null }, data: { usedAt: now } }]);
  });

  it("rejects a conditional consume that loses the row", async () => {
    await expect(consumeResetToken(async () => ({ count: 0 }), BigInt(15), now)).rejects.toBeInstanceOf(ResetTokenUnavailable);
  });
});

describe("password reset transaction", () => {
  function client(options?: { passwordError?: string; consumeCount?: number; sessionError?: string }) {
    const state = { password: "old-hash", usedAt: null as Date | null, revoked: false };
    const calls: string[] = [];
    let rolledBack = false;
    let optionsSeen: unknown;
    const db = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>, transactionOptions: unknown) => {
        optionsSeen = transactionOptions;
        const snapshot = { ...state };
        const tx = {
          $queryRaw: async (query: TemplateStringsArray, ...values: unknown[]) => {
            calls.push(query.join(" "));
            expect(values[0]).toBe(tokenHash);
            return [{ id: BigInt(9), userId: 4 }];
          },
          user: {
            update: async (args: { where: { id: number }; data: { password: string; updatedAt: Date } }) => {
              calls.push("password");
              expect(args.where).toEqual({ id: 4 });
              if (options?.passwordError) throw new Error(options.passwordError);
              state.password = args.data.password;
            },
          },
          passwordResetToken: {
            updateMany: async (args: { where: { id: bigint; usedAt: null }; data: { usedAt: Date } }) => {
              calls.push("consume");
              expect(args.where).toEqual({ id: BigInt(9), usedAt: null });
              state.usedAt = args.data.usedAt;
              return { count: options?.consumeCount ?? 1 };
            },
          },
          session: {
            updateMany: async (args: { where: { userId: number; revokedAt: null } }) => {
              calls.push("sessions");
              expect(args.where).toEqual({ userId: 4, revokedAt: null });
              if (options?.sessionError) throw new Error(options.sessionError);
              state.revoked = true;
            },
          },
        };
        try {
          return await fn(tx);
        } catch (error) {
          state.password = snapshot.password;
          state.usedAt = snapshot.usedAt;
          state.revoked = snapshot.revoked;
          rolledBack = true;
          throw error;
        }
      },
    };
    return { db: db as unknown as PrismaClient, state, calls, rolledBack: () => rolledBack, optionsSeen: () => optionsSeen };
  }

  it("runs the lock, password write, consume, and session revoke in one transaction", async () => {
    const fake = client();
    const order: string[] = [];
    const result = await completePasswordReset({
      tokenHash,
      now,
      hashPassword: async () => {
        order.push("hash");
        return "hashed-password";
      },
      transaction: (run) => {
        order.push("transaction");
        return withPasswordResetTransaction(fake.db, run);
      },
    });
    expect(order).toEqual(["hash", "transaction"]);
    expect(result).toEqual({ ok: true, userId: 4 });
    expect(fake.optionsSeen()).toEqual(PASSWORD_RESET_TRANSACTION);
    expect(PASSWORD_RESET_TRANSACTION.isolationLevel).toBe("ReadCommitted");
    expect(fake.calls[0]).toContain("FOR UPDATE");
    expect(fake.calls.slice(1)).toEqual(["password", "consume", "sessions"]);
    expect(fake.state).toEqual({ password: "hashed-password", usedAt: now, revoked: true });
    expect(fake.rolledBack()).toBe(false);
  });

  it("rolls the transaction back when the password update fails", async () => {
    const fake = client({ passwordError: "password write failed" });
    await expect(
      completePasswordReset({
        tokenHash,
        now,
        hashPassword: async () => "hashed-password",
        transaction: (run) => withPasswordResetTransaction(fake.db, run),
      }),
    ).rejects.toThrow("password write failed");
    expect(fake.calls).toEqual([expect.stringContaining("FOR UPDATE"), "password"]);
    expect(fake.rolledBack()).toBe(true);
    expect(fake.state).toEqual({ password: "old-hash", usedAt: null, revoked: false });
  });

  it("rolls the password change back when the conditional consume loses", async () => {
    const fake = client({ consumeCount: 0 });
    const result = await completePasswordReset({
      tokenHash,
      now,
      hashPassword: async () => "hashed-password",
      transaction: (run) => withPasswordResetTransaction(fake.db, run),
    });
    expect(result).toEqual({ ok: false, error: RESET_LINK_INVALID });
    expect(fake.rolledBack()).toBe(true);
    expect(fake.state).toEqual({ password: "old-hash", usedAt: null, revoked: false });
  });

  it("rolls the transaction back when session revocation fails", async () => {
    const fake = client({ sessionError: "session revoke failed" });
    await expect(
      completePasswordReset({
        tokenHash,
        now,
        hashPassword: async () => "hashed-password",
        transaction: (run) => withPasswordResetTransaction(fake.db, run),
      }),
    ).rejects.toThrow("session revoke failed");
    expect(fake.calls).toEqual([expect.stringContaining("FOR UPDATE"), "password", "consume", "sessions"]);
    expect(fake.rolledBack()).toBe(true);
    expect(fake.state).toEqual({ password: "old-hash", usedAt: null, revoked: false });
  });
});

describe("concurrent password reset consumption", () => {
  it("hashes the password before the transaction begins", async () => {
    const db = database([validToken(BigInt(1), tokenHash)]);
    const order: string[] = [];
    const result = await completePasswordReset({
      tokenHash,
      now,
      hashPassword: async () => {
        order.push("hash");
        return "precomputed-hash";
      },
      transaction: async (run) => {
        order.push("transaction");
        return db.transaction(run);
      },
    });
    expect(order).toEqual(["hash", "transaction"]);
    expect(result).toEqual({ ok: true, userId: 4 });
    expect(db.passwords.get(4)).toBe("precomputed-hash");
    expect(db.tokens[0]?.usedAt).toEqual(now);
    expect(db.sessions.find((session) => session.id === "open")?.revokedAt).toEqual(now);
    expect(db.sessions.find((session) => session.id === "other-user")?.revokedAt).toBeNull();
  });

  it("lets only one of two requests consume the same token and change the password", async () => {
    let release = () => {};
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let holding = false;
    const db = database([validToken(BigInt(1), tokenHash)], {
      beforePasswordWrite: () => {
        holding = true;
        return hold;
      },
    });
    const order: string[] = [];
    const first = completePasswordReset({
      tokenHash,
      now,
      hashPassword: async () => {
        order.push("hash-a");
        return "hash-a";
      },
      transaction: (run) => {
        order.push("tx-a");
        return db.transaction(run);
      },
    });
    const started = Date.now();
    while (!holding) {
      if (Date.now() > started + 1_000) throw new Error("first reset did not reach the password write");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(order).toEqual(["hash-a", "tx-a"]);
    const second = completePasswordReset({
      tokenHash,
      now,
      hashPassword: async () => {
        order.push("hash-b");
        return "hash-b";
      },
      transaction: (run) => {
        order.push("tx-b");
        return db.transaction(run);
      },
    });
    const waited = Date.now();
    while (db.waiting < 1) {
      if (Date.now() > waited + 1_000) throw new Error("second request did not wait on the token lock");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(order.indexOf("hash-b")).toBeLessThan(order.indexOf("tx-b"));
    release();
    const [won, lost] = await Promise.all([first, second]);
    expect(won).toEqual({ ok: true, userId: 4 });
    expect(lost).toEqual({ ok: false, error: RESET_LINK_INVALID });
    expect(db.passwordCommits).toBe(1);
    expect(db.passwords.get(4)).toBe("hash-a");
    expect(db.tokens[0]?.usedAt).toEqual(now);
    expect(db.sessions.find((session) => session.id === "open")?.revokedAt).toEqual(now);
    expect(db.sessions.find((session) => session.id === "other-user")?.revokedAt).toBeNull();
  });

  it("fails when another request consumes the token while hashing is still in progress", async () => {
    const db = database([validToken(BigInt(1), tokenHash)]);
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let hashing = false;
    const slow = completePasswordReset({
      tokenHash,
      now,
      hashPassword: async () => {
        hashing = true;
        await gate;
        return "slow-hash";
      },
      transaction: (run) => db.transaction(run),
    });
    const started = Date.now();
    while (!hashing) {
      if (Date.now() > started + 1_000) throw new Error("slow reset did not start hashing");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const fast = await Promise.race([
      finish(db, tokenHash, "fast-hash"),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("fast reset blocked while the other request was hashing")), 1_000);
      }),
    ]);
    expect(fast).toEqual({ ok: true, userId: 4 });
    release();
    await expect(slow).resolves.toEqual({ ok: false, error: RESET_LINK_INVALID });
    expect(db.passwordCommits).toBe(1);
    expect(db.passwords.get(4)).toBe("fast-hash");
    expect(db.tokens[0]?.usedAt).toEqual(now);
    expect(db.sessions.find((session) => session.id === "open")?.revokedAt).toEqual(now);
    expect(db.sessions.find((session) => session.id === "closed")?.revokedAt).toEqual(earlier);
    expect(db.sessions.find((session) => session.id === "other-user")?.revokedAt).toBeNull();
  });

  it("does not let a failed password write consume the token, so a later request can succeed", async () => {
    let failed = false;
    const db = database([validToken(BigInt(1), tokenHash)], {
      beforePasswordWrite: () => {
        if (!failed) {
          failed = true;
          throw new Error("password write failed");
        }
      },
    });
    await expect(finish(db, tokenHash, "first-hash")).rejects.toThrow("password write failed");
    expect(db.tokens[0]?.usedAt).toBeNull();
    expect(db.passwords.get(4)).toBe("old-hash");
    expect(db.sessions.find((session) => session.id === "open")?.revokedAt).toBeNull();
    expect(db.passwordCommits).toBe(0);

    const retry = await finish(db, tokenHash, "second-hash");
    expect(retry).toEqual({ ok: true, userId: 4 });
    expect(db.passwords.get(4)).toBe("second-hash");
    expect(db.passwordCommits).toBe(1);
    expect(db.tokens[0]?.usedAt).toEqual(now);
  });

  it("leaves the token unused when session revocation fails", async () => {
    const db = database([validToken(BigInt(1), tokenHash)], {
      beforeSessionRevoke: () => {
        throw new Error("session revoke failed");
      },
    });
    await expect(finish(db, tokenHash)).rejects.toThrow("session revoke failed");
    expect(db.tokens[0]?.usedAt).toBeNull();
    expect(db.passwords.get(4)).toBe("old-hash");
    expect(db.sessions.find((session) => session.id === "open")?.revokedAt).toBeNull();
    expect(db.sessions.find((session) => session.id === "other-user")?.revokedAt).toBeNull();
    expect(db.passwordCommits).toBe(0);
  });

  it("rolls back the password and sessions when token consumption fails", async () => {
    const db = database([validToken(BigInt(1), tokenHash)], {
      beforeConsume: () => {
        throw new Error("token consume failed");
      },
    });
    await expect(finish(db, tokenHash, "new-hash")).rejects.toThrow("token consume failed");
    expect(db.tokens[0]?.usedAt).toBeNull();
    expect(db.passwords.get(4)).toBe("old-hash");
    expect(db.sessions.find((session) => session.id === "open")?.revokedAt).toBeNull();
    expect(db.passwordCommits).toBe(0);
  });

  it("leaves the token unused when hashing fails before the transaction opens", async () => {
    const db = database([validToken(BigInt(1), tokenHash)]);
    let opened = false;
    await expect(
      completePasswordReset({
        tokenHash,
        now,
        hashPassword: async () => {
          throw new Error("hash failed");
        },
        transaction: async (run) => {
          opened = true;
          return db.transaction(run);
        },
      }),
    ).rejects.toThrow("hash failed");
    expect(opened).toBe(false);
    expect(db.tokens[0]?.usedAt).toBeNull();
    expect(db.passwords.get(4)).toBe("old-hash");
    expect(db.sessions.find((session) => session.id === "open")?.revokedAt).toBeNull();
    expect(db.passwordCommits).toBe(0);
  });

  it("rejects expired, invalid, and already-used tokens with the same public error", async () => {
    const usedAt = earlier;
    const db = database([
      { id: BigInt(1), userId: 4, tokenHash: "expired", expiresAt: earlier, usedAt: null },
      { id: BigInt(2), userId: 4, tokenHash: "used", expiresAt: later, usedAt },
      { id: BigInt(3), userId: 4, tokenHash: "boundary", expiresAt: now, usedAt: null },
      validToken(BigInt(4), tokenHash),
    ]);
    const order: string[] = [];
    const hashPassword = async () => {
      order.push("hash");
      return "should-not-apply";
    };
    const transaction = <T>(run: (tx: PasswordResetTx) => Promise<T>) => {
      order.push("transaction");
      return db.transaction(run);
    };
    const expired = await completePasswordReset({ tokenHash: "expired", now, hashPassword, transaction });
    const used = await completePasswordReset({ tokenHash: "used", now, hashPassword, transaction });
    const boundary = await completePasswordReset({ tokenHash: "boundary", now, hashPassword, transaction });
    const missing = await completePasswordReset({ tokenHash: "missing", now, hashPassword, transaction });
    expect(expired).toEqual({ ok: false, error: RESET_LINK_INVALID });
    expect(used).toEqual(expired);
    expect(boundary).toEqual(expired);
    expect(missing).toEqual(expired);
    expect(RESET_LINK_INVALID).toBe("This reset link is invalid or expired.");
    expect(order).toEqual(["hash", "transaction", "hash", "transaction", "hash", "transaction", "hash", "transaction"]);
    expect(db.passwordCommits).toBe(0);
    expect(db.passwords.get(4)).toBe("old-hash");
    expect(db.sessions.find((session) => session.id === "open")?.revokedAt).toBeNull();
    expect(db.sessions.find((session) => session.id === "closed")?.revokedAt).toEqual(earlier);
    expect(db.sessions.find((session) => session.id === "other-user")?.revokedAt).toBeNull();
    expect(db.tokens.find((row) => row.tokenHash === "expired")?.usedAt).toBeNull();
    expect(db.tokens.find((row) => row.tokenHash === "used")?.usedAt).toEqual(usedAt);
    expect(db.tokens.find((row) => row.tokenHash === "boundary")?.usedAt).toBeNull();
    expect(db.tokens.find((row) => row.id === BigInt(4))?.usedAt).toBeNull();
  });

  it("keeps a successful reset limited to that token and that account's open sessions", async () => {
    const db = database([validToken(BigInt(1), tokenHash), validToken(BigInt(2), otherHash, 5)]);
    const result = await finish(db, tokenHash, "replaced-hash");
    expect(result).toEqual({ ok: true, userId: 4 });
    expect(db.passwords.get(4)).toBe("replaced-hash");
    expect(db.passwords.get(5)).toBe("other-hash");
    expect(db.tokens.find((row) => row.id === BigInt(1))?.usedAt).toEqual(now);
    expect(db.tokens.find((row) => row.id === BigInt(2))?.usedAt).toBeNull();
    expect(db.sessions.find((session) => session.id === "open")?.revokedAt).toEqual(now);
    expect(db.sessions.find((session) => session.id === "closed")?.revokedAt).toEqual(earlier);
    expect(db.sessions.find((session) => session.id === "other-user")?.revokedAt).toBeNull();

    const second = await finish(db, tokenHash, "again");
    expect(second).toEqual({ ok: false, error: RESET_LINK_INVALID });
    expect(db.passwords.get(4)).toBe("replaced-hash");
    expect(db.passwordCommits).toBe(1);

    const other = await finish(db, otherHash, "other-new");
    expect(other).toEqual({ ok: true, userId: 5 });
    expect(db.passwords.get(4)).toBe("replaced-hash");
    expect(db.passwords.get(5)).toBe("other-new");
    expect(db.tokens.find((row) => row.id === BigInt(2))?.usedAt).toEqual(now);
  });

  it("does not serialize two different reset tokens", async () => {
    let writing = 0;
    let release = () => {};
    const bothWriting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const db = database([validToken(BigInt(1), tokenHash), validToken(BigInt(2), otherHash)], {
      beforePasswordWrite: () => {
        writing += 1;
        if (writing === 2) release();
        return bothWriting;
      },
    });
    const run = (hash: string, passwordHash: string) =>
      completePasswordReset({
        tokenHash: hash,
        now,
        hashPassword: async () => passwordHash,
        transaction: (runTx) => db.transaction(runTx),
      });
    const results = await Promise.all([run(tokenHash, "hash-a"), run(otherHash, "hash-b")]);
    expect(writing).toBe(2);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(db.passwordCommits).toBe(2);
    expect(db.tokens.every((row) => row.usedAt?.getTime() === now.getTime())).toBe(true);
    expect(["hash-a", "hash-b"]).toContain(db.passwords.get(4));
  });
});

describe("password reset request behavior", () => {
  it("still hashes tokens for 30 minutes and does not change the public acknowledgement", async () => {
    const { hashToken } = await import("@/server/mail");
    const { PASSWORD_RESET_ACK, requestPasswordReset } = await import("@/server/password-reset");
    const saved: Array<{ userId: number; tokenHash: string; expiresAt: Date }> = [];
    const at = Date.parse("2026-11-05T12:00:00.000Z");
    const token = "fixed-reset-token-0123456789abcdef";
    const result = await requestPasswordReset({
      email: "user@example.com",
      now: at,
      appUrl: "https://mms.example",
      token,
      transportReady: () => true,
      reportUnavailable: () => undefined,
      findActiveUser: async () => ({ id: 7, email: "user@example.com" }),
      saveToken: async (row) => {
        saved.push(row);
      },
      deliver: async () => ({ ok: true }),
      markSent: async () => undefined,
    });
    expect(result).toEqual({ message: PASSWORD_RESET_ACK, delivered: true });
    expect(saved).toEqual([{ userId: 7, tokenHash: hashToken(token), expiresAt: new Date(at + 30 * 60 * 1000) }]);
  });
});
