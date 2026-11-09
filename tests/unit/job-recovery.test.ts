import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPLY_RUN_SQL,
  CLAIM_CANDIDATE_SQL,
  FINISH_SQL,
  HEARTBEAT_SQL,
  LEASE_RENEW_MS,
  LEASE_SECONDS,
  PROGRESS_SQL,
  UNCERTAIN_DELIVERY_ERROR,
  backoffMinutes,
  decideRecovery,
  emailIdempotencyKey,
  exportArtifactName,
  exportIdempotencyKey,
  failureNote,
  isClaimable,
  type JobResult,
} from "@/server/jobs/lifecycle";
import {
  LeaseLostError,
  createJobStore,
  holdLeaseDuring,
  processOne,
  runExternalEffect,
  runIdempotentInternal,
  runWorkerLoop,
  type ClaimResult,
  type ExecuteClaim,
  type JobPool,
  type JobStore,
  type QueryClient,
  type QueryResult,
} from "@/server/jobs/runner";

const silent = () => {};

type JobRow = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  maxAttempts: number;
  runAfter: Date;
  lockedAt: Date | null;
  lastError: string | null;
  result: JobResult | null;
  createdAt: Date;
  updatedAt: Date;
};

class FakeJobs {
  now = new Date("2026-11-06T00:00:00.000Z");
  rows: JobRow[] = [];
  locks = new Map<string, FakeClient>();
  private nextId = 1;

  insert(input: Partial<JobRow> & { type: string }): JobRow {
    const id = input.id ?? String(this.nextId++);
    if (Number(id) >= this.nextId) this.nextId = Number(id) + 1;
    const row: JobRow = {
      id,
      type: input.type,
      payload: { ...(input.payload ?? {}) },
      status: input.status ?? "queued",
      attempts: input.attempts ?? 0,
      maxAttempts: input.maxAttempts ?? 5,
      runAfter: input.runAfter ? new Date(input.runAfter) : new Date(this.now),
      lockedAt: input.lockedAt ? new Date(input.lockedAt) : null,
      lastError: input.lastError ?? null,
      result: input.result ? { ...input.result } : null,
      createdAt: new Date(this.now),
      updatedAt: new Date(this.now),
    };
    this.rows.push(row);
    return row;
  }

  only(): JobRow {
    if (this.rows.length !== 1) throw new Error(`expected 1 job, found ${this.rows.length}`);
    return this.rows[0];
  }

  advance(ms: number): void {
    this.now = new Date(this.now.getTime() + ms);
  }

  setNow(value: Date): void {
    this.now = new Date(value);
  }

  execute(client: FakeClient, text: string, values: readonly unknown[]): QueryResult {
    if (text === "BEGIN") {
      if (client.open) throw new Error("transaction already open");
      client.open = true;
      client.snapshot = cloneRows(this.rows);
      return { rows: [] };
    }
    if (text === "COMMIT") {
      if (!client.open) throw new Error("commit without transaction");
      client.open = false;
      client.snapshot = null;
      this.releaseLocks(client);
      return { rows: [] };
    }
    if (text === "ROLLBACK") {
      if (!client.open) return { rows: [] };
      if (client.snapshot) this.rows = client.snapshot;
      client.open = false;
      client.snapshot = null;
      this.releaseLocks(client);
      return { rows: [] };
    }
    if (!client.open) throw new Error(`query outside transaction: ${text.slice(0, 80)}`);
    if (text === CLAIM_CANDIDATE_SQL) return this.claim(client, values);
    if (text === APPLY_RUN_SQL) return this.applyRun(values);
    if (text === FINISH_SQL) return this.finish(values);
    if (text === HEARTBEAT_SQL) return this.heartbeat(values);
    if (text === PROGRESS_SQL) return this.progress(values);
    if (text.startsWith("UPDATE jobs") && text.includes("status = 'done'")) return this.complete(values);
    if (text.startsWith("UPDATE jobs") && text.includes("status = 'failed'")) return this.fail(values);
    throw new Error(`unexpected sql: ${text}`);
  }

