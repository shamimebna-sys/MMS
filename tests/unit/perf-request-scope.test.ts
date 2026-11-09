import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool, type PoolClient } from "pg";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  REQUEST_SCOPE_INCOMPLETE_LIMIT,
  attachSharedPool,
  currentRequestScope,
  flushPerfLogs,
  installRequestInstrumentation,
  installServerPerf,
  instrumentPool,
  perfSnapshot,
  poolMetrics,
  resetPerfForTests,
  setPerfSink,
  uninstallRequestInstrumentation,
  unionMilliseconds,
} from "@/server/perf/runtime";
import type { RequestSample } from "@/server/perf/state";

const UNIT_URL = "postgresql://mms_user:super-secret-db-password@127.0.0.1:1/mms_pool_unit";
const originalUrl = process.env.DATABASE_URL;
const originalEnv = process.env.NODE_ENV;
const originalFlag = process.env.PERF_INSTRUMENTATION;
const originalVitest = process.env.VITEST;

const LOG_KEYS = [
  "requestId",
  "category",
  "method",
  "route",
  "status",
  "httpDurationMs",
  "outcome",
  "aborted",
  "checkoutCount",
  "releaseCount",
  "checkoutFailures",
  "pendingCheckouts",
  "activeCheckouts",
  "maxConcurrentCheckouts",
  "checkoutWaitMs",
  "maxCheckoutWaitMs",
  "occupancyMs",
  "maxOccupancyMs",
  "queryCount",
  "rawQueryCount",
  "prismaQueryCount",
  "queryFailures",
  "sqlDurationMs",
  "sqlUnionMs",
  "sqlUnionTruncated",
  "maxQueryMs",
  "maxConcurrentQueries",
] as const;

type DbModule = {
  pool: Pool;
  prisma: PrismaClient;
  closeDb: () => Promise<void>;
};

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
  if (originalVitest === undefined) delete env.VITEST;
  else env.VITEST = originalVitest;
  setNodeEnv(originalEnv);
}

