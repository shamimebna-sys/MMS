import {
  APPLY_COMPLETE_SQL,
  APPLY_FAIL_SQL,
  APPLY_RUN_SQL,
  CLAIM_CANDIDATE_SQL,
  FINISH_SQL,
  HEARTBEAT_SQL,
  LEASE_RENEW_MS,
  LEASE_SECONDS,
  PROGRESS_SQL,
  STALE_EXHAUSTED_ERROR,
  UNCERTAIN_DELIVERY_ERROR,
  backoffMinutes,
  decideRecovery,
  failureNote,
  nextRunResult,
  type JobResult,
  type RecoveryInput,
} from "@/server/jobs/lifecycle";

export class LeaseLostError extends Error {
  constructor() {
    super("job_lease_lost");
    this.name = "LeaseLostError";
  }
}

export type QueryResult = { rows: Array<Record<string, unknown>>; rowCount?: number | null };

export type QueryClient = {
  query: (text: string, values?: readonly unknown[]) => Promise<QueryResult>;
  release: () => void;
};

export type JobPool = {
  connect: () => Promise<QueryClient>;
};

export type ExecuteClaim = {
  kind: "execute";
  id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  lockedAt: Date;
  result: JobResult | null;
  lastError: string | null;
};

export type ResolvedClaim = {
  kind: "resolved";
  id: string;
  status: "done" | "failed";
};

export type ClaimResult = ExecuteClaim | ResolvedClaim | null;

export type JobStore = {
  claim: () => Promise<ClaimResult>;
  heartbeat: (job: ExecuteClaim) => Promise<Date | null>;
  recordProgress: (job: ExecuteClaim, result: JobResult) => Promise<{ lockedAt: Date; result: JobResult } | null>;
  finish: (job: ExecuteClaim, result: JobResult | null, error: string | null, retry: boolean) => Promise<boolean>;
};

export type JobExecutor = (job: ExecuteClaim, store: JobStore) => Promise<JobResult>;

type Log = (message: string) => void;

async function withTransaction<T>(pool: JobPool, fn: (client: QueryClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The connection may already be dead. The original error is the one to surface.
    }
    throw error;
  } finally {
    client.release();
  }
}

function jsonParam(result: JobResult | null): string | null {
  return result == null ? null : JSON.stringify(result);
}

function asInt(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error("job counter is invalid");
  return parsed;
}

function asDate(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new Error("job timestamp is invalid");
  return parsed;
}

function asResult(value: unknown): JobResult | null {
  if (value == null) return null;
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed as JobResult;
}

function asPayload(value: unknown): Record<string, unknown> {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}

function mapCandidate(row: Record<string, unknown>): RecoveryInput {
  return {
    id: String(row.id),
    type: String(row.type),
    status: String(row.status),
    attempts: asInt(row.attempts),
    maxAttempts: asInt(row.max_attempts),
    result: asResult(row.result),
    lastError: row.last_error == null ? null : String(row.last_error),
  };
}

function mapExecute(row: Record<string, unknown>): ExecuteClaim {
  return {
    kind: "execute",
    id: String(row.id),
    type: String(row.type),
    payload: asPayload(row.payload),
    attempts: asInt(row.attempts),
    maxAttempts: asInt(row.max_attempts),
    lockedAt: asDate(row.locked_at),
    result: asResult(row.result),
    lastError: row.last_error == null ? null : String(row.last_error),
  };
}

async function claim(pool: JobPool, leaseSeconds: number): Promise<ClaimResult> {
  return withTransaction(pool, async (client) => {
    const selected = await client.query(CLAIM_CANDIDATE_SQL, [leaseSeconds]);
    const row = selected.rows[0];
    if (!row) return null;
    const current = mapCandidate(row);
    const decision = decideRecovery(current);
    if (decision === "run") {
      const updated = await client.query(APPLY_RUN_SQL, [current.id, jsonParam(nextRunResult(current))]);
      if (updated.rows.length === 0) throw new Error("job claim did not update");
      return mapExecute(updated.rows[0]);
    }
    if (decision === "complete") {
      const updated = await client.query(APPLY_COMPLETE_SQL, [current.id]);
      if (updated.rows.length === 0) throw new Error("job claim did not update");
      return { kind: "resolved", id: current.id, status: "done" };
    }
    const reason = decision === "fail_uncertain" ? UNCERTAIN_DELIVERY_ERROR : STALE_EXHAUSTED_ERROR;
    const updated = await client.query(APPLY_FAIL_SQL, [current.id, failureNote(reason, current.lastError)]);
    if (updated.rows.length === 0) throw new Error("job claim did not update");
    return { kind: "resolved", id: current.id, status: "failed" };
  });
}

