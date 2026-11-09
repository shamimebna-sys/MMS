import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { performance } from "node:perf_hooks";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool, type PoolClient } from "pg";
import type { PrismaClient } from "@/generated/prisma/client";
import { DurationHistogram, HISTOGRAM_BUCKETS, HISTOGRAM_UPPER_MS } from "@/server/perf/histogram";
import { isPerfEnabled, perfWindowMs } from "@/server/perf/config";
import { safeMethod, safeRoute } from "@/server/perf/redact";
import { startEventLoopMonitor, stopEventLoopMonitor } from "@/server/perf/event-loop";
import {
  attachSharedPool,
  flushPerfLogs,
  installRequestInstrumentation,
  installServerPerf,
  instrumentPool,
  perfSnapshot,
  poolMetrics,
  resetPerfForTests,
  setPerfSink,
  startPerfRuntime,
  stopPerfRuntime,
  uninstallRequestInstrumentation,
} from "@/server/perf/runtime";

const UNIT_URL = "postgresql://mms_user:super-secret-db-password@127.0.0.1:1/mms_pool_unit";
const originalUrl = process.env.DATABASE_URL;
const originalEnv = process.env.NODE_ENV;
const originalFlag = process.env.PERF_INSTRUMENTATION;
const originalWindow = process.env.PERF_WINDOW_MS;
const originalSlowRequest = process.env.PERF_SLOW_REQUEST_MS;
const originalSlowQuery = process.env.PERF_SLOW_QUERY_MS;
const originalVitest = process.env.VITEST;

type DbModule = {
  pool: Pool;
  prisma: PrismaClient;
  closeDb: () => Promise<void>;
};

function clearDbGlobals(): void {
  const globalDb = globalThis as { pool?: Pool; prisma?: PrismaClient };
  delete globalDb.pool;
  delete globalDb.prisma;
}

function setNodeEnv(value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

function restoreEnv(): void {
  const env = process.env as Record<string, string | undefined>;
  if (originalUrl === undefined) delete env.DATABASE_URL;
  else env.DATABASE_URL = originalUrl;
  if (originalFlag === undefined) delete env.PERF_INSTRUMENTATION;
  else env.PERF_INSTRUMENTATION = originalFlag;
  if (originalWindow === undefined) delete env.PERF_WINDOW_MS;
  else env.PERF_WINDOW_MS = originalWindow;
  if (originalSlowRequest === undefined) delete env.PERF_SLOW_REQUEST_MS;
  else env.PERF_SLOW_REQUEST_MS = originalSlowRequest;
  if (originalSlowQuery === undefined) delete env.PERF_SLOW_QUERY_MS;
  else env.PERF_SLOW_QUERY_MS = originalSlowQuery;
  if (originalVitest === undefined) delete env.VITEST;
  else env.VITEST = originalVitest;
  setNodeEnv(originalEnv);
}

function adapterPool(prisma: PrismaClient): Pool | undefined {
  const client = prisma as PrismaClient & { _engineConfig?: { adapter?: { externalPool?: Pool } } };
  return client._engineConfig?.adapter?.externalPool;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Release = () => void;

function createClient(pool: Pool, onRelease: () => void, queryDelay: number, failure: { current: Error | null }): PoolClient {
  let released = false;
  const client = {
    query(...args: unknown[]) {
      const callback = [...args].reverse().find((value) => typeof value === "function") as
        | ((error: Error | undefined, result?: { rows: unknown[] }) => void)
        | undefined;
      const finish = () => {
        const error = failure.current;
        if (error) {
          if (callback) {
            callback(error);
            return undefined;
          }
          return Promise.reject(error);
        }
        if (callback) {
          callback(undefined, { rows: [] });
          return undefined;
        }
        return Promise.resolve({ rows: [] });
      };
      if (queryDelay <= 0) return finish();
      if (callback) {
        setTimeout(() => {
          finish();
        }, queryDelay);
        return undefined;
      }
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          Promise.resolve()
            .then(() => finish())
            .then(resolve, reject);
        }, queryDelay);
      });
    },
    release() {
      if (released) throw new Error("Release called on client which has already been released to the pool.");
      released = true;
      pool.emit("release", undefined, client);
      onRelease();
    },
  };
  return client as unknown as PoolClient;
}