  private claim(client: FakeClient, values: readonly unknown[]): QueryResult {
    const leaseSeconds = Number(values[0]);
    const row = this.rows
      .filter((item) => isClaimable(item, this.now, leaseSeconds) && this.locks.get(item.id) !== client && !this.locks.has(item.id))
      .sort((left, right) => Number(left.id) - Number(right.id))[0];
    if (!row) return { rows: [] };
    this.locks.set(row.id, client);
    return { rows: [candidateRow(row)] };
  }

  private applyRun(values: readonly unknown[]): QueryResult {
    const row = this.byId(values[0]);
    if (!row || (row.status !== "queued" && row.status !== "running")) return { rows: [] };
    row.status = "running";
    row.lockedAt = new Date(this.now);
    row.attempts += 1;
    row.result = parseResult(values[1]);
    row.updatedAt = new Date(this.now);
    return { rows: [executeRow(row)] };
  }

  private complete(values: readonly unknown[]): QueryResult {
    const row = this.byId(values[0]);
    if (!row || (row.status !== "queued" && row.status !== "running")) return { rows: [] };
    row.status = "done";
    row.lockedAt = null;
    row.lastError = null;
    row.updatedAt = new Date(this.now);
    return { rows: [{ id: row.id }] };
  }

  private fail(values: readonly unknown[]): QueryResult {
    const row = this.byId(values[0]);
    if (!row || (row.status !== "queued" && row.status !== "running")) return { rows: [] };
    row.status = "failed";
    row.lockedAt = null;
    row.lastError = String(values[1]);
    row.updatedAt = new Date(this.now);
    return { rows: [{ id: row.id }] };
  }

  private heartbeat(values: readonly unknown[]): QueryResult {
    const row = this.owned(values[0], values[1]);
    if (!row) return { rows: [] };
    row.lockedAt = new Date(this.now);
    row.updatedAt = new Date(this.now);
    return { rows: [{ locked_at: new Date(row.lockedAt) }] };
  }

  private progress(values: readonly unknown[]): QueryResult {
    const row = this.owned(values[0], values[1]);
    if (!row) return { rows: [] };
    row.result = parseResult(values[2]);
    row.lockedAt = new Date(this.now);
    row.updatedAt = new Date(this.now);
    return { rows: [{ locked_at: new Date(row.lockedAt), result: row.result ? { ...row.result } : null }] };
  }

  private finish(values: readonly unknown[]): QueryResult {
    const row = this.owned(values[0], values[5]);
    if (!row) return { rows: [] };
    row.status = String(values[1]);
    if (values[2] != null) row.result = parseResult(values[2]);
    row.lastError = values[3] == null ? null : String(values[3]);
    row.lockedAt = null;
    if (values[4] === true) {
      const minutes = Number(values[6]);
      row.runAfter = new Date(this.now.getTime() + minutes * 60_000);
    }
    row.updatedAt = new Date(this.now);
    return { rows: [{ id: row.id, status: row.status, attempts: row.attempts, run_after: new Date(row.runAfter) }] };
  }

  private owned(id: unknown, lockedAt: unknown): JobRow | null {
    const row = this.byId(id);
    if (!row || row.status !== "running" || !sameTime(row.lockedAt, lockedAt)) return null;
    return row;
  }

  private byId(id: unknown): JobRow | undefined {
    return this.rows.find((row) => row.id === String(id));
  }

  private releaseLocks(client: FakeClient): void {
    for (const [id, owner] of this.locks) {
      if (owner === client) this.locks.delete(id);
    }
  }
}

class FakeClient implements QueryClient {
  open = false;
  snapshot: JobRow[] | null = null;

  constructor(private readonly db: FakeJobs) {}

  query(text: string, values?: readonly unknown[]): Promise<QueryResult> {
    return Promise.resolve(this.db.execute(this, text, values ?? []));
  }

