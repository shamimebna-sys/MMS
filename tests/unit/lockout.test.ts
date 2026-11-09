import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyLoginAttempt,
  isAccountLocked,
  LOCKOUT_LIMIT,
  LOCKOUT_MESSAGE,
  LOCKOUT_WINDOW_MS,
  recentFailureCount,
  withAdvisoryLoginLock,
  type LoginIdentity,
} from "@/lib/auth/lockout";
import { createLoginAttemptStore } from "@/server/login-lock";
import { loginAction } from "@/app/login/actions";

const GENERIC_ERROR = "The email or password is incorrect.";

const db = vi.hoisted(() => ({
  connect: vi.fn(),
  sessionCreate: vi.fn(async (_input: { data: Record<string, unknown> }) => ({})),
  auditCreate: vi.fn(async () => undefined),
  verify: vi.fn(async (password: string, storedHash: string) => password === "correct" && storedHash === "stored-hash"),
}));

vi.mock("@/lib/db", () => ({
  pool: { connect: db.connect },
  prisma: {
    session: { create: db.sessionCreate },
    auditLog: { create: db.auditCreate },
  },
}));

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: (password: string, storedHash: string) => db.verify(password, storedHash),
  hashPassword: async () => "hashed",
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
  requestIp: async () => "203.0.113.8",
  getCurrentUser: async () => null,
}));

const now = Date.parse("2026-11-01T17:45:00.000Z");

describe("login lockout", () => {
  it("rejects a sign-in only after the configured number of recent failures", () => {
    expect(isAccountLocked(LOCKOUT_LIMIT - 1)).toBe(false);
    expect(isAccountLocked(LOCKOUT_LIMIT)).toBe(true);
    expect(isAccountLocked(LOCKOUT_LIMIT + 2)).toBe(true);
  });

  it("ignores failures older than the lockout window", () => {
    const expired = now - LOCKOUT_WINDOW_MS - 1;
    const inside = now - 60_000;
    expect(recentFailureCount([expired, expired, expired, expired, expired], now)).toBe(0);
    expect(isAccountLocked(recentFailureCount([expired, expired, expired, expired, inside], now))).toBe(false);
  });

  it("locks again when five failures are still inside the window", () => {
    const failures = Array.from({ length: LOCKOUT_LIMIT }, (_, index) => now - index * 1_000);
    expect(isAccountLocked(recentFailureCount(failures, now))).toBe(true);
  });

  it("treats a successful login as clearing the failed-attempt counter", () => {
    const failures = Array.from({ length: LOCKOUT_LIMIT }, () => now - 1_000);
    const afterSuccess: number[] = [];
    expect(isAccountLocked(recentFailureCount(afterSuccess, now))).toBe(false);
    expect(failures.length).toBe(LOCKOUT_LIMIT);
  });
});

type FakeUser = {
  id: number;
  email: string;
  password: string;
  status: string | null;
  roleName: string | null;
  candidateId: number | null;
};

type FakeAttempt = {
  email: string;
  ip: string | null;
  success: boolean;
  createdAt: number;
};

type FakeDatabase = {
  users: FakeUser[];
  attempts: FakeAttempt[];
  events: string[];
  failSql: string;
  checkedOut: () => number;
  heldLocks: () => number;
  failures: (email: string) => number;
};

function account(overrides: Partial<FakeUser> = {}): FakeUser {
  return {
    id: 9,
    email: "user@example.com",
    password: "stored-hash",
    status: "A",
    roleName: "Agent",
    candidateId: null,
    ...overrides,
  };
}

function failureAt(email: string, createdAt: number): FakeAttempt {
  return { email, ip: "203.0.113.8", success: false, createdAt };
}