function installQueuedConnect(
  pool: Pool,
  limit: number,
  queryDelay = 0,
  failure: { current: Error | null } = { current: null },
  emitConnect = false,
): void {
  let held = 0;
  const waiting: Array<(client: PoolClient) => void> = [];

  function handoff(deliver: (client: PoolClient) => void): void {
    held += 1;
    const client = createClient(
      pool,
      () => {
        held -= 1;
        const next = waiting.shift();
        if (next) handoff(next);
      },
      queryDelay,
      failure,
    );
    if (emitConnect) pool.emit("connect", client);
    deliver(client);
  }

  pool.connect = ((callback?: (err: Error | undefined, client: PoolClient | undefined, done: Release) => void) => {
    const deliver = (client: PoolClient) => {
      if (typeof callback === "function") {
        callback(undefined, client, client.release);
        return undefined;
      }
      return Promise.resolve(client);
    };
    if (held >= limit) {
      return new Promise<PoolClient>((resolve) => {
        waiting.push((client) => {
          if (typeof callback === "function") callback(undefined, client, client.release);
          resolve(client);
        });
      });
    }
    let created: PoolClient | undefined;
    handoff((client) => {
      created = client;
    });
    return deliver(created as PoolClient);
  }) as Pool["connect"];
}

beforeEach(() => {
  resetPerfForTests();
  setPerfSink(null);
});

afterEach(() => {
  stopPerfRuntime();
  setPerfSink(null);
  clearDbGlobals();
  vi.resetModules();
  restoreEnv();
});

afterAll(() => {
  uninstallRequestInstrumentation();
  stopPerfRuntime();
  restoreEnv();
});

describe("performance instrumentation defaults", () => {
  it("keeps percentiles bucketed and the histogram bounded", () => {
    const histogram = new DurationHistogram();
    histogram.record(3, false, 1_000);
    expect(histogram.max).toBe(3);
    expect(histogram.percentile(0.5)).toBe(5);
    expect(histogram.percentile(0.99)).toBe(5);
    const many = new DurationHistogram();
    for (let index = 0; index < 10_000; index += 1) many.record(10, false, 1_000);
    expect(many.count).toBe(10_000);
    expect(many.max).toBe(10);
    expect(many.percentile(0.5)).toBe(10);
    expect(HISTOGRAM_BUCKETS).toBe(HISTOGRAM_UPPER_MS.length + 1);
  });

  it("redacts identifiers and drops query strings", () => {
    expect(safeRoute("/api/health?token=secret&email=person@example.com")).toBe("/api/health");
    expect(safeRoute("/candidate/12345")).toBe("/candidate/:id");
    expect(safeRoute("/files/person%40example.com")).toBe("/files/:email");
    expect(safeRoute("/people/AB1234567/+8801712345678")).toBe("/people/:id/:phone");
    expect(safeRoute("/reset/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")).toBe("/reset/:id");
    expect(safeMethod("NOTAMETHOD")).toBe("UNKNOWN");
    expect(safeMethod("GET\r\nX-Secret: hunter2")).toBe("UNKNOWN");
  });

  it("stays off during tests and production unless the flag is set", () => {
    const env = process.env as Record<string, string | undefined>;
    const vitest = env.VITEST;
    try {
      delete env.PERF_INSTRUMENTATION;
      delete env.VITEST;
      env.NODE_ENV = "development";
      expect(isPerfEnabled()).toBe(true);
      env.NODE_ENV = "production";
      expect(isPerfEnabled()).toBe(false);
      env.NODE_ENV = "test";
      expect(isPerfEnabled()).toBe(false);
      env.VITEST = "1";
      env.NODE_ENV = "development";
      expect(isPerfEnabled()).toBe(false);
      env.PERF_INSTRUMENTATION = "1";
      env.NODE_ENV = "production";
      expect(isPerfEnabled()).toBe(true);
      env.PERF_INSTRUMENTATION = "0";
      env.NODE_ENV = "development";
      delete env.VITEST;
      expect(isPerfEnabled()).toBe(false);
    } finally {
      if (vitest === undefined) delete env.VITEST;
      else env.VITEST = vitest;
    }
    expect(perfWindowMs()).toBe(10_000);
    env.PERF_WINDOW_MS = "5";
    expect(perfWindowMs()).toBe(1_000);
    env.PERF_WINDOW_MS = "999999";
    expect(perfWindowMs()).toBe(60_000);
  });
});