  release(): void {
    if (this.open) this.db.execute(this, "ROLLBACK", []);
  }
}

class FakePool implements JobPool {
  constructor(private readonly db: FakeJobs) {}

  connect(): Promise<QueryClient> {
    return Promise.resolve(new FakeClient(this.db));
  }
}

function cloneRows(rows: JobRow[]): JobRow[] {
  return rows.map((row) => ({
    ...row,
    payload: { ...row.payload },
    result: row.result ? { ...row.result } : null,
    runAfter: new Date(row.runAfter),
    lockedAt: row.lockedAt ? new Date(row.lockedAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }));
}

function parseResult(value: unknown): JobResult | null {
  if (value == null) return null;
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed as JobResult;
}

function sameTime(left: Date | null, value: unknown): boolean {
  if (!left || value == null) return false;
  const right = value instanceof Date ? value : new Date(String(value));
  return left.getTime() === right.getTime();
}

function candidateRow(row: JobRow): Record<string, unknown> {
  return {
    id: row.id,
    type: row.type,
    payload: { ...row.payload },
    status: row.status,
    attempts: row.attempts,
    max_attempts: row.maxAttempts,
    result: row.result ? { ...row.result } : null,
    locked_at: row.lockedAt ? new Date(row.lockedAt) : null,
    last_error: row.lastError,
  };
}

function executeRow(row: JobRow): Record<string, unknown> {
  return {
    id: row.id,
    type: row.type,
    payload: { ...row.payload },
    attempts: row.attempts,
    max_attempts: row.maxAttempts,
    locked_at: row.lockedAt ? new Date(row.lockedAt) : null,
    result: row.result ? { ...row.result } : null,
    last_error: row.lastError,
  };
}

function mustExecute(claim: ClaimResult): ExecuteClaim {
  if (!claim || claim.kind !== "execute") throw new Error("expected a runnable job");
  return claim;
}

describe("job recovery", () => {
  let db: FakeJobs;
  let store: JobStore;

  beforeEach(() => {
    db = new FakeJobs();
    store = createJobStore(new FakePool(db));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps a crashed running job until its database lease expires, then runs it again", async () => {
    db.insert({ type: "export_excel", payload: { resource: "candidates", userId: 4 } });
    const crashed = mustExecute(await store.claim());
    expect(db.only().status).toBe("running");
    expect(db.only().attempts).toBe(1);
    expect(await store.claim()).toBeNull();

    db.advance(LEASE_SECONDS * 1000 - 1);
    expect(await processOne(store, async () => ({ file: "early.xlsx" }), silent)).toBe(false);
    expect(db.only().status).toBe("running");
    expect(db.only().id).toBe(crashed.id);

    db.advance(1);
    let runs = 0;
    expect(await processOne(store, async () => {
      runs += 1;
      return { file: exportArtifactName(crashed.id, "candidates"), rows: 2 };
    }, silent)).toBe(true);
    expect(runs).toBe(1);
    expect(db.only().status).toBe("done");
    expect(db.only().attempts).toBe(2);
    expect(db.rows).toHaveLength(1);
  });

  it("lets only one of two workers claim a job, and gives two jobs to two workers", async () => {
    db.insert({ type: "export_excel" });
    const [first, second] = await Promise.all([store.claim(), store.claim()]);
    const won = [first, second].filter((claim) => claim?.kind === "execute");
    expect(won).toHaveLength(1);
    expect([first, second].filter((claim) => claim === null)).toHaveLength(1);
    expect(db.only().status).toBe("running");
    expect(db.only().attempts).toBe(1);

    db.insert({ type: "export_excel" });
    db.insert({ type: "export_excel" });
    const pending = db.rows.filter((row) => row.status === "queued");
    expect(pending).toHaveLength(2);
    const [left, right] = await Promise.all([store.claim(), store.claim()]);
    expect(left?.kind).toBe("execute");
    expect(right?.kind).toBe("execute");
    if (left?.kind === "execute" && right?.kind === "execute") expect(left.id).not.toBe(right.id);
  });

  it("rejects a worker that no longer holds the lease token", async () => {
    db.insert({ type: "export_excel" });
    const claimed = mustExecute(await store.claim());
    const original = new Date(claimed.lockedAt);
    db.advance(5);
    const refreshed = await store.heartbeat(claimed);
    expect(refreshed?.getTime()).toBe(db.now.getTime());
    expect(await store.finish({ ...claimed, lockedAt: original }, { file: "stale.xlsx" }, null, false)).toBe(false);
    expect(db.only().status).toBe("running");
    claimed.lockedAt = refreshed ?? claimed.lockedAt;
    expect(await store.finish(claimed, { file: "fresh.xlsx", rows: 1 }, null, false)).toBe(true);
    expect(db.only().status).toBe("done");
    expect(db.only().result?.file).toBe("fresh.xlsx");
  });

  it("stops after the maximum attempts and keeps the failure on the same row", async () => {
    db.insert({ type: "export_excel", maxAttempts: 2 });
    let runs = 0;
    const fail = async () => {
      runs += 1;
      throw new Error("export failed");
    };
    await processOne(store, fail, silent);
    expect(db.only().status).toBe("queued");
    expect(db.only().attempts).toBe(1);
    db.setNow(db.only().runAfter);
    await processOne(store, fail, silent);
    expect(runs).toBe(2);
    expect(db.only().status).toBe("failed");
    expect(db.only().attempts).toBe(2);
    expect(db.only().lastError).toContain("export failed");
    db.advance(LEASE_SECONDS * 1000 + 16 * 60_000);
    expect(await processOne(store, fail, silent)).toBe(false);
    expect(runs).toBe(2);
    expect(db.rows).toHaveLength(1);

    const exhausted = new FakeJobs();
    const exhaustedStore = createJobStore(new FakePool(exhausted));
    exhausted.insert({
      id: "9",
      type: "send_email",
      status: "running",
      attempts: 5,
      maxAttempts: 5,
      lockedAt: new Date(exhausted.now.getTime() - LEASE_SECONDS * 1000),
      result: { protocol: "mp021", external: "not_started", idempotencyKey: emailIdempotencyKey("9") },
      payload: { to: "person@example.com" },
    });
    let sends = 0;
    await processOne(exhaustedStore, async () => {
      sends += 1;
      return {};
    }, silent);
    expect(sends).toBe(0);
    expect(exhausted.only().status).toBe("failed");
    expect(exhausted.only().attempts).toBe(5);
    expect(exhausted.only().lastError).toContain("stale_job_exhausted");
  });

  it("waits with exponential backoff measured from the database clock", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2099-01-01T00:00:00.000Z").getTime());
    db.insert({ type: "export_excel", maxAttempts: 5 });
    const delays: number[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await processOne(store, async () => {
        throw new Error("boom");
      }, silent);
      const row = db.only();
      expect(row.status).toBe("queued");
      delays.push(row.runAfter.getTime() - db.now.getTime());
      expect(row.runAfter.getUTCFullYear()).toBe(2026);
      const tooSoon = new Date(row.runAfter.getTime() - 1);
      db.setNow(tooSoon);
      expect(await store.claim()).toBeNull();
      db.setNow(row.runAfter);
    }
    expect(delays).toEqual([60_000, 120_000, 240_000]);
    expect(db.only().lastError).toContain("boom");
    expect(db.rows).toHaveLength(1);
  });

  it("retries an email that crashed before the provider call, and only sends once", async () => {
    db.insert({ type: "send_email", payload: { to: "person@example.com", subject: "Hello", text: "Body" } });
    const crashed = mustExecute(await store.claim());
    expect(crashed.result?.external).toBe("not_started");
    expect(crashed.result?.idempotencyKey).toBe(emailIdempotencyKey(crashed.id));
    db.advance(LEASE_SECONDS * 1000);

    let sends = 0;
    let phase = "";
    await processOne(store, async (job, active) => {
      const result = await runExternalEffect(job, active, emailIdempotencyKey(job.id), async () => {
        phase = job.result?.external ?? "";
        sends += 1;
        return { delivered: "smtp" };
      });
      return result;
    }, silent);
    expect(phase).toBe("started");
    expect(sends).toBe(1);
    expect(db.only().status).toBe("done");
    expect(db.only().result?.external).toBe("accepted");
    expect(db.only().result?.delivered).toBe("smtp");
    expect(await processOne(store, async () => {
      sends += 1;
      return {};
    }, silent)).toBe(false);
    expect(sends).toBe(1);
  });

  it("records completion without sending again when delivery was accepted before the crash", async () => {
    db.insert({ type: "send_email", payload: { to: "person@example.com", subject: "Hello", text: "Body" } });
    const claimed = mustExecute(await store.claim());
    let sends = 0;
    await runExternalEffect(claimed, store, emailIdempotencyKey(claimed.id), async () => {
      sends += 1;
      return { delivered: "smtp" };
    });
    expect(db.only().status).toBe("running");
    expect(db.only().result?.external).toBe("accepted");
    expect(db.only().result?.delivered).toBe("smtp");

    db.advance(LEASE_SECONDS * 1000);
    await processOne(store, async () => {
      sends += 1;
      return {};
    }, silent);
    expect(sends).toBe(1);
    expect(db.only().status).toBe("done");
    expect(db.only().attempts).toBe(1);
    expect(db.only().result?.delivered).toBe("smtp");
    expect(db.rows).toHaveLength(1);
  });

  it("does not retry when the provider may already have accepted and completion was not recorded", async () => {
    db.insert({ type: "send_email", payload: { to: "person@example.com", subject: "Hello", text: "Body" } });
    let sends = 0;
    await processOne(store, async (job, active) => runExternalEffect(job, active, emailIdempotencyKey(job.id), async () => {
      sends += 1;
      db.only().lockedAt = new Date(0);
      return { delivered: "smtp" };
    }), silent);
    expect(sends).toBe(1);
    expect(db.only().status).toBe("running");
    expect(db.only().result?.external).toBe("started");

    db.advance(LEASE_SECONDS * 1000);
    await processOne(store, async () => {
      sends += 1;
      return {};
    }, silent);
    expect(sends).toBe(1);
    expect(db.only().status).toBe("failed");
    expect(db.only().lastError).toContain(UNCERTAIN_DELIVERY_ERROR);
    expect(db.only().result?.external).toBe("started");
    expect(db.rows).toHaveLength(1);
  });

  it("retries an observed provider failure and keeps the previous error", async () => {
    db.insert({ type: "send_email", maxAttempts: 5, payload: { to: "person@example.com" } });
    let sends = 0;
    await processOne(store, async (job, active) => runExternalEffect(job, active, emailIdempotencyKey(job.id), async () => {
      sends += 1;
      throw new Error("smtp down");
    }), silent);
    expect(sends).toBe(1);
    expect(db.only().status).toBe("queued");
    expect(db.only().result?.external).toBe("failed");
    expect(db.only().lastError).toContain("smtp down");

    db.setNow(db.only().runAfter);
    await processOne(store, async (job, active) => runExternalEffect(job, active, emailIdempotencyKey(job.id), async () => {
      sends += 1;
      throw new Error("smtp down again");
    }), silent);
    expect(sends).toBe(2);
    expect(db.only().lastError).toContain("smtp down again");
    expect(db.only().lastError).toContain("smtp down");
    expect(db.rows).toHaveLength(1);
  });

  it("does not send again for a running email that has no delivery marker", async () => {
    db.insert({
      type: "send_email",
      status: "running",
      attempts: 1,
      lockedAt: new Date(db.now.getTime() - LEASE_SECONDS * 1000),
      lastError: "worker exited",
      payload: { to: "person@example.com", subject: "Hi", text: "Body" },
      result: null,
    });
    let sends = 0;
    await processOne(store, async () => {
      sends += 1;
      return {};
    }, silent);
    expect(sends).toBe(0);
    expect(db.only().status).toBe("failed");
    expect(db.only().attempts).toBe(1);
    expect(db.only().lastError).toContain(UNCERTAIN_DELIVERY_ERROR);
    expect(db.only().lastError).toContain("worker exited");
    expect(db.only().payload).toEqual({ to: "person@example.com", subject: "Hi", text: "Body" });

    db.insert({
      id: "8",
      type: "send_email",
      status: "running",
      attempts: 2,
      lockedAt: null,
      payload: { to: "other@example.com" },
      result: null,
    });
    await processOne(store, async () => {
      sends += 1;
      return {};
    }, silent);
    expect(sends).toBe(0);
    expect(db.rows.find((row) => row.id === "8")?.status).toBe("failed");
    expect(db.rows).toHaveLength(2);
  });

  it("writes an export once and reuses the same artifact name after a crash", async () => {
    db.insert({ type: "export_excel", payload: { resource: "candidates", userId: 4 } });
    const claimed = mustExecute(await store.claim());
    const names: string[] = [];
    await runIdempotentInternal(claimed, store, exportIdempotencyKey(claimed.id, "candidates"), async () => {
      const name = exportArtifactName(claimed.id, "candidates");
      names.push(name);
      return { file: name, rows: 4 };
    });
    expect(db.only().status).toBe("running");
    expect(db.only().result?.internal).toBe("complete");
    db.advance(LEASE_SECONDS * 1000);
    await processOne(store, async () => {
      names.push("second");
      return {};
    }, silent);
    expect(names).toEqual([`${claimed.id}-candidates.xlsx`]);
    expect(db.only().status).toBe("done");
    expect(db.only().result?.idempotencyKey).toBe(exportIdempotencyKey(claimed.id, "candidates"));
    expect(db.only().result?.rows).toBe(4);

    const retryDb = new FakeJobs();
    const retryStore = createJobStore(new FakePool(retryDb));
    retryDb.insert({ type: "export_excel", payload: { resource: "candidates" } });
    const abandoned = mustExecute(await retryStore.claim());
    retryDb.advance(LEASE_SECONDS * 1000);
    const rewritten: string[] = [];
    await processOne(retryStore, async (job, active) => runIdempotentInternal(job, active, exportIdempotencyKey(job.id, "candidates"), async () => {
      const name = exportArtifactName(job.id, "candidates");
      rewritten.push(name);
      return { file: name, rows: 2 };
    }), silent);
    expect(rewritten).toEqual([exportArtifactName(abandoned.id, "candidates")]);
    expect(await processOne(retryStore, async () => {
      rewritten.push("again");
      return {};
    }, silent)).toBe(false);
    expect(rewritten).toEqual([exportArtifactName(abandoned.id, "candidates")]);
    expect(retryDb.only().status).toBe("done");
  });

  it("uses the database clock for leases and backoff, not the application clock", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2099-01-01T00:00:00.000Z").getTime());
    db.insert({ type: "export_excel", runAfter: new Date(db.now.getTime() + 60_000) });
    expect(await store.claim()).toBeNull();
    db.setNow(db.only().runAfter);
    const claimed = mustExecute(await store.claim());
    expect(await store.claim()).toBeNull();
    expect(claimed.lockedAt.getUTCFullYear()).toBe(2026);
    db.advance(LEASE_SECONDS * 1000 - 1);
    expect(await store.claim()).toBeNull();

    const lifecycle = readFileSync(path.join(process.cwd(), "src/server/jobs/lifecycle.ts"), "utf8");
    const runner = readFileSync(path.join(process.cwd(), "src/server/jobs/runner.ts"), "utf8");
    const worker = readFileSync(path.join(process.cwd(), "scripts/jobs/worker.ts"), "utf8");
    expect(`${lifecycle}\n${runner}\n${worker}`).not.toMatch(/Date\.now|new Date\(\)/);
    expect(CLAIM_CANDIDATE_SQL).toContain("NOW()");
    expect(CLAIM_CANDIDATE_SQL).toContain("FOR UPDATE SKIP LOCKED");
    expect(CLAIM_CANDIDATE_SQL).toContain("locked_at IS NULL");
    expect(CLAIM_CANDIDATE_SQL).toContain("$1::int * INTERVAL '1 second'");
    expect(CLAIM_CANDIDATE_SQL).not.toContain("$2");
    expect(CLAIM_CANDIDATE_SQL).not.toContain("'done'");
    expect(CLAIM_CANDIDATE_SQL).not.toContain("'failed'");
    expect(APPLY_RUN_SQL).toContain("date_trunc('milliseconds', NOW())");
    expect(HEARTBEAT_SQL).toContain("date_trunc('milliseconds', NOW())");
    expect(HEARTBEAT_SQL).toContain("locked_at = $2::timestamptz");
    expect(PROGRESS_SQL).toContain("date_trunc('milliseconds', NOW())");
    expect(FINISH_SQL).toContain("status = 'running'");
    expect(FINISH_SQL).toContain("locked_at = $6::timestamptz");
    expect(FINISH_SQL).toContain("NOW() + ($7::int * INTERVAL '1 minute')");
    expect(worker).toContain("runExternalEffect");
    expect(worker).toContain("runIdempotentInternal");
  });

  it("does not run a finished job again and ignores a stale completion write", async () => {
    db.insert({ type: "export_excel" });
    const claimed = mustExecute(await store.claim());
    expect(await store.finish(claimed, { file: "1-export_excel.xlsx", rows: 3 }, null, false)).toBe(true);
    expect(await store.finish(claimed, { file: "other.xlsx" }, "late", true)).toBe(false);
    expect(db.only().status).toBe("done");
    expect(db.only().attempts).toBe(1);
    expect(db.only().result?.file).toBe("1-export_excel.xlsx");
    expect(db.only().lastError).toBeNull();
    db.advance(LEASE_SECONDS * 1000 * 20);
    expect(await store.claim()).toBeNull();
    expect(await processOne(store, async () => {
      throw new Error("should not run");
    }, silent)).toBe(false);
    expect(db.rows).toHaveLength(1);

    db.insert({ type: "export_excel", status: "failed", attempts: 5, maxAttempts: 5, lastError: "kept" });
    expect(await store.claim()).toBeNull();
    expect(db.rows).toHaveLength(2);
    expect(db.rows[1]?.lastError).toBe("kept");
  });

  it("refreshes the lease while export work is still running", async () => {
    const job: ExecuteClaim = {
      kind: "execute",
      id: "1",
      type: "export_excel",
      payload: {},
      attempts: 1,
      maxAttempts: 5,
      lockedAt: new Date("2026-11-06T00:00:00.000Z"),
      result: null,
      lastError: null,
    };
    let beats = 0;
    const store = {
      heartbeat: async () => {
        beats += 1;
        return new Date(job.lockedAt.getTime() + 1000);
      },
    } as unknown as JobStore;
    await holdLeaseDuring(job, store, () => new Promise((resolve) => setTimeout(resolve, 100)), 20);
    expect(beats).toBeGreaterThanOrEqual(2);
    expect(job.lockedAt.getTime()).toBeGreaterThan(new Date("2026-11-06T00:00:00.000Z").getTime());
    expect(LEASE_RENEW_MS).toBeLessThan(LEASE_SECONDS * 1000);

    const lost: ExecuteClaim = { ...job, lockedAt: new Date("2026-11-06T00:00:00.000Z") };
    await expect(
      holdLeaseDuring(lost, { heartbeat: async () => null } as unknown as JobStore, async () => "exported", 1000),
    ).rejects.toBeInstanceOf(LeaseLostError);
  });

  it("processes one queued job when the loop is asked to run once", async () => {
    db.insert({ type: "export_excel" });
    let slept = 0;
    await runWorkerLoop({
      store,
      once: true,
      execute: async () => ({ file: "once.xlsx", rows: 1 }),
      sleep: async () => {
        slept += 1;
      },
      log: silent,
    });
    expect(slept).toBe(0);
    expect(db.only().status).toBe("done");
  });
});