function installDatabase(users: FakeUser[] = [], attempts: FakeAttempt[] = []): FakeDatabase {
  const state = {
    users,
    attempts,
    events: [] as string[],
    failSql: "",
  };
  const tails = new Map<string, Promise<void>>();
  let checkedOut = 0;
  let heldLocks = 0;

  db.connect.mockImplementation(async () => {
    checkedOut += 1;
    state.events.push("connect");
    let releaseLock: (() => void) | null = null;
    let holding = false;
    let txn: FakeAttempt[] | null = null;
    let released = false;

    const attemptsOf = () => txn ?? state.attempts;
    const replaceAttempts = (next: FakeAttempt[]) => {
      const target = txn ?? state.attempts;
      target.splice(0, target.length, ...next);
    };
    const clearLock = () => {
      if (!holding) return;
      holding = false;
      heldLocks -= 1;
      const unlock = releaseLock;
      releaseLock = null;
      unlock?.();
    };
    const failIfNeeded = (sql: string) => {
      if (state.failSql && sql.includes(state.failSql)) throw new Error(`sql failed: ${state.failSql}`);
    };

    return {
      query: async (sql: string, values: readonly unknown[] = []) => {
        if (released) throw new Error("query after release");
        state.events.push(sql);
        failIfNeeded(sql);
        if (sql.includes("pg_advisory_unlock")) {
          clearLock();
          return { rows: [] };
        }
        if (sql.includes("pg_advisory_lock")) {
          const key = `${String(values[0])}:${String(values[1])}`;
          const previous = tails.get(key) ?? Promise.resolve();
          let unlock = () => {};
          const gate = new Promise<void>((resolve) => {
            unlock = resolve;
          });
          tails.set(key, previous.then(() => gate).then(() => undefined, () => undefined));
          await previous;
          releaseLock = unlock;
          holding = true;
          heldLocks += 1;
          return { rows: [] };
        }
        if (sql === "BEGIN") {
          txn = state.attempts.map((row) => ({ ...row }));
          return { rows: [] };
        }
        if (sql === "ROLLBACK") {
          txn = null;
          return { rows: [] };
        }
        if (sql === "COMMIT") {
          if (!txn) throw new Error("commit without begin");
          state.attempts.splice(0, state.attempts.length, ...txn);
          txn = null;
          return { rows: [] };
        }
        if (sql.includes("COUNT(*)")) {
          const email = String(values[0]);
          const since = values[1] instanceof Date ? values[1].getTime() : Number(values[1]);
          const count = attemptsOf().filter((row) => row.email === email && !row.success && row.createdAt > since).length;
          return { rows: [{ count }] };
        }
        if (sql.includes("FROM users")) {
          const email = String(values[0]).toLowerCase();
          const match = state.users
            .filter((user) => user.email.toLowerCase() === email)
            .sort((left, right) => left.id - right.id)[0];
          if (!match) return { rows: [] };
          return {
            rows: [
              {
                id: match.id,
                password: match.password,
                status: match.status,
                candidate_id: match.candidateId,
                role_name: match.roleName,
              },
            ],
          };
        }
        if (sql.startsWith("INSERT INTO login_attempts")) {
          attemptsOf().push({
            email: String(values[0]),
            ip: values[1] == null ? null : String(values[1]),
            success: values[2] === true,
            createdAt: values[3] instanceof Date ? values[3].getTime() : Number(values[3]),
          });
          return { rows: [] };
        }
        if (sql.startsWith("DELETE FROM login_attempts")) {
          const email = String(values[0]);
          replaceAttempts(attemptsOf().filter((row) => row.email !== email || row.success));
          return { rows: [] };
        }
        throw new Error(`unexpected sql: ${sql}`);
      },
      release(error?: Error) {
        if (released) throw new Error("double release");
        released = true;
        clearLock();
        txn = null;
        checkedOut -= 1;
        state.events.push(error ? "release:error" : "release");
      },
    };
  });

  return {
    users: state.users,
    attempts: state.attempts,
    events: state.events,
    get failSql() {
      return state.failSql;
    },
    set failSql(value: string) {
      state.failSql = value;
    },
    checkedOut: () => checkedOut,
    heldLocks: () => heldLocks,
    failures: (email: string) => state.attempts.filter((row) => row.email === email && !row.success).length,
  };
}