async function heartbeat(pool: JobPool, job: ExecuteClaim): Promise<Date | null> {
  const updated = await withTransaction(pool, (client) => client.query(HEARTBEAT_SQL, [job.id, job.lockedAt]));
  const lockedAt = updated.rows[0]?.locked_at;
  return lockedAt == null ? null : asDate(lockedAt);
}

async function recordProgress(
  pool: JobPool,
  job: ExecuteClaim,
  result: JobResult,
): Promise<{ lockedAt: Date; result: JobResult } | null> {
  const updated = await withTransaction(pool, (client) =>
    client.query(PROGRESS_SQL, [job.id, job.lockedAt, JSON.stringify(result)]),
  );
  if (updated.rows.length === 0) return null;
  return {
    lockedAt: asDate(updated.rows[0]?.locked_at),
    result: asResult(updated.rows[0]?.result) ?? result,
  };
}

async function finish(pool: JobPool, job: ExecuteClaim, result: JobResult | null, error: string | null, retry: boolean): Promise<boolean> {
  if (error === null && retry) throw new Error("successful jobs are not retried");
  const status = error === null ? "done" : retry ? "queued" : "failed";
  const minutes = retry ? backoffMinutes(job.attempts) : 0;
  const updated = await withTransaction(pool, (client) =>
    client.query(FINISH_SQL, [job.id, status, jsonParam(result), error, retry, job.lockedAt, minutes]),
  );
  return updated.rows.length > 0;
}

export function createJobStore(pool: JobPool, leaseSeconds = LEASE_SECONDS): JobStore {
  return {
    claim: () => claim(pool, leaseSeconds),
    heartbeat: (job) => heartbeat(pool, job),
    recordProgress: (job, result) => recordProgress(pool, job, result),
    finish: (job, result, error, retry) => finish(pool, job, result, error, retry),
  };
}

async function holdLease(job: ExecuteClaim, store: JobStore): Promise<void> {
  const lockedAt = await store.heartbeat(job);
  if (!lockedAt) throw new LeaseLostError();
  job.lockedAt = lockedAt;
}

/**
 * Extends the lease while `work` is in progress, then checks it once more.
 * A lost lease throws before the caller is allowed to publish the result.
 */
export async function holdLeaseDuring<T>(
  job: ExecuteClaim,
  store: JobStore,
  work: () => Promise<T>,
  renewEveryMs = LEASE_RENEW_MS,
): Promise<T> {
  let lost = false;
  let renewing: Promise<void> | null = null;
  const renew = (): Promise<void> => {
    if (!renewing) {
      renewing = store
        .heartbeat(job)
        .then((lockedAt) => {
          if (!lockedAt) lost = true;
          else job.lockedAt = lockedAt;
        })
        .finally(() => {
          renewing = null;
        });
    }
    return renewing;
  };
  const timer = setInterval(() => {
    void renew().catch(() => {
      lost = true;
    });
  }, renewEveryMs);
  timer.unref?.();
  try {
    const value = await work();
    await renew().catch(() => {
      lost = true;
    });
    if (lost) throw new LeaseLostError();
    return value;
  } finally {
    clearInterval(timer);
  }
}

/**
 * Records `started` and commits it before `effect`. A resolved effect is recorded as `accepted`.
 * A thrown effect is an observed failure and may be retried. A crash after `started` is not.
 */
