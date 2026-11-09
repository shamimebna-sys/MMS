import type { PoolClient } from "pg";
import {
  withAdvisoryLoginLock,
  type LockClient,
  type LoginAccount,
  type LoginAttemptDb,
  type LoginAttemptStore,
} from "@/lib/auth/lockout";
import { pool } from "@/lib/db";

const COUNT_FAILURES = `SELECT COUNT(*)::int AS count
FROM login_attempts
WHERE email = $1 AND success = false AND created_at > $2`;

const READ_ACCOUNT = `SELECT u.id, u.password, u.status, u.candidate_id, r.name AS role_name
FROM users u
LEFT JOIN roles r ON r.id = u.role_id
WHERE LOWER(u.email) = LOWER($1)
ORDER BY u.id
LIMIT 1`;

const INSERT_ATTEMPT = `INSERT INTO login_attempts (email, ip, success, created_at)
VALUES ($1, $2, $3, $4)`;

const DELETE_FAILURES = `DELETE FROM login_attempts
WHERE email = $1 AND success = false`;

type SqlRow = Record<string, unknown>;

/**
 * One account attempt store. Each `locked` call checks out a connection, takes the session advisory lock,
 * runs its SQL on that same connection, then unlocks and releases it. Password comparison stays outside.
 */
export function createLoginAttemptStore(ip: string | null): LoginAttemptStore {
  return {
    locked(email, run) {
      return withAdvisoryLoginLock(email, connectLockedClient, (client) => run(attemptDb(client, ip)));
    },
  };
}

function connectLockedClient(): Promise<LockClient> {
  return pool.connect().then(adopt);
}

function adopt(client: PoolClient): LockClient {
  let discard: Error | undefined;
  return {
    query(sql, values) {
      return client.query(sql, (values ?? []) as never[]).then(
        (result) => result,
        (error: unknown) => {
          if (sql === "ROLLBACK") {
            discard = error instanceof Error ? error : new Error("Could not roll back the login attempt.");
          }
          throw error;
        },
      );
    },
    release(error) {
      client.release(error ?? discard);
    },
  };
}

function attemptDb(client: LockClient, ip: string | null): LoginAttemptDb {
  return {
    async countFailures(email, sinceMs) {
      const rows = await rowsOf(client, COUNT_FAILURES, [email, new Date(sinceMs)]);
      return countFrom(rows[0]?.count);
    },
    async readAccount(email) {
      const rows = await rowsOf(client, READ_ACCOUNT, [email]);
      return rows[0] ? mapAccount(rows[0]) : null;
    },
    async addFailure(email, atMs) {
      await client.query(INSERT_ATTEMPT, [email, ip, false, new Date(atMs)]);
    },
    async resetFailures(email, atMs) {
      await client.query("BEGIN");
      try {
        await client.query(DELETE_FAILURES, [email]);
        await client.query(INSERT_ATTEMPT, [email, ip, true, new Date(atMs)]);
        await client.query("COMMIT");
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // The connection may already be dead. The original error is the one to surface.
        }
        throw error;
      }
    },
  };
}

async function rowsOf(client: LockClient, sql: string, values: readonly unknown[]): Promise<SqlRow[]> {
  const result = (await client.query(sql, values)) as { rows?: SqlRow[] } | undefined;
  return result?.rows ?? [];
}

function countFrom(value: unknown): number {
  let count = Number.NaN;
  if (typeof value === "bigint" || typeof value === "number") count = Number(value);
  else if (typeof value === "string" && /^\d+$/.test(value)) count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("Login failure count is invalid.");
  return count;
}

function mapAccount(row: SqlRow): LoginAccount {
  const passwordHash = row.password;
  if (typeof passwordHash !== "string") throw new Error("Login password hash is invalid.");
  return {
    id: requiredId(row.id),
    passwordHash,
    status: typeof row.status === "string" ? row.status : null,
    roleName: typeof row.role_name === "string" ? row.role_name : null,
    candidateId: optionalId(row.candidate_id),
  };
}

function requiredId(value: unknown): number {
  const id = integerOf(value);
  if (id == null || id <= 0) throw new Error("Login user id is invalid.");
  return id;
}

function optionalId(value: unknown): number | null {
  if (value == null) return null;
  const id = integerOf(value);
  if (id == null) throw new Error("Login candidate id is invalid.");
  return id;
}

function integerOf(value: unknown): number | null {
  if (typeof value === "bigint" && value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return null;
}