describe("pool instrumentation without a database", () => {
  it("measures checkout wait, query time, release, and errors on one pool", async () => {
    const lines: string[] = [];
    setPerfSink((line) => lines.push(line));
    const pool = new Pool({ connectionString: UNIT_URL, max: 1 });
    const failure = new Error("person@example.com passport AB1234567");
    const failures = { current: null as Error | null };
    installQueuedConnect(pool, 1, 40, failures);
    instrumentPool(pool);
    instrumentPool(pool);

    const first = await pool.connect();
    const started = performance.now();
    const pending = pool.connect();
    await delay(50);
    first.release();
    const second = await pending;
    const waited = poolMetrics(pool);
    expect(waited?.checkoutWait.count).toBe(2);
    expect(waited?.checkoutWait.max ?? 0).toBeGreaterThanOrEqual(40);
    expect(waited?.checkoutWait.max ?? 0).toBeLessThanOrEqual(performance.now() - started + 30);
    expect(waited?.connectionSetup.count).toBe(0);
    expect(waited?.maxInFlight).toBe(1);

    const queryStarted = performance.now();
    await second.query("SELECT secret_sql", ["person@example.com"]);
    const measured = poolMetrics(pool);
    expect(measured?.query.count).toBe(1);
    expect(measured?.query.max ?? 0).toBeGreaterThanOrEqual(30);
    expect(measured?.query.max ?? 0).toBeLessThanOrEqual(performance.now() - queryStarted + 30);
    expect(measured?.prisma.count).toBe(0);

    await second.query({ text: "SELECT secret_sql", values: ["person@example.com"], rowMode: "array" });
    expect(poolMetrics(pool)?.prisma.count).toBe(1);
    expect(poolMetrics(pool)?.query.count).toBe(2);

    failures.current = failure;
    await expect(second.query("SELECT secret_sql")).rejects.toBe(failure);
    failures.current = null;
    expect(poolMetrics(pool)?.query.errors).toBe(1);
    expect(poolMetrics(pool)?.query.count).toBe(3);

    second.release();
    expect(() => second.release()).toThrow(/already been released/);
    expect(poolMetrics(pool)?.acquires).toBe(2);
    expect(poolMetrics(pool)?.releases).toBe(2);
    expect(poolMetrics(pool)?.inFlight).toBe(0);

    const nested = await pool.connect();
    await nested.query("BEGIN");
    await nested.query("SAVEPOINT nested");
    await nested.query("SELECT 1");
    await nested.query("RELEASE SAVEPOINT nested");
    await nested.query("COMMIT");
    nested.release();
    expect(poolMetrics(pool)?.acquires).toBe(3);
    expect(poolMetrics(pool)?.query.count).toBe(8);
    expect(poolMetrics(pool)?.releases).toBe(3);

    const text = flushPerfLogs().join("\n");
    expect(text).not.toContain("person@example.com");
    expect(text).not.toContain("AB1234567");
    expect(text).not.toContain("secret_sql");
    expect(text).not.toContain("super-secret-db-password");
    expect(pool.options.max).toBe(1);
    expect(pool.options.connectionString).toBe(UNIT_URL);
    await pool.end();
    expect(perfSnapshot().instrumentedPools).toBe(0);
  });

  it("counts overlapping checkouts once and keeps callback errors", async () => {
    const pool = new Pool({ connectionString: UNIT_URL, max: 2 });
    installQueuedConnect(pool, 2);
    instrumentPool(pool);
    const first = await pool.connect();
    const second = await pool.connect();
    const third = pool.connect();
    expect(poolMetrics(pool)?.maxInFlight).toBe(2);
    expect(poolMetrics(pool)?.acquires).toBe(2);
    first.release();
    const thirdClient = await third;
    expect(poolMetrics(pool)?.acquires).toBe(3);
    expect(poolMetrics(pool)?.maxInFlight).toBe(2);
    second.release();
    thirdClient.release();
    expect(poolMetrics(pool)?.releases).toBe(3);
    expect(poolMetrics(pool)?.inFlight).toBe(0);

    const error = new Error("checkout failed");
    const failing = new Pool({ connectionString: UNIT_URL, max: 1 });
    failing.connect = (() => Promise.reject(error)) as Pool["connect"];
    instrumentPool(failing);
    await expect(failing.connect()).rejects.toBe(error);
    expect(poolMetrics(failing)?.checkoutErrors).toBe(1);
    expect(poolMetrics(failing)?.acquires).toBe(0);

    const callbackPool = new Pool({ connectionString: UNIT_URL, max: 1 });
    callbackPool.connect = ((callback?: (err: Error | undefined) => void) => {
      callback?.(error);
    }) as Pool["connect"];
    instrumentPool(callbackPool);
    await new Promise<void>((resolve) => {
      callbackPool.connect((err) => {
        expect(err).toBe(error);
        resolve();
      });
    });
    expect(poolMetrics(callbackPool)?.checkoutErrors).toBe(1);

    await pool.end();
    await failing.end();
    await callbackPool.end();
  });

  it("counts a new connection as setup rather than checkout wait", async () => {
    const pool = new Pool({ connectionString: UNIT_URL, max: 1 });
    let connects = 0;
    pool.on("connect", () => {
      connects += 1;
    });
    installQueuedConnect(pool, 1, 0, { current: null }, true);
    instrumentPool(pool);
    const client = await pool.connect();
    client.release();
    expect(connects).toBe(1);
    expect(poolMetrics(pool)?.connects).toBe(1);
    expect(poolMetrics(pool)?.connectionSetup.count).toBe(1);
    expect(poolMetrics(pool)?.checkoutWait.count).toBe(0);
    expect(poolMetrics(pool)?.acquires).toBe(1);
    expect(poolMetrics(pool)?.releases).toBe(1);
    await pool.end();
  });

  it("does not construct another pool or change max when disabled or enabled", async () => {
    process.env.PERF_INSTRUMENTATION = "0";
    const listeners = process.listenerCount("beforeExit");
    const disabled = new Pool({ connectionString: UNIT_URL, max: 10 });
    const connect = disabled.connect;
    const end = disabled.end;
    attachSharedPool(disabled);
    installServerPerf();
    expect(disabled.connect).toBe(connect);
    expect(disabled.end).toBe(end);
    expect(disabled.options.max).toBe(10);
    expect(process.listenerCount("beforeExit")).toBe(listeners);
    await disabled.end();

    process.env.PERF_INSTRUMENTATION = "1";
    const enabled = new Pool({ connectionString: UNIT_URL, max: 10 });
    const poolsBefore = perfSnapshot().instrumentedPools;
    attachSharedPool(enabled);
    expect(perfSnapshot().instrumentedPools).toBe(poolsBefore + 1);
    expect(enabled.options.max).toBe(10);
    expect(enabled.options.connectionString).toBe(UNIT_URL);
    expect(enabled.options.statement_timeout).toBeUndefined();
    expect(enabled instanceof Pool).toBe(true);
    expect(enabled.connect).not.toBe(Pool.prototype.connect);
    setPerfSink(() => undefined);
    const logs = flushPerfLogs().join("\n");
    expect(logs.includes("super-secret-db-password")).toBe(false);
    stopPerfRuntime();
    await enabled.end();
    expect(perfSnapshot().instrumentedPools).toBe(poolsBefore);
  });
});