describe("login attempt lock", () => {
  const start = Date.parse("2026-11-01T17:45:00.000Z");
  const email = "user@example.com";
  let database: FakeDatabase;
  let sessions: LoginIdentity[];

  beforeEach(() => {
    db.connect.mockReset();
    db.sessionCreate.mockClear();
    db.auditCreate.mockClear();
    db.verify.mockReset();
    db.verify.mockImplementation(async (password: string, storedHash: string) => password === "correct" && storedHash === "stored-hash");
    database = installDatabase();
    sessions = [];
  });

  async function signIn(
    address: string,
    atMs: number,
    verify: (passwordHash: string) => Promise<boolean> | boolean,
  ): Promise<Awaited<ReturnType<typeof applyLoginAttempt>>> {
    const outcome = await applyLoginAttempt({
      email: address,
      atMs,
      store: createLoginAttemptStore("203.0.113.8"),
      verifyPassword: async (passwordHash) => {
        database.events.push("bcrypt");
        expect(database.checkedOut()).toBe(0);
        expect(database.heldLocks()).toBe(0);
        return verify(passwordHash);
      },
    });
    if (outcome.kind === "success") sessions.push(outcome.user);
    return outcome;
  }

  function seed(count: number, atMs = start) {
    database.users.push(account());
    for (let index = 0; index < count; index += 1) database.attempts.push(failureAt(email, atMs));
  }

  it("does not compare a password or create a session when the account is already locked", async () => {
    seed(LOCKOUT_LIMIT);
    let compared = false;
    const outcome = await signIn(email, start, () => {
      compared = true;
      return true;
    });
    expect(outcome.kind).toBe("locked");
    expect(compared).toBe(false);
    expect(database.events).not.toContain("bcrypt");
    expect(database.events.some((event) => event.includes("FROM users"))).toBe(false);
    expect(sessions).toEqual([]);
    expect(database.failures(email)).toBe(LOCKOUT_LIMIT);
    expect(database.checkedOut()).toBe(0);
    expect(database.heldLocks()).toBe(0);
  });

  it("records one generic failure for an unknown email and skips bcrypt", async () => {
    const outcome = await signIn(" User@Missing.example ", start, () => {
      throw new Error("unknown email must not be compared");
    });
    expect(outcome.kind).toBe("failure");
    expect(database.events).not.toContain("bcrypt");
    expect(database.failures("user@missing.example")).toBe(1);
    expect(database.attempts[0]).toMatchObject({ email: "user@missing.example", ip: "203.0.113.8", success: false, createdAt: start });
    expect(sessions).toEqual([]);
  });

  it("records one failure for a wrong password", async () => {
    database.users.push(account());
    const outcome = await signIn("User@Example.com", start, () => false);
    expect(outcome.kind).toBe("failure");
    expect(database.events).toContain("bcrypt");
    expect(database.failures(email)).toBe(1);
    expect(sessions).toEqual([]);
    const bcryptAt = database.events.indexOf("bcrypt");
    const firstRelease = database.events.indexOf("release");
    expect(firstRelease).toBeGreaterThan(-1);
    expect(firstRelease).toBeLessThan(bcryptAt);
    expect(database.events.slice(0, bcryptAt).some((event) => event.includes("pg_advisory_unlock"))).toBe(true);
    expect(database.events.filter((event) => event === "connect")).toHaveLength(2);
  });

  it("compares an inactive account and records one generic failure", async () => {
    database.users.push(account({ status: "B" }));
    const outcome = await signIn(email, start, (hash) => hash === "stored-hash");
    expect(outcome.kind).toBe("failure");
    expect(database.events).toContain("bcrypt");
    expect(database.failures(email)).toBe(1);
    expect(sessions).toEqual([]);
  });

  it("treats a blank status as active", async () => {
    database.users.push(account({ status: "   ", roleName: "Employee", candidateId: 4 }));
    const outcome = await signIn(email, start, () => true);
    expect(outcome).toEqual({ kind: "success", user: { id: 9, roleName: "Employee", candidateId: 4 } });
    expect(database.failures(email)).toBe(0);
    expect(sessions).toEqual([{ id: 9, roleName: "Employee", candidateId: 4 }]);
  });

  it("clears old failures and returns the re-read identity before a session can be created", async () => {
    seed(LOCKOUT_LIMIT - 1);
    const outcome = await signIn(" User@Example.com ", start + 1_000, () => {
      database.users[0] = account({ roleName: "Employee", candidateId: 4 });
      return true;
    });
    expect(outcome).toEqual({ kind: "success", user: { id: 9, roleName: "Employee", candidateId: 4 } });
    expect(database.failures(email)).toBe(0);
    expect(database.attempts.filter((row) => row.success)).toEqual([
      { email, ip: "203.0.113.8", success: true, createdAt: start + 1_000 },
    ]);
    expect(sessions).toEqual([{ id: 9, roleName: "Employee", candidateId: 4 }]);
    const commitAt = database.events.indexOf("COMMIT");
    const unlockAfterCommit = database.events.findIndex((event, index) => index > commitAt && event.includes("pg_advisory_unlock"));
    expect(commitAt).toBeGreaterThan(database.events.indexOf("bcrypt"));
    expect(unlockAfterCommit).toBeGreaterThan(commitAt);
    database.events.push("session");
    expect(database.events.indexOf("session")).toBeGreaterThan(unlockAfterCommit);
    expect((await signIn(email, start + 2_000, () => false)).kind).toBe("failure");
    expect(database.failures(email)).toBe(1);
  });

  it("locks the next attempt once five failures are inside the window", async () => {
    database.users.push(account());
    for (let index = 0; index < LOCKOUT_LIMIT - 1; index += 1) {
      expect((await signIn(index % 2 === 0 ? "User@Example.com" : email, start, () => false)).kind).toBe("failure");
    }
    expect((await signIn(email, start, () => false)).kind).toBe("failure");
    let compared = false;
    const locked = await signIn(" USER@example.com ", start, () => {
      compared = true;
      return true;
    });
    expect(locked.kind).toBe("locked");
    expect(compared).toBe(false);
    expect(database.failures(email)).toBe(LOCKOUT_LIMIT);
    expect(sessions).toEqual([]);
  });

  it("unlocks when the failed attempts are older than the lockout window", async () => {
    seed(LOCKOUT_LIMIT);
    const stillLocked = await signIn(email, start + LOCKOUT_WINDOW_MS - 1, () => {
      throw new Error("locked account must not be checked");
    });
    expect(stillLocked.kind).toBe("locked");
    const opened = await signIn(email, start + LOCKOUT_WINDOW_MS, () => false);
    expect(opened.kind).toBe("failure");
    expect(database.failures(email)).toBe(LOCKOUT_LIMIT + 1);
  });

  it("records exactly five failures when eight wrong passwords overlap", async () => {
    database.users.push(account());
    let inFlight = 0;
    let maxInFlight = 0;
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const attempts = Array.from({ length: LOCKOUT_LIMIT + 3 }, () =>
      applyLoginAttempt({
        email,
        atMs: start,
        store: createLoginAttemptStore("203.0.113.8"),
        verifyPassword: async () => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await gate;
          inFlight -= 1;
          return false;
        },
      }),
    );
    const deadline = Date.now() + 1_000;
    while (inFlight !== LOCKOUT_LIMIT + 3) {
      if (Date.now() > deadline) throw new Error("timed out waiting for overlapping password checks");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(database.checkedOut()).toBe(0);
    expect(database.heldLocks()).toBe(0);
    release();
    const results = await Promise.all(attempts);
    expect(maxInFlight).toBe(LOCKOUT_LIMIT + 3);
    expect(results.filter((result) => result.kind === "failure")).toHaveLength(LOCKOUT_LIMIT);
    expect(results.filter((result) => result.kind === "locked")).toHaveLength(3);
    expect(results.filter((result) => result.kind === "success")).toHaveLength(0);
    expect(database.failures(email)).toBe(LOCKOUT_LIMIT);
    expect(database.checkedOut()).toBe(0);
    expect(database.heldLocks()).toBe(0);
  });

  it("returns locked and skips the session when the final recheck already has five failures", async () => {
    seed(LOCKOUT_LIMIT - 1);
    const outcome = await signIn(email, start, () => {
      database.attempts.push(failureAt(email, start));
      return true;
    });
    expect(outcome.kind).toBe("locked");
    expect(sessions).toEqual([]);
    expect(database.failures(email)).toBe(LOCKOUT_LIMIT);
    expect(database.attempts.some((row) => row.success)).toBe(false);
  });

  it("does not create a session or record a failure when the password hash changes during bcrypt", async () => {
    database.users.push(account());
    const outcome = await signIn(email, start, () => {
      const user = database.users[0];
      if (user) user.password = "replaced-hash";
      return true;
    });
    expect(outcome.kind).toBe("failure");
    expect(sessions).toEqual([]);
    expect(database.failures(email)).toBe(0);
    expect(database.attempts).toEqual([]);
  });

  it("releases the checked-out client with the unlock error before bcrypt", async () => {
    database.users.push(account());
    database.failSql = "pg_advisory_unlock";
    const outcome = await signIn(email, start, () => false);
    expect(outcome.kind).toBe("failure");
    const bcryptAt = database.events.indexOf("bcrypt");
    const destroyed = database.events.indexOf("release:error");
    expect(destroyed).toBeGreaterThan(-1);
    expect(destroyed).toBeLessThan(bcryptAt);
    expect(database.checkedOut()).toBe(0);
    expect(database.heldLocks()).toBe(0);
    expect(database.failures(email)).toBe(1);
  });

  it("releases the connection when the failure count query fails and does not compare the password", async () => {
    database.users.push(account());
    database.failSql = "COUNT(*)";
    await expect(signIn(email, start, () => true)).rejects.toThrow("sql failed: COUNT(*)");
    expect(database.events).not.toContain("bcrypt");
    expect(database.events).toContain("release");
    expect(database.checkedOut()).toBe(0);
    expect(database.heldLocks()).toBe(0);
    expect(sessions).toEqual([]);
    expect(database.failures(email)).toBe(0);
  });

  it("does not leak a connection when opening the pool fails", async () => {
    database.users.push(account());
    db.connect.mockImplementation(async () => {
      throw new Error("connect failed");
    });
    await expect(signIn(email, start, () => true)).rejects.toThrow("connect failed");
    expect(database.events).not.toContain("bcrypt");
    expect(database.checkedOut()).toBe(0);
    expect(sessions).toEqual([]);
  });

  it("rolls the success write back when commit fails and does not leave the connection checked out", async () => {
    seed(1);
    database.failSql = "COMMIT";
    await expect(signIn(email, start, () => true)).rejects.toThrow("sql failed: COMMIT");
    expect(database.events).toContain("ROLLBACK");
    expect(database.failures(email)).toBe(1);
    expect(database.attempts.some((row) => row.success)).toBe(false);
    expect(database.checkedOut()).toBe(0);
    expect(database.heldLocks()).toBe(0);
    expect(sessions).toEqual([]);
  });
});