describe("job recovery decisions", () => {
  const base = { id: "1", attempts: 1, maxAttempts: 5, lastError: null };

  it("chooses a conservative action for each delivery phase", () => {
    expect(decideRecovery({ ...base, status: "running", type: "send_email", result: null })).toBe("fail_uncertain");
    expect(decideRecovery({ ...base, status: "running", type: "send_email", result: { external: "not_started" } })).toBe("run");
    expect(decideRecovery({ ...base, status: "running", type: "send_email", result: { external: "started" } })).toBe("fail_uncertain");
    expect(decideRecovery({ ...base, status: "running", type: "send_email", result: { external: "accepted" } })).toBe("complete");
    expect(decideRecovery({ ...base, status: "running", type: "send_email", result: { external: "failed" } })).toBe("run");
    expect(decideRecovery({ ...base, status: "running", type: "send_email", attempts: 5, result: { external: "not_started" } })).toBe("fail_exhausted");
    expect(decideRecovery({ ...base, status: "running", type: "export_excel", result: null })).toBe("run");
    expect(decideRecovery({ ...base, status: "running", type: "export_excel", result: { internal: "complete" } })).toBe("complete");
    expect(decideRecovery({ ...base, status: "queued", type: "send_email", result: null })).toBe("run");
    expect(decideRecovery({ ...base, status: "done", type: "send_email", result: { external: "accepted" } })).toBe("complete");
  });

  it("expires a lease only on the database clock", () => {
    const locked = new Date("2026-11-06T00:00:00.000Z");
    const almost = new Date(locked.getTime() + LEASE_SECONDS * 1000 - 1);
    const exact = new Date(locked.getTime() + LEASE_SECONDS * 1000);
    expect(isClaimable({ status: "running", runAfter: locked, lockedAt: locked }, almost, LEASE_SECONDS)).toBe(false);
    expect(isClaimable({ status: "running", runAfter: locked, lockedAt: locked }, exact, LEASE_SECONDS)).toBe(true);
    expect(isClaimable({ status: "running", runAfter: locked, lockedAt: null }, almost, LEASE_SECONDS)).toBe(true);
    expect(isClaimable({ status: "done", runAfter: locked, lockedAt: locked }, exact, LEASE_SECONDS)).toBe(false);
    expect(isClaimable({ status: "failed", runAfter: locked, lockedAt: null }, exact, LEASE_SECONDS)).toBe(false);
    expect(isClaimable({ status: "queued", runAfter: exact, lockedAt: null }, almost, LEASE_SECONDS)).toBe(false);
    expect(isClaimable({ status: "queued", runAfter: locked, lockedAt: null }, almost, LEASE_SECONDS)).toBe(true);
  });

  it("caps retry delay at 16 minutes", () => {
    expect(backoffMinutes(1)).toBe(1);
    expect(backoffMinutes(2)).toBe(2);
    expect(backoffMinutes(3)).toBe(4);
    expect(backoffMinutes(4)).toBe(8);
    expect(backoffMinutes(5)).toBe(16);
    expect(backoffMinutes(6)).toBe(16);
    expect(backoffMinutes(9)).toBe(16);
    expect(failureNote("same", "same")).toBe("same");
    expect(failureNote("uncertain_external_delivery", "x".repeat(600)).length).toBe(500);
    expect(exportArtifactName("15", "candidates")).toBe("15-candidates.xlsx");
  });
});
