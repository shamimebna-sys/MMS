/** Lease and retry rules for the jobs table. Clock comparisons belong in SQL `NOW()`. */

export const LEASE_SECONDS = 300;
/** How often a long export asks the database to extend its lease. The lease itself is still `NOW()`. */
export const LEASE_RENEW_MS = 60_000;
export const BACKOFF_CAP_MINUTES = 16;
export const PROTOCOL = "mp021";

export const UNCERTAIN_DELIVERY_ERROR = "uncertain_external_delivery";
export const STALE_EXHAUSTED_ERROR = "stale_job_exhausted";

/**
 * Handlers that call out of process. SMTP does not provide exactly-once delivery.
 * There is no SMS or campaign job type in this worker.
 */
export const EXTERNAL_JOB_TYPES = ["send_email"] as const;

export type ExternalPhase = "not_started" | "started" | "accepted" | "failed";

export type JobResult = {
  protocol?: string;
  idempotencyKey?: string;
  external?: ExternalPhase;
  internal?: "complete";
  delivered?: "smtp" | "file";
  file?: string;
  rows?: number;
};

export type RecoveryInput = {
  id: string;
  type: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  result: JobResult | null;
  lastError: string | null;
};

export type RecoveryAction = "run" | "complete" | "fail_uncertain" | "fail_exhausted";

export function isExternalJob(type: string): boolean {
  return (EXTERNAL_JOB_TYPES as readonly string[]).includes(type);
}

export function emailIdempotencyKey(jobId: string): string {
  return `job:${jobId}:send_email`;
}

export function exportIdempotencyKey(jobId: string, slug: string): string {
  return `job:${jobId}:export_excel:${slug}`;
}

export function exportArtifactName(jobId: string, slug: string): string {
  return `${jobId}-${slug}.xlsx`;
}

/** Matches FINISH_SQL: LEAST(POWER(2, attempts - 1), 16) minutes. Attempt 1 waits 1 minute. */
export function backoffMinutes(attempts: number): number {
  const exponent = Math.max(attempts - 1, 0);
  return Math.min(2 ** exponent, BACKOFF_CAP_MINUTES);
}

export function failureNote(reason: string, previous: string | null): string {
  const note = !previous || previous === reason ? reason : `${reason}; previous: ${previous}`;
  return note.slice(0, 500);
}

/**
 * A queued job is due when run_after <= the database clock.
 * A running job is stale when it has no lease or locked_at <= database clock - lease.
 * Done and failed rows are never claimable.
 */
export function isClaimable(
  job: { status: string; runAfter: Date; lockedAt: Date | null },
  dbNow: Date,
  leaseSeconds: number,
): boolean {
  if (job.status === "queued") return job.runAfter.getTime() <= dbNow.getTime();
  if (job.status !== "running") return false;
  if (!job.lockedAt) return true;
  return job.lockedAt.getTime() <= dbNow.getTime() - leaseSeconds * 1000;
}

/**
 * Do not treat every running row as safe to run again.
 * Accepted provider delivery, or a finished internal write, is completed.
 * `external = started` means the provider call began and the outcome was not recorded.
 * A running external job with no mp021 phase is a pre-marker crash: the provider may already have accepted it.
 */
export function decideRecovery(input: RecoveryInput): RecoveryAction {
  const external = input.result?.external;
  if (external === "accepted" || input.result?.internal === "complete") return "complete";
  if (external === "started") return "fail_uncertain";
  if (input.status === "running" && isExternalJob(input.type) && external !== "not_started" && external !== "failed") {
    return "fail_uncertain";
  }
  if (input.attempts >= input.maxAttempts) return "fail_exhausted";
  return "run";
}

/** Commit this before the handler runs so a crash before the provider call is distinguishable. */
export function nextRunResult(job: Pick<RecoveryInput, "id" | "type" | "result">): JobResult | null {
  if (!isExternalJob(job.type)) return job.result;
  return {
    protocol: PROTOCOL,
    idempotencyKey: job.result?.idempotencyKey ?? emailIdempotencyKey(job.id),
    external: "not_started",
  };
}

export const CLAIM_CANDIDATE_SQL = `
SELECT id::text, type, payload, status, attempts, max_attempts, result, locked_at, last_error
FROM jobs
WHERE (
  status = 'queued' AND run_after <= NOW()
) OR (
  status = 'running'
  AND (locked_at IS NULL OR locked_at <= NOW() - ($1::int * INTERVAL '1 second'))
)
ORDER BY id
FOR UPDATE SKIP LOCKED
LIMIT 1
`.trim();

/** Millisecond truncation keeps the lease token equal after a JavaScript Date round-trip. */
const LEASE_NOW = "date_trunc('milliseconds', NOW())";

export const APPLY_RUN_SQL = `
UPDATE jobs
SET status = 'running',
    locked_at = ${LEASE_NOW},
    attempts = attempts + 1,
    result = $2::jsonb,
    updated_at = NOW()
WHERE id = $1::bigint
  AND status IN ('queued', 'running')
RETURNING id::text, type, payload, attempts, max_attempts, locked_at, result, last_error
`.trim();

export const APPLY_COMPLETE_SQL = `
UPDATE jobs
SET status = 'done',
    locked_at = NULL,
    last_error = NULL,
    updated_at = NOW()
WHERE id = $1::bigint
  AND status IN ('queued', 'running')
RETURNING id::text
`.trim();

export const APPLY_FAIL_SQL = `
UPDATE jobs
SET status = 'failed',
    locked_at = NULL,
    last_error = $2,
    updated_at = NOW()
WHERE id = $1::bigint
  AND status IN ('queued', 'running')
RETURNING id::text
`.trim();

export const HEARTBEAT_SQL = `
UPDATE jobs
SET locked_at = ${LEASE_NOW},
    updated_at = NOW()
WHERE id = $1::bigint
  AND status = 'running'
  AND locked_at = $2::timestamptz
RETURNING locked_at
`.trim();

export const PROGRESS_SQL = `
UPDATE jobs
SET result = $3::jsonb,
    locked_at = ${LEASE_NOW},
    updated_at = NOW()
WHERE id = $1::bigint
  AND status = 'running'
  AND locked_at = $2::timestamptz
RETURNING locked_at, result
`.trim();

export const FINISH_SQL = `
UPDATE jobs
SET status = $2,
    result = COALESCE($3::jsonb, result),
    last_error = $4,
    locked_at = NULL,
    run_after = CASE
      WHEN $5::boolean THEN NOW() + ($7::int * INTERVAL '1 minute')
      ELSE run_after
    END,
    updated_at = NOW()
WHERE id = $1::bigint
  AND status = 'running'
  AND locked_at = $6::timestamptz
RETURNING id::text, status, attempts, run_after
`.trim();