function clearDbGlobals(): void {
  const globalDb = globalThis as { pool?: Pool; prisma?: PrismaClient };
  delete globalDb.pool;
  delete globalDb.prisma;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createClient(pool: Pool, onRelease: () => void, queryDelay: number, failure: { current: Error | null }): PoolClient {
  let released = false;
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const client = {
    once(event: string, listener: (...args: unknown[]) => void) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
    },
    removeListener(event: string, listener: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(listener);
    },
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
        setTimeout(() => finish(), queryDelay);
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
    deliver(client);
  }
  pool.connect = ((callback?: (err: Error | undefined, client: PoolClient | undefined, done: () => void) => void) => {
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

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return `http://127.0.0.1:${port}`;
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function samplesFor(route: string): RequestSample[] {
  const snapshot = perfSnapshot();
  const all = [...snapshot.requestScopes.samples, ...snapshot.requestScopes.incomplete, ...snapshot.requests.recent];
  const seen = new Set<string>();
  const matched: RequestSample[] = [];
  for (const sample of all) {
    if (sample.route !== route || seen.has(sample.correlationId)) continue;
    seen.add(sample.correlationId);
    matched.push(sample);
  }
  return matched;
}

beforeEach(() => {
  uninstallRequestInstrumentation();
  resetPerfForTests();
  setPerfSink(() => undefined);
  process.env.PERF_INSTRUMENTATION = "1";
});

afterEach(() => {
  uninstallRequestInstrumentation();
  resetPerfForTests();
  setPerfSink(null);
  clearDbGlobals();
  restoreEnv();
});

describe("request-scoped performance attribution", () => {
  it("keeps overlapping intervals as a union and identical intervals as one span", () => {
    expect(unionMilliseconds([])).toBe(0);
    expect(unionMilliseconds([{ start: 5, end: 5 }])).toBe(0);
    expect(
      unionMilliseconds([
        { start: 0, end: 10 },
        { start: 5, end: 15 },
        { start: 20, end: 25 },
      ]),
    ).toBe(20);
    expect(
      unionMilliseconds([
        { start: 0, end: 10 },
        { start: 0, end: 10 },
      ]),
    ).toBe(10);
    expect(
      unionMilliseconds([
        { start: 0, end: 10 },
        { start: 2, end: 8 },
      ]),
    ).toBe(10);
    expect(
      unionMilliseconds([
        { start: 0, end: 5 },
        { start: 5, end: 9 },
      ]),
    ).toBe(9);
  });

  it("keeps concurrent requests in separate async contexts", async () => {
    installRequestInstrumentation();
    const server = createServer(async (_req: IncomingMessage, res: ServerResponse) => {
      const first = currentRequestScope();
      await delay(40);
      const second = currentRequestScope();
      res.end(`${first?.id ?? ""}:${first?.id === second?.id ? "same" : "diff"}`);
    });
    const base = await listen(server);
    try {
      const [left, right] = await Promise.all([fetch(`${base}/one`), fetch(`${base}/two`)]);
      const [leftBody, rightBody] = await Promise.all([left.text(), right.text()]);
      const leftId = leftBody.split(":")[0];
      const rightId = rightBody.split(":")[0];
      expect(leftBody.endsWith(":same")).toBe(true);
      expect(rightBody.endsWith(":same")).toBe(true);
      expect(leftId).not.toBe(rightId);
      expect(leftId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(currentRequestScope()).toBeNull();
    } finally {
      await closeServer(server);
    }
  });

  it("attributes pool checkout and pool.query to the request that started them", async () => {
    const pool = new Pool({ connectionString: UNIT_URL, max: 1 });
    installQueuedConnect(pool, 1, 0);
    instrumentPool(pool);
    installRequestInstrumentation();
    let markHeld: () => void = () => undefined;
    let markQueued: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      markHeld = resolve;
    });
    const queued = new Promise<void>((resolve) => {
      markQueued = resolve;
    });
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.url?.startsWith("/hold")) {
        const client = await pool.connect();
        markHeld();
        await queued;
        await delay(80);
        client.release();
        res.end("hold");
        return;
      }
      markQueued();
      await pool.query("SELECT secret_sql", ["person@example.com"]);
      res.end("wait");
    });
    const base = await listen(server);
    try {
      const holdPromise = fetch(`${base}/hold`);
      await held;
      const waitPromise = fetch(`${base}/wait`);
      expect((await holdPromise).status).toBe(200);
      expect((await waitPromise).status).toBe(200);
      const hold = samplesFor("/hold")[0];
      const wait = samplesFor("/wait")[0];
      expect(hold?.outcome).toBe("complete");
      expect(wait?.outcome).toBe("complete");
      expect(hold?.correlationId).not.toBe(wait?.correlationId);
      expect(hold?.checkoutCount).toBe(1);
      expect(hold?.releaseCount).toBe(1);
      expect(hold?.queryCount).toBe(0);
      expect(hold?.maxCheckoutWaitMs).toBeLessThan(50);
      expect(hold?.occupancyMs).toBeGreaterThanOrEqual(60);
      expect(wait?.checkoutCount).toBe(1);
      expect(wait?.releaseCount).toBe(1);
      expect(wait?.queryCount).toBe(1);
      expect(wait?.rawQueryCount).toBe(1);
      expect(wait?.checkoutWaitMs).toBeGreaterThanOrEqual(40);
      expect(wait?.activeCheckouts).toBe(0);
      expect(poolMetrics(pool)?.acquires).toBe(2);
      expect(poolMetrics(pool)?.releases).toBe(2);
      expect(pool.options.max).toBe(1);
    } finally {
      await closeServer(server);
      await pool.end();
    }
  });

  it("attributes release to the checkout request while another request is active", async () => {
    const pool = new Pool({ connectionString: UNIT_URL, max: 1 });
    installQueuedConnect(pool, 1);
    instrumentPool(pool);
    installRequestInstrumentation();
    const releaseOwner: { current: (() => void) | null } = { current: null };
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.url?.startsWith("/owner")) {
        const client = await pool.connect();
        releaseOwner.current = () => client.release();
        res.end("owner");
        return;
      }
      releaseOwner.current?.();
      releaseOwner.current = null;
      const client = await pool.connect();
      client.release();
      res.end("other");
    });
    const base = await listen(server);
    try {
      expect((await fetch(`${base}/owner`)).status).toBe(200);
      expect(samplesFor("/owner")).toHaveLength(0);
      expect(currentRequestScope()).toBeNull();
      expect((await fetch(`${base}/other`)).status).toBe(200);
      const owner = samplesFor("/owner")[0];
      const other = samplesFor("/other")[0];
      expect(owner?.outcome).toBe("complete");
      expect(owner?.checkoutCount).toBe(1);
      expect(owner?.releaseCount).toBe(1);
      expect(owner?.queryCount).toBe(0);
      expect(other?.outcome).toBe("complete");
      expect(other?.checkoutCount).toBe(1);
      expect(other?.releaseCount).toBe(1);
      expect(owner?.correlationId).not.toBe(other?.correlationId);
      expect(poolMetrics(pool)?.acquires).toBe(poolMetrics(pool)?.releases);
    } finally {
      releaseOwner.current?.();
      await closeServer(server);
      await pool.end();
    }
  });

  it("records parallel query duration as a sum and a non-overlapping union", async () => {
    const lines: string[] = [];
    setPerfSink((line) => lines.push(line));
    const pool = new Pool({ connectionString: UNIT_URL, max: 2 });
    installQueuedConnect(pool, 2, 80);
    instrumentPool(pool);
    installRequestInstrumentation();
    const server = createServer(async (_req: IncomingMessage, res: ServerResponse) => {
      await Promise.all([
        pool.query("SELECT secret_sql", ["person@example.com"]),
        pool.query("SELECT secret_sql", ["person@example.com"]),
      ]);
      res.end("ok");
    });
    const base = await listen(server);
    try {
      expect((await fetch(`${base}/parallel?token=super-secret-token`)).status).toBe(200);
      const sample = samplesFor("/parallel")[0];
      expect(sample?.queryCount).toBe(2);
      expect(sample?.rawQueryCount).toBe(2);
      expect(sample?.prismaQueryCount).toBe(0);
      expect(sample?.maxConcurrentQueries).toBeGreaterThanOrEqual(2);
      expect(sample?.maxConcurrentCheckouts).toBeGreaterThanOrEqual(2);
      expect(sample?.sqlDurationMs ?? 0).toBeGreaterThan((sample?.sqlUnionMs ?? 0) + 20);
      expect(sample?.sqlUnionMs ?? 0).toBeGreaterThan(20);
      expect(sample?.checkoutCount).toBe(2);
      expect(sample?.releaseCount).toBe(2);
      expect(sample?.sqlUnionTruncated).toBe(false);
      expect(poolMetrics(pool)?.query.count).toBe(2);
      const text = flushPerfLogs().join("\n");
      expect(text).not.toContain("secret_sql");
      expect(text).not.toContain("person@example.com");
      expect(text).not.toContain("super-secret-token");
      expect(text).not.toContain("super-secret-db-password");
      expect(text).not.toContain("?");
      const scopeLine = text.split("\n").find((line) => line.includes("\"metric\":\"http_request_scope\""));
      const parsed = JSON.parse(scopeLine ?? "{}") as { samples: Array<Record<string, unknown>> };
      expect(Object.keys(parsed.samples[0] ?? {}).sort()).toEqual([...LOG_KEYS].sort());
      expect(JSON.stringify(parsed)).not.toContain("cpu");
    } finally {
      await closeServer(server);
      await pool.end();
    }
  });

  it("distinguishes raw PostgreSQL queries from Prisma adapter queries", async () => {
    const pool = new Pool({ connectionString: UNIT_URL, max: 1 });
    installQueuedConnect(pool, 1);
    instrumentPool(pool);
    installRequestInstrumentation();
    const server = createServer(async (_req: IncomingMessage, res: ServerResponse) => {
      const client = await pool.connect();
      await client.query("SELECT secret_sql", ["person@example.com"]);
      await client.query({ text: "SELECT secret_sql", values: ["person@example.com"], rowMode: "array" });
      client.release();
      res.end("ok");
    });
    const base = await listen(server);
    try {
      expect((await fetch(`${base}/mixed`)).status).toBe(200);
      const sample = samplesFor("/mixed")[0];
      expect(sample?.queryCount).toBe(2);
      expect(sample?.rawQueryCount).toBe(1);
      expect(sample?.prismaQueryCount).toBe(1);
      expect(sample?.queryFailures).toBe(0);
      expect(poolMetrics(pool)?.query.count).toBe(2);
      expect(poolMetrics(pool)?.prisma.count).toBe(1);
    } finally {
      await closeServer(server);
      await pool.end();
    }
  });

  it("records failed queries without dropping the request sample", async () => {
    const failure = new Error("person@example.com passport AB1234567");
    const failures = { current: failure };
    const pool = new Pool({ connectionString: UNIT_URL, max: 1 });
    installQueuedConnect(pool, 1, 0, failures);
    instrumentPool(pool);
    installRequestInstrumentation();
    const server = createServer(async (_req: IncomingMessage, res: ServerResponse) => {
      const client = await pool.connect();
      try {
        await client.query("SELECT secret_sql", ["person@example.com"]);
      } catch {
        // The request continues after the failed query.
      }
      client.release();
      res.statusCode = 200;
      res.end("ok");
    });
    const base = await listen(server);
    try {
      expect((await fetch(`${base}/failed`)).status).toBe(200);
      const sample = samplesFor("/failed")[0];
      expect(sample?.outcome).toBe("complete");
      expect(sample?.queryCount).toBe(1);
      expect(sample?.queryFailures).toBe(1);
      expect(sample?.rawQueryCount).toBe(1);
      expect(sample?.prismaQueryCount).toBe(0);
      expect(sample?.checkoutCount).toBe(sample?.releaseCount);
      expect(poolMetrics(pool)?.query.errors).toBe(1);
      expect(poolMetrics(pool)?.query.count).toBe(1);
    } finally {
      await closeServer(server);
      await pool.end();
    }
  });

  it("does not acquire a connection when checkout fails", async () => {
    const error = new Error("checkout failed");
    const pool = new Pool({ connectionString: UNIT_URL, max: 1 });
    pool.connect = ((callback?: (err: Error) => void) => {
      if (typeof callback === "function") {
        callback(error);
        return undefined;
      }
      return Promise.reject(error);
    }) as Pool["connect"];
    instrumentPool(pool);
    installRequestInstrumentation();
    const server = createServer(async (_req: IncomingMessage, res: ServerResponse) => {
      await pool.connect().catch(() => undefined);
      await new Promise<void>((resolve) => {
        pool.connect((err) => {
          expect(err).toBe(error);
          resolve();
        });
      });
      res.end("ok");
    });
    const base = await listen(server);
    try {
      expect((await fetch(`${base}/checkout-fail`)).status).toBe(200);
      const sample = samplesFor("/checkout-fail")[0];
      expect(sample?.outcome).toBe("complete");
      expect(sample?.checkoutCount).toBe(0);
      expect(sample?.releaseCount).toBe(0);
      expect(sample?.checkoutFailures).toBe(2);
      expect(sample?.activeCheckouts).toBe(0);
      expect(sample?.pendingCheckouts).toBe(0);
      expect(poolMetrics(pool)?.acquires).toBe(0);
      expect(poolMetrics(pool)?.checkoutErrors).toBe(2);
      expect(poolMetrics(pool)?.inFlight).toBe(0);
    } finally {
      await closeServer(server);
      await pool.end();
    }
  });

  it("counts a client release once when the pool emits release again", async () => {
    const pool = new Pool({ connectionString: UNIT_URL, max: 1 });
    installQueuedConnect(pool, 1);
    instrumentPool(pool);
    installRequestInstrumentation();
    const server = createServer(async (_req: IncomingMessage, res: ServerResponse) => {
      const client = await pool.connect();
      client.release();
      pool.emit("release", undefined, client);
      expect(() => client.release()).toThrow(/already been released/);
      res.end("ok");
    });
    const base = await listen(server);
    try {
      expect((await fetch(`${base}/once`)).status).toBe(200);
      const sample = samplesFor("/once")[0];
      expect(sample?.checkoutCount).toBe(1);
      expect(sample?.releaseCount).toBe(1);
      expect(sample?.activeCheckouts).toBe(0);
      expect(sample?.outcome).toBe("complete");
      expect(poolMetrics(pool)?.acquires).toBe(1);
    } finally {
      await closeServer(server);
      await pool.end();
    }
  });

  it("waits to seal a finished response until its tracked client is released", async () => {
    const pool = new Pool({ connectionString: UNIT_URL, max: 1 });
    installQueuedConnect(pool, 1);
    instrumentPool(pool);
    installRequestInstrumentation();
    const held: { current: PoolClient | null } = { current: null };
    const server = createServer(async (_req: IncomingMessage, res: ServerResponse) => {
      held.current = await pool.connect();
      res.end("ok");
    });
    const base = await listen(server);
    try {
      expect((await fetch(`${base}/open`)).status).toBe(200);
      await delay(20);
      expect(samplesFor("/open")).toHaveLength(0);
      expect(perfSnapshot().requestScopes.open).toBe(1);
      held.current?.release();
      const sample = samplesFor("/open")[0];
      expect(sample?.outcome).toBe("complete");
      expect(sample?.checkoutCount).toBe(1);
      expect(sample?.releaseCount).toBe(1);
      expect(sample?.activeCheckouts).toBe(0);
      expect(sample?.pendingCheckouts).toBe(0);
      expect(perfSnapshot().requestScopes.open).toBe(0);
    } finally {
      try {
        held.current?.release();
      } catch {
        // The request path already released this client.
      }
      await closeServer(server);
      await pool.end();
    }
  });

  it("marks a response that closes before it finishes as aborted", async () => {
    installRequestInstrumentation();
    const server = createServer((_req: IncomingMessage, res: ServerResponse) => {
      res.on("error", () => undefined);
      setTimeout(() => res.destroy(), 15);
    });
    server.on("clientError", () => undefined);
    const base = await listen(server);
    try {
      await fetch(`${base}/abort`).catch(() => undefined);
      const started = Date.now();
      let sample = samplesFor("/abort")[0];
      while (!sample && Date.now() - started < 1_000) {
        await delay(10);
        sample = samplesFor("/abort")[0];
      }
      expect(sample?.outcome).toBe("aborted");
      expect(sample?.aborted).toBe(true);
      expect(sample?.checkoutCount).toBe(0);
      expect(sample?.activeCheckouts).toBe(0);
    } finally {
      await closeServer(server);
    }
  });

  it("keeps incomplete samples in a bounded buffer and reports the overflow", async () => {
    const lines: string[] = [];
    setPerfSink((line) => lines.push(line));
    const total = REQUEST_SCOPE_INCOMPLETE_LIMIT + 1;
    const pool = new Pool({ connectionString: UNIT_URL, max: total });
    installQueuedConnect(pool, total);
    instrumentPool(pool);
    installRequestInstrumentation();
    const held: PoolClient[] = [];
    const server = createServer(async (_req: IncomingMessage, res: ServerResponse) => {
      held.push(await pool.connect());
      res.end("ok");
    });
    const base = await listen(server);
    try {
      for (let index = 0; index < total; index += 1) {
        expect((await fetch(`${base}/stuck/${index}`)).status).toBe(200);
      }
      expect(perfSnapshot().requestScopes.open).toBe(total);
      const text = flushPerfLogs().join("\n");
      const snapshot = perfSnapshot();
      expect(snapshot.requestScopes.incomplete).toHaveLength(REQUEST_SCOPE_INCOMPLETE_LIMIT);
      expect(snapshot.requestScopes.incompleteOverflow).toBe(1);
      expect(snapshot.requestScopes.samples).toHaveLength(0);
      expect(snapshot.requestScopes.open).toBe(0);
      const httpLine = text.split("\n").find((line) => line.includes("\"metric\":\"http_request_ms\""));
      const http = JSON.parse(httpLine ?? "{}") as { count: number };
      expect(http.count).toBe(total);
      for (const sample of snapshot.requestScopes.incomplete) {
        expect(sample.outcome).toBe("incomplete");
        expect(sample.activeCheckouts).toBe(1);
        expect(sample.releaseCount).toBe(0);
        expect(sample.checkoutCount).toBe(1);
      }
      const scopeLine = text.split("\n").find((line) => line.includes("\"metric\":\"http_request_scope\""));
      const parsed = JSON.parse(scopeLine ?? "{}") as {
        incomplete: Array<{ outcome: string }>;
        incompleteOverflow: number;
        samples: unknown[];
      };
      expect(parsed.samples).toEqual([]);
      expect(parsed.incomplete).toHaveLength(REQUEST_SCOPE_INCOMPLETE_LIMIT);
      expect(parsed.incompleteOverflow).toBe(1);
      expect(parsed.incomplete.length + parsed.incompleteOverflow).toBe(total);
      expect(parsed.incomplete.every((sample) => sample.outcome === "incomplete")).toBe(true);
      expect(text).not.toContain("secret");
    } finally {
      for (const client of held) client.release();
      await closeServer(server);
      await pool.end();
    }
  });

  it("does not attach a finished request to later work outside that request", async () => {
    const pool = new Pool({ connectionString: UNIT_URL, max: 1 });
    installQueuedConnect(pool, 1);
    instrumentPool(pool);
    installRequestInstrumentation();
    let outsideDuringRequest: string | null = "unset";
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.url?.startsWith("/first")) {
        await delay(30);
        const scope = currentRequestScope();
        res.end(scope?.id ?? "none");
        return;
      }
      res.end(currentRequestScope()?.id ?? "none");
    });
    const base = await listen(server);
    try {
      const pending = fetch(`${base}/first`);
      await delay(5);
      outsideDuringRequest = currentRequestScope()?.id ?? null;
      const firstBody = await (await pending).text();
      expect(outsideDuringRequest).toBeNull();
      expect(firstBody).not.toBe("none");
      const first = samplesFor("/first")[0];
      expect(first?.correlationId).toBe(firstBody);
      const outsider = await pool.connect();
      outsider.release();
      expect(samplesFor("/first")[0]?.checkoutCount).toBe(0);
      const secondBody = await (await fetch(`${base}/second`)).text();
      const second = samplesFor("/second")[0];
      expect(secondBody).not.toBe(firstBody);
      expect(second?.correlationId).toBe(secondBody);
      expect(second?.checkoutCount).toBe(0);
      expect(second?.queryCount).toBe(0);
      expect(currentRequestScope()).toBeNull();
      expect(poolMetrics(pool)?.acquires).toBe(1);
    } finally {
      await closeServer(server);
      await pool.end();
    }
  });

  it("keeps process-wide pool histograms when a request scope is also recorded", async () => {
    const pool = new Pool({ connectionString: UNIT_URL, max: 2 });
    installQueuedConnect(pool, 2);
    instrumentPool(pool);
    const outside = await pool.connect();
    await outside.query("SELECT 1");
    outside.release();
    expect(poolMetrics(pool)?.acquires).toBe(1);
    expect(poolMetrics(pool)?.releases).toBe(1);
    expect(poolMetrics(pool)?.query.count).toBe(1);
    expect(poolMetrics(pool)?.checkoutWait.count).toBe(1);
    expect(perfSnapshot().requestScopes.open).toBe(0);
    expect(perfSnapshot().requestScopes.samples).toHaveLength(0);

    installRequestInstrumentation();
    const server = createServer(async (_req: IncomingMessage, res: ServerResponse) => {
      const client = await pool.connect();
      await client.query({ text: "SELECT 1", rowMode: "array" });
      client.release();
      res.end("ok");
    });
    const base = await listen(server);
    try {
      expect((await fetch(`${base}/inside`)).status).toBe(200);
      const sample = samplesFor("/inside")[0];
      expect(sample?.checkoutCount).toBe(1);
      expect(sample?.prismaQueryCount).toBe(1);
      expect(sample?.sqlDurationMs).toBeGreaterThanOrEqual(0);
      expect(Object.keys(sample ?? {})).not.toContain("cpuMs");
      expect(Object.keys(sample ?? {})).not.toContain("utilization");
      expect(poolMetrics(pool)?.acquires).toBe(2);
      expect(poolMetrics(pool)?.releases).toBe(2);
      expect(poolMetrics(pool)?.query.count).toBe(2);
      expect(poolMetrics(pool)?.prisma.count).toBe(1);
      expect(poolMetrics(pool)?.inFlight).toBe(0);
      expect(pool.options.max).toBe(2);
    } finally {
      await closeServer(server);
      await pool.end();
    }
  });

  it("does not collect request samples when instrumentation is disabled", async () => {
    process.env.PERF_INSTRUMENTATION = "0";
    uninstallRequestInstrumentation();
    const untouched = new Pool({ connectionString: UNIT_URL, max: 10 });
    const connect = untouched.connect;
    const end = untouched.end;
    const listeners = process.listenerCount("beforeExit");
    attachSharedPool(untouched);
    installServerPerf();
    installRequestInstrumentation();
    expect(untouched.connect).toBe(connect);
    expect(untouched.end).toBe(end);
    expect(untouched.options.max).toBe(10);
    expect(process.listenerCount("beforeExit")).toBe(listeners);
    const idle = createServer((_req: IncomingMessage, res: ServerResponse) => {
      res.end("ok");
    });
    const idleBase = await listen(idle);
    try {
      expect((await fetch(`${idleBase}/off`)).status).toBe(200);
      expect(perfSnapshot().requests.recent).toEqual([]);
      expect(perfSnapshot().requestScopes.open).toBe(0);
      expect(perfSnapshot().requestScopes.samples).toEqual([]);
      expect(perfSnapshot().requestScopes.incomplete).toEqual([]);
      expect(perfSnapshot().requests.count).toBe(0);
    } finally {
      await closeServer(idle);
      await untouched.end();
    }

    process.env.PERF_INSTRUMENTATION = "1";
    installRequestInstrumentation();
    process.env.PERF_INSTRUMENTATION = "0";
    const patched = createServer((_req: IncomingMessage, res: ServerResponse) => {
      res.end("ok");
    });
    const patchedBase = await listen(patched);
    try {
      expect((await fetch(`${patchedBase}/still-off`)).status).toBe(200);
      expect(perfSnapshot().requests.recent).toEqual([]);
      expect(perfSnapshot().requestScopes.open).toBe(0);
      expect(perfSnapshot().requests.count).toBe(0);
    } finally {
      await closeServer(patched);
    }

    process.env.PERF_INSTRUMENTATION = "0";
    process.env.DATABASE_URL = UNIT_URL;
    setNodeEnv("development");
    clearDbGlobals();
    vi.resetModules();
    const db = (await import("@/lib/db")) as DbModule;
    try {
      expect(db.pool.options.max).toBe(10);
      expect(db.pool.connect).toBe(Pool.prototype.connect);
      expect(perfSnapshot().requestScopes.open).toBe(0);
      expect(perfSnapshot().eventLoopMonitors).toBe(0);
    } finally {
      await db.closeDb();
      vi.resetModules();
    }
  });
});