describe("request and event-loop instrumentation", () => {
  it("times the full response, assigns correlation ids, and omits sensitive fields", async () => {
    process.env.PERF_INSTRUMENTATION = "1";
    process.env.PERF_SLOW_REQUEST_MS = "0";
    const lines: string[] = [];
    setPerfSink((line) => lines.push(line));
    installRequestInstrumentation();
    installRequestInstrumentation();
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const wait = req.url?.includes("/slow") ? 40 : 0;
      setTimeout(() => {
        res.statusCode = 201;
        res.end("ok");
      }, wait);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    try {
      const port = (server.address() as AddressInfo).port;
      const base = `http://127.0.0.1:${port}`;
      const slow = await fetch(
        `${base}/slow?email=person@example.com&passport=AB1234567&phone=01712345678&password=hunter2`,
        {
          headers: {
            cookie: "mms_session=super-secret-cookie",
            authorization: "Bearer super-secret-token",
            "next-action": "action-id-do-not-log",
          },
        },
      );
      expect(slow.status).toBe(201);
      const page = await fetch(`${base}/people/AB1234567/+8801712345678`);
      expect(page.status).toBe(201);
      const route = await fetch(`${base}/api/health`);
      expect(route.status).toBe(201);

      const recent = perfSnapshot().requests.recent;
      const slowSample = recent.find((sample) => sample.route === "/slow");
      const pageSample = recent.find((sample) => sample.route.startsWith("/people/"));
      expect(slowSample?.kind).toBe("server_action");
      expect(slowSample?.status).toBe(201);
      expect(slowSample?.durationMs).toBeGreaterThanOrEqual(30);
      expect(slowSample?.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(pageSample?.route).toBe("/people/:id/:phone");
      expect(pageSample?.kind).toBe("page");
      expect(recent.find((sample) => sample.route === "/api/health")?.kind).toBe("route_handler");
      const ids = new Set(recent.map((sample) => sample.correlationId));
      expect(ids.size).toBe(recent.length);
      for (let index = 0; index < 12; index += 1) {
        await fetch(`${base}/api/files/${index}?token=reset-token-${index}`);
      }

      const text = flushPerfLogs().join("\n");
      const httpLines = text
        .split("\n")
        .filter((line) => line.includes("\"metric\":\"http_request_ms\""));
      expect(httpLines).toHaveLength(1);
      const parsed = JSON.parse(httpLines[0] ?? "{}") as { count: number; samples: Array<{ correlationId: string; route: string }> };
      expect(parsed.count).toBe(15);
      expect(parsed.samples.length).toBeLessThanOrEqual(8);
      expect(httpLines[0]?.length ?? 0).toBeLessThan(4_000);
      expect(text.includes("person@example.com")).toBe(false);
      expect(text.includes("AB1234567")).toBe(false);
      expect(text.includes("01712345678")).toBe(false);
      expect(text.includes("8801712345678")).toBe(false);
      expect(text.includes("hunter2")).toBe(false);
      expect(text.includes("super-secret-cookie")).toBe(false);
      expect(text.includes("super-secret-token")).toBe(false);
      expect(text.includes("action-id-do-not-log")).toBe(false);
      expect(text.includes("reset-token")).toBe(false);
      expect(text.includes("?")).toBe(false);
      expect(flushPerfLogs().some((line) => line.includes("http_request_ms"))).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it("runs one event-loop monitor per process and shuts it down", async () => {
    process.env.PERF_INSTRUMENTATION = "1";
    const first = startEventLoopMonitor();
    const second = startEventLoopMonitor();
    expect(second).toBe(first);
    expect(perfSnapshot().eventLoopMonitors).toBe(1);
    const started = performance.now();
    while (performance.now() - started < 20) {
      // Block once so the delay histogram has a sample to report.
    }
    await delay(40);
    const reading = perfSnapshot().eventLoop;
    expect(reading).not.toBeNull();
    expect(reading?.utilization ?? 0).toBeGreaterThanOrEqual(0);
    expect(reading?.utilization ?? 0).toBeLessThanOrEqual(1);
    expect(typeof reading?.p50 === "number" || reading?.p50 === null).toBe(true);
    expect(typeof reading?.p95 === "number" || reading?.p95 === null).toBe(true);
    expect(reading?.max === null || (reading?.max ?? 0) >= 0).toBe(true);

    const before = process.listenerCount("beforeExit");
    startPerfRuntime();
    expect(perfSnapshot().eventLoopMonitors).toBe(1);
    expect(perfSnapshot().timerRef).toBe(false);
    expect(process.listenerCount("beforeExit")).toBe(before + 1);
    setPerfSink(() => undefined);
    const lines = flushPerfLogs();
    const loopLine = lines.find((line) => line.includes("node_event_loop_delay_ms"));
    expect(loopLine).toBeDefined();
    const parsed = JSON.parse(loopLine ?? "{}") as { resolutionMs: number; utilization: number | null };
    expect(parsed.resolutionMs).toBe(20);
    expect(lines.filter((line) => line.includes("node_event_loop_delay_ms"))).toHaveLength(1);
    stopPerfRuntime();
    expect(perfSnapshot().eventLoopMonitors).toBe(0);
    expect(perfSnapshot().timerRef).toBeNull();
    expect(process.listenerCount("beforeExit")).toBe(before);
    stopEventLoopMonitor();
    expect(perfSnapshot().eventLoopMonitors).toBe(0);
  });
});

describe("shared pool module", () => {
  it("leaves the shared pool unchanged when instrumentation is disabled", async () => {
    process.env.PERF_INSTRUMENTATION = "0";
    process.env.DATABASE_URL = UNIT_URL;
    setNodeEnv("development");
    clearDbGlobals();
    vi.resetModules();
    const listeners = process.listenerCount("beforeExit");
    const db = (await import("@/lib/db")) as DbModule;
    expect(db.pool.connect).toBe(Pool.prototype.connect);
    expect(db.pool.options.max).toBe(10);
    expect(db.pool.options.statement_timeout).toBeUndefined();
    expect(adapterPool(db.prisma)).toBe(db.pool);
    expect(process.listenerCount("beforeExit")).toBe(listeners);
    expect(perfSnapshot().eventLoopMonitors).toBe(0);
    await db.closeDb();
  });

  it("instruments the existing pool without a second pool or a new max", async () => {
    process.env.PERF_INSTRUMENTATION = "1";
    process.env.DATABASE_URL = UNIT_URL;
    setNodeEnv("development");
    clearDbGlobals();
    vi.resetModules();
    const lines: string[] = [];
    setPerfSink((line) => lines.push(line));
    const db = (await import("@/lib/db")) as DbModule;
    expect(adapterPool(db.prisma)).toBe(db.pool);
    expect(db.pool.options.max).toBe(10);
    expect(db.pool.options.connectionString).toBe(UNIT_URL);
    expect(db.pool.options.statement_timeout).toBeUndefined();
    expect(db.pool.connect).not.toBe(Pool.prototype.connect);
    expect(perfSnapshot().instrumentedPools).toBe(1);
    expect(perfSnapshot().timerRef).toBe(false);
    flushPerfLogs();
    expect(lines.join("\n").includes("super-secret-db-password")).toBe(false);

    const order: string[] = [];
    vi.spyOn(db.prisma, "$disconnect").mockImplementation(async () => {
      order.push("disconnect");
    });
    vi.spyOn(db.pool, "end").mockImplementation(async () => {
      order.push("end");
    });
    await db.closeDb();
    await db.closeDb();
    expect(order).toEqual(["disconnect", "end"]);
    expect(perfSnapshot().eventLoopMonitors).toBe(0);
    expect(perfSnapshot().timerRef).toBeNull();
  });
});