export async function runExternalEffect(
  job: ExecuteClaim,
  store: JobStore,
  idempotencyKey: string,
  effect: () => Promise<Pick<JobResult, "delivered">>,
): Promise<JobResult> {
  if (job.result?.external === "started" || job.result?.external === "accepted") throw new LeaseLostError();
  await holdLease(job, store);
  const started = await store.recordProgress(job, {
    ...(job.result ?? {}),
    idempotencyKey,
    external: "started",
  });
  if (!started) throw new LeaseLostError();
  job.lockedAt = started.lockedAt;
  job.result = started.result;

  let delivered: Pick<JobResult, "delivered">;
  try {
    delivered = await effect();
  } catch (error) {
    if (error instanceof LeaseLostError) throw error;
    const failed = await store.recordProgress(job, {
      ...(job.result ?? {}),
      idempotencyKey,
      external: "failed",
    });
    if (!failed) throw new LeaseLostError();
    job.lockedAt = failed.lockedAt;
    job.result = failed.result;
    throw error;
  }

  let accepted: { lockedAt: Date; result: JobResult } | null;
  try {
    accepted = await store.recordProgress(job, {
      ...started.result,
      ...delivered,
      idempotencyKey,
      external: "accepted",
    });
  } catch {
    throw new LeaseLostError();
  }
  if (!accepted) throw new LeaseLostError();
  job.lockedAt = accepted.lockedAt;
  job.result = accepted.result;
  return accepted.result;
}

/** Reuses one idempotency key and skips the effect once `internal = complete` is stored. */
export async function runIdempotentInternal(
  job: ExecuteClaim,
  store: JobStore,
  idempotencyKey: string,
  effect: () => Promise<JobResult>,
): Promise<JobResult> {
  if (job.result?.internal === "complete" && job.result.idempotencyKey === idempotencyKey) return job.result;
  await holdLease(job, store);
  const value = await effect();
  const recorded = await store.recordProgress(job, {
    ...value,
    idempotencyKey,
    internal: "complete",
  });
  if (!recorded) throw new LeaseLostError();
  job.lockedAt = recorded.lockedAt;
  job.result = recorded.result;
  return recorded.result;
}

export async function processOne(store: JobStore, execute: JobExecutor, log: Log = (message) => console.log(message)): Promise<boolean> {
  const claimed = await store.claim();
  if (!claimed) return false;
  if (claimed.kind === "resolved") {
    log(`job ${claimed.id} ${claimed.status} recovered`);
    return true;
  }

  try {
    const result = await execute(claimed, store);
    const saved = await store.finish(claimed, result, null, false);
    log(saved ? `job ${claimed.id} ${claimed.type} done` : `job ${claimed.id} ${claimed.type} lost its lease before completion was recorded`);
  } catch (error) {
    if (error instanceof LeaseLostError) {
      log(`job ${claimed.id} ${claimed.type} lost its lease`);
      return true;
    }
    if (claimed.result?.external === "accepted" || claimed.result?.internal === "complete") {
      const saved = await store.finish(claimed, claimed.result, null, false);
      log(saved ? `job ${claimed.id} ${claimed.type} done` : `job ${claimed.id} ${claimed.type} lost its lease before completion was recorded`);
      return true;
    }
    if (claimed.result?.external === "started") {
      const note = failureNote(UNCERTAIN_DELIVERY_ERROR, claimed.lastError);
      const saved = await store.finish(claimed, claimed.result, note, false);
      log(saved ? `job ${claimed.id} ${claimed.type} uncertain` : `job ${claimed.id} ${claimed.type} lost its lease`);
      return true;
    }
    const message = error instanceof Error ? error.message.slice(0, 500) : "job_failed";
    const retry = claimed.attempts < claimed.maxAttempts;
    const saved = await store.finish(claimed, null, failureNote(message, claimed.lastError), retry);
    log(saved ? `job ${claimed.id} ${claimed.type} error` : `job ${claimed.id} ${claimed.type} lost its lease while recording failure`);
  }
  return true;
}

export async function runWorkerLoop(options: {
  store: JobStore;
  execute: JobExecutor;
  once: boolean;
  sleep?: (ms: number) => Promise<void>;
  log?: Log;
  signal?: AbortSignal;
}): Promise<void> {
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const log = options.log ?? ((message) => console.log(message));
  const signal = options.signal;
  do {
    if (signal?.aborted) break;
    const worked = await processOne(options.store, options.execute, log);
    if (options.once || signal?.aborted) break;
    if (!worked) await sleep(2000);
  } while (!options.once);
}