describe("account advisory lock", () => {
  it("locks and unlocks around the attempt, including when the attempt throws", async () => {
    const queries: string[][] = [];
    const client = {
      query: vi.fn(async (sql: string, values?: readonly unknown[]) => {
        queries.push([sql, ...(values ?? []).map(String)]);
      }),
      release: vi.fn(),
    };
    await withAdvisoryLoginLock("User@Example.com", async () => client, async () => undefined);
    await expect(
      withAdvisoryLoginLock("user@example.com", async () => client, async () => {
        throw new Error("attempt failed");
      }),
    ).rejects.toThrow("attempt failed");
    expect(queries.map((query) => query[0])).toEqual([
      "SELECT pg_advisory_lock($1::int4, $2::int4)",
      "SELECT pg_advisory_unlock($1::int4, $2::int4)",
      "SELECT pg_advisory_lock($1::int4, $2::int4)",
      "SELECT pg_advisory_unlock($1::int4, $2::int4)",
    ]);
    expect(queries[0]?.slice(1)).toEqual(queries[2]?.slice(1));
    expect(client.release).toHaveBeenCalledTimes(2);
    expect(client.release).toHaveBeenNthCalledWith(1);
    expect(client.release).toHaveBeenNthCalledWith(2);
  });

  it("drops the connection when the advisory unlock fails", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("unlock")) throw new Error("unlock failed");
      }),
      release: vi.fn(),
    };
    await expect(withAdvisoryLoginLock("a@b.c", async () => client, async () => "signed-in")).resolves.toBe("signed-in");
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it("releases nothing when the pool cannot open a connection", async () => {
    const release = vi.fn();
    await expect(
      withAdvisoryLoginLock("a@b.c", async () => {
        throw new Error("connect failed");
      }, async () => undefined),
    ).rejects.toThrow("connect failed");
    expect(release).not.toHaveBeenCalled();
  });
});

