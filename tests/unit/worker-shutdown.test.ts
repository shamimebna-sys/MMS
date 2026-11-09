import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runWorkerLoop, type ExecuteClaim, type JobStore } from "@/server/jobs/runner";
import { bindWorkerSignals, createWorkerShutdown, runGuardedWorker } from "@/server/jobs/worker-lifecycle";

const lockedAt = new Date("2026-11-06T00:00:00.000Z");

function claim(id: string): ExecuteClaim {
  return {
    kind: "execute",
    id,
    type: "export_excel",
    payload: {},
    attempts: 1,
    maxAttempts: 5,
    lockedAt,
    result: null,
    lastError: null,
  };
}

function storeOf(claimJob: () => Promise<ExecuteClaim | null>, finish: () => Promise<boolean>): JobStore {
  return {
    claim: claimJob,
    heartbeat: async (job) => job.lockedAt,
    recordProgress: async (job, result) => ({ lockedAt: job.lockedAt, result }),
    finish,
  };
}

describe("worker shutdown", () => {
  it("finishes the current job and does not claim another after shutdown", async () => {
    const shutdown = createWorkerShutdown(async () => undefined, 1_000);
    let claims = 0;
    let finishes = 0;
    let slept = 0;
    const loop = runWorkerLoop({
      store: storeOf(
        async () => {
          claims += 1;
          return claim(String(claims));
        },
        async () => {
          finishes += 1;
          return true;
        },
      ),
      execute: async () => {
        void shutdown.requestShutdown();
        return { rows: 1 };
      },
      once: false,
      signal: shutdown.signal,
      sleep: async () => {
        slept += 1;
      },
      log: () => undefined,
    });
    const closed = runGuardedWorker(loop, shutdown, () => undefined);
    await closed;
    expect(claims).toBe(1);
    expect(finishes).toBe(1);
    expect(slept).toBe(0);
  });

  it("does not claim work when shutdown was already requested", async () => {
    let closes = 0;
    const shutdown = createWorkerShutdown(async () => {
      closes += 1;
    }, 1_000);
    const pending = shutdown.requestShutdown();
    let claims = 0;
    const loop = runWorkerLoop({
      store: storeOf(async () => {
        claims += 1;
        return null;
      }, async () => false),
      execute: async () => ({}),
      once: false,
      signal: shutdown.signal,
      sleep: async () => undefined,
      log: () => undefined,
    });
    shutdown.bind(loop);
    await loop;
    await pending;
    expect(claims).toBe(0);
    expect(closes).toBe(1);
    await shutdown.requestShutdown();
    expect(closes).toBe(1);
  });

  it("closes once after the drain bound when in-flight work does not finish", async () => {
    let closes = 0;
    const shutdown = createWorkerShutdown(async () => {
      closes += 1;
    }, 30);
    let release: (() => void) | undefined;
    const loop = new Promise<void>((resolve) => {
      release = resolve;
    });
    shutdown.bind(loop);
    await expect(shutdown.requestShutdown()).rejects.toThrow("Worker drain timed out after 30ms");
    expect(closes).toBe(1);
    await expect(shutdown.requestShutdown()).rejects.toThrow("Worker drain timed out after 30ms");
    expect(closes).toBe(1);
    release?.();
  });

  it("runs SIGINT and SIGTERM shutdown once", async () => {
    const exits: number[] = [];
    let closes = 0;
    const shutdown = createWorkerShutdown(async () => {
      closes += 1;
    }, 1_000);
    shutdown.bind(Promise.resolve());
    const emitter = new EventEmitter();
    bindWorkerSignals(
      emitter,
      () => shutdown.requestShutdown(),
      (code) => exits.push(code),
      () => undefined,
    );
    emitter.emit("SIGINT");
    emitter.emit("SIGTERM");
    emitter.emit("SIGINT");
    await shutdown.requestShutdown();
    await new Promise((resolve) => setImmediate(resolve));
    expect(closes).toBe(1);
    expect(exits).toEqual([0]);
  });

  it("keeps the loop failure when shutdown also fails", async () => {
    const shutdown = createWorkerShutdown(async () => {
      throw new Error("close failed");
    }, 1_000);
    let rejectLoop: ((error: Error) => void) | undefined;
    const loop = new Promise<void>((_, reject) => {
      rejectLoop = reject;
    });
    const logs: string[] = [];
    const running = runGuardedWorker(loop, shutdown, (message) => logs.push(message));
    rejectLoop?.(new Error("loop failed"));
    const failure = await running.then(
      () => {
        throw new Error("worker should have failed");
      },
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("loop failed");
    expect((failure as Error).cause).toBeInstanceOf(Error);
    expect(((failure as Error).cause as Error).message).toBe("close failed");
    expect(logs).toEqual([]);
  });

  it("wires the worker process to one shared shutdown path", () => {
    const worker = readFileSync(path.join(process.cwd(), "scripts/jobs/worker.ts"), "utf8");
    const lifecycle = readFileSync(path.join(process.cwd(), "src/server/jobs/worker-lifecycle.ts"), "utf8");
    const bootstrap = readFileSync(path.join(process.cwd(), "scripts/dev/bootstrap-admin.ts"), "utf8");
    expect(worker).toContain("bindWorkerSignals");
    expect(worker).toContain("closeDb()");
    expect(worker).toContain("runExternalEffect");
    expect(worker).toContain("runIdempotentInternal");
    expect(worker).not.toMatch(/pool\.end\(/);
    expect(worker).not.toMatch(/Date\.now|new Date\(\)/);
    expect(lifecycle).toContain('"SIGINT"');
    expect(lifecycle).toContain('"SIGTERM"');
    expect(bootstrap).toContain("closeDb()");
    expect(bootstrap).toContain("finally");
    expect(bootstrap).not.toMatch(/pool\.end\(/);
  });
});
