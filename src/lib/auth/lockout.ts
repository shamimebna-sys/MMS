import { createHash } from "node:crypto";

export const LOCKOUT_LIMIT = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
export const LOCKOUT_MESSAGE = "This account is locked for 15 minutes.";

export function lockoutWindowStart(now = Date.now()): Date {
  return new Date(now - LOCKOUT_WINDOW_MS);
}

/** Recent failed attempts at or above the limit lock the account. A successful login clears them. */
export function isAccountLocked(recentFailures: number): boolean {
  return recentFailures >= LOCKOUT_LIMIT;
}

export function recentFailureCount(failureTimes: readonly number[], now: number): number {
  const since = now - LOCKOUT_WINDOW_MS;
  return failureTimes.filter((time) => time > since).length;
}

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type LoginAttemptResult<TUser> = { kind: "locked" } | { kind: "failure" } | { kind: "success"; user: TUser };

/** Fields read under the advisory lock. The password hash stays inside the attempt and is not returned on success. */
export type LoginAccount = {
  id: number;
  passwordHash: string;
  status: string | null;
  roleName: string | null;
  candidateId: number | null;
};

export type LoginIdentity = {
  id: number;
  roleName: string | null;
  candidateId: number | null;
};

export type LoginAttemptDb = {
  /** Failures with a timestamp strictly after sinceMs. */
  countFailures(email: string, sinceMs: number): Promise<number>;
  readAccount(email: string): Promise<LoginAccount | null>;
  addFailure(email: string, atMs: number): Promise<void>;
  /** Clears failed attempts and records the successful sign-in in one transaction. */
  resetFailures(email: string, atMs: number): Promise<void>;
};

export type LoginAttemptStore = {
  /**
   * Acquires the session advisory lock, runs `run` on that connection, then unlocks and releases it.
   * `run` must finish before bcrypt. The lock ends when this promise settles.
   */
  locked<T>(email: string, run: (db: LoginAttemptDb) => Promise<T>): Promise<T>;
};

export type LockClient = {
  query: (sql: string, values?: readonly unknown[]) => Promise<unknown>;
  release: (error?: Error) => void;
};

/**
 * Holds one session advisory lock for the duration of `run`, then unlocks and releases the connection.
 * The lock key is the first eight bytes of SHA-256(`mms-login:` + the normalized email).
 * Callers must not compare or hash passwords inside `run`: the connection stays checked out until `run` finishes.
 */
export async function withAdvisoryLoginLock<T>(
  email: string,
  connect: () => Promise<LockClient>,
  run: (client: LockClient) => Promise<T>,
): Promise<T> {
  const digest = createHash("sha256").update(`mms-login:${normalizeLoginEmail(email)}`).digest();
  const key1 = digest.readInt32BE(0);
  const key2 = digest.readInt32BE(4);
  let client: LockClient | undefined;
  let locked = false;
  try {
    client = await connect();
    await client.query("SELECT pg_advisory_lock($1::int4, $2::int4)", [key1, key2]);
    locked = true;
    return await run(client);
  } finally {
    if (client) await releaseAdvisoryLoginLock(client, locked, key1, key2);
  }
}

async function releaseAdvisoryLoginLock(client: LockClient, locked: boolean, key1: number, key2: number): Promise<void> {
  if (!locked) {
    client.release();
    return;
  }
  try {
    await client.query("SELECT pg_advisory_unlock($1::int4, $2::int4)", [key1, key2]);
    client.release();
  } catch (error) {
    client.release(error instanceof Error ? error : new Error("Could not release the login lock."));
  }
}

/** Blank and whitespace statuses stay active. Any other non-`A` status is inactive. */
export function isActiveLoginStatus(status: string | null | undefined): boolean {
  const normalized = status?.trim() || null;
  return normalized == null || normalized === "A";
}

function sameCredential(opened: LoginAccount, current: LoginAccount): boolean {
  return opened.id === current.id && opened.passwordHash === current.passwordHash;
}

/**
 * Reads the account under the advisory lock, compares the password with no connection held,
 * then locks again to record one outcome. Overlapping compares for one email can run together.
 * The second lock refuses a session once five recent failures are visible, and it refuses a
 * session when the password hash changed during the compare.
 */
export async function applyLoginAttempt(input: {
  email: string;
  atMs: number;
  store: LoginAttemptStore;
  verifyPassword: (passwordHash: string) => Promise<boolean>;
}): Promise<LoginAttemptResult<LoginIdentity>> {
  const email = normalizeLoginEmail(input.email);
  const sinceMs = lockoutWindowStart(input.atMs).getTime();
  const opened = await input.store.locked(email, async (db) => {
    const recent = await db.countFailures(email, sinceMs);
    if (isAccountLocked(recent)) return { kind: "locked" as const };
    const account = await db.readAccount(email);
    return { kind: "open" as const, account };
  });
  if (opened.kind === "locked") return { kind: "locked" };

  const passwordOk = opened.account ? await input.verifyPassword(opened.account.passwordHash) : false;

  return input.store.locked(email, async (db) => {
    const recent = await db.countFailures(email, sinceMs);
    const current = await db.readAccount(email);
    if (isAccountLocked(recent)) return { kind: "locked" };
    if (opened.account) {
      if (!current || !sameCredential(opened.account, current)) return { kind: "failure" };
      if (!passwordOk || !isActiveLoginStatus(current.status)) {
        await db.addFailure(email, input.atMs);
        return { kind: "failure" };
      }
      await db.resetFailures(email, input.atMs);
      return {
        kind: "success",
        user: { id: current.id, roleName: current.roleName, candidateId: current.candidateId },
      };
    }
    await db.addFailure(email, input.atMs);
    return { kind: "failure" };
  });
}