describe("login action", () => {
  let database: FakeDatabase;
  let previousSecret: string | undefined;

  beforeEach(() => {
    db.connect.mockReset();
    db.sessionCreate.mockClear();
    db.auditCreate.mockClear();
    db.verify.mockReset();
    db.verify.mockImplementation(async (password: string, storedHash: string) => {
      database.events.push("bcrypt");
      expect(database.checkedOut()).toBe(0);
      expect(database.heldLocks()).toBe(0);
      if (!storedHash || !password) return false;
      return password === "correct" && storedHash === "stored-hash";
    });
    database = installDatabase([account()]);
    previousSecret = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "test-secret-test-secret-test-secret";
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousSecret;
  });

  function form(password: string, address = "User@Example.com"): FormData {
    const body = new FormData();
    body.set("email", address);
    body.set("password", password);
    return body;
  }

  it("returns the generic error for an unknown email, a wrong password, an inactive account, and a changed hash", async () => {
    database.users.length = 0;
    await expect(loginAction(undefined, form("correct", "missing@example.com"))).resolves.toEqual({ error: GENERIC_ERROR });
    expect(db.verify).not.toHaveBeenCalled();
    expect(database.failures("missing@example.com")).toBe(1);

    database.users.push(account());
    await expect(loginAction(undefined, form("wrong"))).resolves.toEqual({ error: GENERIC_ERROR });
    expect(database.failures("user@example.com")).toBe(1);

    const inactive = database.users[0];
    if (inactive) inactive.status = "B";
    await expect(loginAction(undefined, form("correct"))).resolves.toEqual({ error: GENERIC_ERROR });
    expect(db.verify).toHaveBeenCalled();
    expect(database.failures("user@example.com")).toBe(2);

    if (inactive) inactive.status = "A";
    db.verify.mockImplementationOnce(async () => {
      database.events.push("bcrypt");
      expect(database.checkedOut()).toBe(0);
      if (database.users[0]) database.users[0].password = "replaced-hash";
      return true;
    });
    const before = database.failures("user@example.com");
    await expect(loginAction(undefined, form("correct"))).resolves.toEqual({ error: GENERIC_ERROR });
    expect(database.failures("user@example.com")).toBe(before);
    expect(db.sessionCreate).not.toHaveBeenCalled();
  });

  it("returns the lockout message and does not create a session when the final recheck is locked", async () => {
    const at = Date.now();
    for (let index = 0; index < LOCKOUT_LIMIT - 1; index += 1) database.attempts.push(failureAt("user@example.com", at));
    db.verify.mockImplementationOnce(async () => {
      database.events.push("bcrypt");
      database.attempts.push(failureAt("user@example.com", at));
      return true;
    });
    await expect(loginAction(undefined, form("correct"))).resolves.toEqual({ error: LOCKOUT_MESSAGE });
    expect(db.sessionCreate).not.toHaveBeenCalled();
    expect(database.failures("user@example.com")).toBe(LOCKOUT_LIMIT);
  });

  it("creates the session only after the locked success decision commits", async () => {
    const outcome = loginAction(undefined, form("correct"));
    await expect(outcome).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect(db.sessionCreate).toHaveBeenCalledTimes(1);
    const created = db.sessionCreate.mock.calls[0]?.[0];
    expect(created?.data.userId).toBe(9);
    expect(created?.data.password).toBeUndefined();
    expect(db.auditCreate).toHaveBeenCalledTimes(1);
    const commitAt = database.events.indexOf("COMMIT");
    const bcryptAt = database.events.indexOf("bcrypt");
    expect(bcryptAt).toBeGreaterThan(-1);
    expect(commitAt).toBeGreaterThan(bcryptAt);
    expect(database.checkedOut()).toBe(0);
    expect(database.heldLocks()).toBe(0);
  });
});
