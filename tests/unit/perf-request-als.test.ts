import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool, type PoolClient } from "pg";
import type { RequestKind } from "@/server/perf/redact";

const UNIT_URL = "postgresql://mms_user:super-secret-db-password@127.0.0.1:1/mms_pool_unit";
const REQUEST_ALS = Symbol.for("mms.perf.request-als");
const originalFlag = process.env.PERF_INSTRUMENTATION;
const originalEnv = process.env.NODE_ENV;

type ScopeModule = typeof import("@/server/perf/request-scope");
type PoolModule = typeof import("@/server/perf/pool");
type RuntimeModule = typeof import("@/server/perf/runtime");

function setNodeEnv(value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

function restoreEnv(): void {
  const env = process.env as Record<string, string | undefined>;
  if (originalFlag === undefined) delete env.PERF_INSTRUMENTATION;
  else env.PERF_INSTRUMENTATION = originalFlag;
  setNodeEnv(originalEnv);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadScope(): Promise<ScopeModule> {
  vi.resetModules();
  return import("@/server/perf/request-scope");
}

async function loadPool(): Promise<PoolModule> {
  vi.resetModules();
  return import("@/server/perf/pool");
}

async function loadRuntime(): Promise<RuntimeModule> {
  vi.resetModules();
  return import("@/server/perf/runtime");
}

function publishedAls(): AsyncLocalStorage<unknown> | undefined {
  const value = (globalThis as Record<symbol, unknown>)[REQUEST_ALS];
  if (!value || typeof value !== "object") return undefined;
  return value as AsyncLocalStorage<unknown>;
}

function openScope(scope: ScopeModule, id: string, route: string, kind: RequestKind = "page") {
  return scope.createRequestScope({
    id,
    method: "GET",
    route,
    kind,
    startedAt: performance.now(),
  });
}

function finish(scope: ScopeModule, request: ReturnType<ScopeModule["createRequestScope"]>, status = 200, aborted = false): void {
  scope.finishRequestResponse(request, { status, aborted, endedAt: performance.now() });
}

function makeClient(pool: Pool, queryDelay = 0, failQuery = false): PoolClient {
  let released = false;
  const client = {
    query(...args: unknown[]) {
      const callback = [...args].reverse().find((value) => typeof value === "function") as
        | ((error: Error | undefined, result?: { rows: unknown[] }) => void)
        | undefined;
      const finishQuery = () => {
        if (failQuery) {
          const error = new Error("person@example.com passport AB1234567");
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
      if (queryDelay <= 0) return finishQuery();
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          Promise.resolve()
            .then(() => finishQuery())
            .then(resolve, reject);
        }, queryDelay);
      });
    },
    release() {
      if (released) throw new Error("Release called on client which has already been released to the pool.");
      released = true;
      pool.emit("release", undefined, client);
    },
  };
  return client as unknown as PoolClient;
}

function installImmediateConnect(pool: Pool, queryDelay = 0, failQuery = false): void {
  pool.connect = (() => Promise.resolve(makeClient(pool, queryDelay, failQuery))) as Pool["connect"];
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

beforeEach(() => {
  process.env.PERF_INSTRUMENTATION = "1";
  setNodeEnv("production");
});

afterEach(async () => {
  const runtime = await import("@/server/perf/runtime");
  runtime.uninstallRequestInstrumentation();
  runtime.resetPerfForTests();
  runtime.setPerfSink(null);
  const scope = await import("@/server/perf/request-scope");
  scope.resetRequestScopes();
  restoreEnv();
  vi.resetModules();
});

describe("shared request AsyncLocalStorage", () => {
  it("returns one AsyncLocalStorage from separate module evaluations", async () => {
    const httpCopy = await loadScope();
    const routeCopy = await loadScope();
    const ssrCopy = await loadScope();

    expect(httpCopy.createRequestScope).not.toBe(routeCopy.createRequestScope);
    expect(routeCopy.createRequestScope).not.toBe(ssrCopy.createRequestScope);
    expect(httpCopy.sharedRequestAsyncLocalStorage()).toBe(routeCopy.sharedRequestAsyncLocalStorage());
    expect(routeCopy.sharedRequestAsyncLocalStorage()).toBe(ssrCopy.sharedRequestAsyncLocalStorage());
    expect(httpCopy.sharedRequestAsyncLocalStorage()).toBe(publishedAls());
    expect(httpCopy.sharedRequestAsyncLocalStorage()).toBeInstanceOf(AsyncLocalStorage);

    const again = httpCopy.sharedRequestAsyncLocalStorage();
    expect(again).toBe(publishedAls());
  });

  it("keeps concurrent request contexts isolated across module copies", async () => {
    const httpCopy = await loadScope();
    const routeCopy = await loadScope();
    const left = openScope(httpCopy, "11111111-1111-4111-8111-111111111111", "/one");
    const right = openScope(routeCopy, "22222222-2222-4222-8222-222222222222", "/two");

    const [leftSeen, rightSeen] = await Promise.all([
      httpCopy.runWithRequestScope(left, async () => {
        await delay(30);
        return routeCopy.currentRequestScope()?.id ?? null;
      }),
      routeCopy.runWithRequestScope(right, async () => {
        await delay(30);
        return httpCopy.currentRequestScope()?.id ?? null;
      }),
    ]);

    expect(leftSeen).toBe(left.id);
    expect(rightSeen).toBe(right.id);
    expect(leftSeen).not.toBe(rightSeen);
    expect(httpCopy.currentRequestScope()).toBeNull();
    expect(routeCopy.currentRequestScope()).toBeNull();
    const privateStore = new AsyncLocalStorage<{ id: string }>();
    httpCopy.runWithRequestScope(left, () => {
      expect(privateStore.getStore()).toBeUndefined();
      expect(routeCopy.currentRequestScope()?.id).toBe(left.id);
    });
  });

  it("shows a context entered in one copy to the other copies", async () => {
    const httpCopy = await loadScope();
    const routeCopy = await loadScope();
    const ssrCopy = await loadScope();
    const scope = openScope(httpCopy, "33333333-3333-4333-8333-333333333333", "/dashboard");

    httpCopy.runWithRequestScope(scope, () => {
      expect(routeCopy.currentRequestScope()).toEqual({ id: scope.id, kind: "page" });
      expect(ssrCopy.currentRequestScope()).toEqual({ id: scope.id, kind: "page" });
      const tracked = routeCopy.startRequestCheckout(performance.now());
      expect(tracked?.scope.id).toBe(scope.id);
    });
    expect(ssrCopy.currentRequestScope()).toBeNull();
  });

  it("attributes a route-wrapper checkout to the HTTP context and the SSR reader", async () => {
    const httpCopy = await loadScope();
    const routeCopy = await loadScope();
    const routePool = await import("@/server/perf/pool");
    expect(routePool.instrumentPool).toBeTypeOf("function");
    const ssrCopy = await loadScope();
    const pool = new Pool({ connectionString: UNIT_URL, max: 10 });
    installImmediateConnect(pool, 20);
    const releaseListeners = pool.listenerCount("release");
    routePool.instrumentPool(pool);
    const wrappedConnect = pool.connect;
    expect(pool.listenerCount("release")).toBe(releaseListeners + 1);
    expect(pool.options.max).toBe(10);

    const scope = openScope(httpCopy, "44444444-4444-4444-8444-444444444444", "/dashboard");
    try {
      await httpCopy.runWithRequestScope(scope, async () => {
        const client = await pool.connect();
        await Promise.all([
          client.query("SELECT secret_sql", ["person@example.com"]),
          client.query({ text: "SELECT secret_sql", values: ["person@example.com"], rowMode: "array" }),
        ]);
        client.release();
      });
      finish(httpCopy, scope, 200);
      const sample = ssrCopy.requestScopeSnapshot().samples.find((item) => item.correlationId === scope.id);
      expect(sample?.outcome).toBe("complete");
      expect(sample?.checkoutCount).toBe(1);
      expect(sample?.releaseCount).toBe(1);
      expect(sample?.queryCount).toBe(2);
      expect(sample?.rawQueryCount).toBe(1);
      expect(sample?.prismaQueryCount).toBe(1);
      expect(sample?.queryFailures).toBe(0);
      expect(sample?.sqlDurationMs ?? 0).toBeGreaterThan(0);
      expect(sample?.sqlUnionMs ?? 0).toBeGreaterThan(0);
      expect(sample?.sqlDurationMs ?? 0).toBeGreaterThanOrEqual(sample?.sqlUnionMs ?? 0);
      expect(routePool.poolMetrics(pool)?.acquires).toBe(1);
      expect(routePool.poolMetrics(pool)?.releases).toBe(1);
      expect(routePool.poolMetrics(pool)?.query.count).toBe(2);
      expect(routePool.poolMetrics(pool)?.prisma.count).toBe(1);
      expect(JSON.stringify(sample)).not.toContain("secret_sql");
      expect(JSON.stringify(sample)).not.toContain("person@example.com");

      const laterPool = await loadPool();
      laterPool.instrumentPool(pool);
      expect(pool.connect).toBe(wrappedConnect);
      expect(pool.listenerCount("release")).toBe(releaseListeners + 1);
      expect(pool.options.max).toBe(10);
    } finally {
      await pool.end();
    }
  });

  it("keeps a checkout captured at connect() through a grant and release on another request", async () => {
    const httpCopy = await loadScope();
    const routeCopy = await loadScope();
    const routePool = await import("@/server/perf/pool");
    const ssrCopy = await loadScope();
    const pool = new Pool({ connectionString: UNIT_URL, max: 10 });
    let deliver: ((error: Error | undefined, client: PoolClient | undefined, done: () => void) => void) | null = null;
    pool.connect = ((callback?: (error: Error | undefined, client: PoolClient | undefined, done: () => void) => void) => {
      if (typeof callback !== "function") return Promise.reject(new Error("expected callback connect"));
      deliver = callback;
      return undefined;
    }) as Pool["connect"];
    routePool.instrumentPool(pool);

    const owner = openScope(httpCopy, "55555555-5555-4555-8555-555555555555", "/dashboard");
    const other = openScope(routeCopy, "66666666-6666-4666-8666-666666666666", "/other");
    let rawQuery = 0;
    let prismaQuery = 0;
    try {
      httpCopy.runWithRequestScope(owner, () => {
        pool.connect((_error, client, done) => {
          void client?.query("SELECT secret_sql").then(() => {
            rawQuery += 1;
          });
          void client?.query({ text: "SELECT secret_sql", rowMode: "array" }).then(() => {
            prismaQuery += 1;
          });
          done();
        });
      });
      const client = makeClient(pool);
      routeCopy.runWithRequestScope(other, () => {
        deliver?.(undefined, client, () => client.release());
      });
      await delay(0);
      finish(httpCopy, owner, 200);
      finish(routeCopy, other, 200);

      const ownerSample = ssrCopy.requestScopeSnapshot().samples.find((item) => item.correlationId === owner.id);
      const otherSample = ssrCopy.requestScopeSnapshot().samples.find((item) => item.correlationId === other.id);
      expect(rawQuery).toBe(1);
      expect(prismaQuery).toBe(1);
      expect(ownerSample?.checkoutCount).toBe(1);
      expect(ownerSample?.releaseCount).toBe(1);
      expect(ownerSample?.queryCount).toBe(2);
      expect(ownerSample?.rawQueryCount).toBe(1);
      expect(ownerSample?.prismaQueryCount).toBe(1);
      expect(ownerSample?.outcome).toBe("complete");
      expect(otherSample?.checkoutCount).toBe(0);
      expect(otherSample?.queryCount).toBe(0);
      expect(otherSample?.rawQueryCount).toBe(0);
      expect(otherSample?.prismaQueryCount).toBe(0);
      expect(routePool.poolMetrics(pool)?.acquires).toBe(1);
      expect(routePool.poolMetrics(pool)?.releases).toBe(1);
    } finally {
      await pool.end();
    }
  });

  it("does not cross-attribute parallel requests that share one wrapped pool", async () => {
    const httpCopy = await loadScope();
    const routePool = await loadPool();
    const ssrCopy = await loadScope();
    const pool = new Pool({ connectionString: UNIT_URL, max: 10 });
    installImmediateConnect(pool);
    routePool.instrumentPool(pool);
    const left = openScope(httpCopy, "77777777-7777-4777-8777-777777777777", "/left");
    const right = openScope(httpCopy, "88888888-8888-4888-8888-888888888888", "/right", "route_handler");
    try {
      await Promise.all([
        httpCopy.runWithRequestScope(left, async () => {
          const client = await pool.connect();
          await client.query("SELECT secret_sql");
          client.release();
        }),
        ssrCopy.runWithRequestScope(right, async () => {
          const client = await pool.connect();
          await client.query({ text: "SELECT secret_sql", rowMode: "array" });
          client.release();
        }),
      ]);
      finish(httpCopy, left, 200);
      finish(ssrCopy, right, 200);
      const leftSample = ssrCopy.requestScopeSnapshot().samples.find((item) => item.correlationId === left.id);
      const rightSample = httpCopy.requestScopeSnapshot().samples.find((item) => item.correlationId === right.id);
      expect(leftSample?.checkoutCount).toBe(1);
      expect(leftSample?.queryCount).toBe(1);
      expect(leftSample?.rawQueryCount).toBe(1);
      expect(leftSample?.prismaQueryCount).toBe(0);
      expect(rightSample?.checkoutCount).toBe(1);
      expect(rightSample?.queryCount).toBe(1);
      expect(rightSample?.rawQueryCount).toBe(0);
      expect(rightSample?.prismaQueryCount).toBe(1);
      expect(leftSample?.correlationId).not.toBe(rightSample?.correlationId);
      expect(routePool.poolMetrics(pool)?.query.count).toBe(2);
      expect(routePool.poolMetrics(pool)?.prisma.count).toBe(1);
    } finally {
      await pool.end();
    }
  });

  it("records failed checkout and failed query on the shared scope", async () => {
    const httpCopy = await loadScope();
    const routePool = await loadPool();
    const ssrCopy = await loadScope();
    const failingPool = new Pool({ connectionString: UNIT_URL, max: 10 });
    failingPool.connect = (() => Promise.reject(new Error("checkout failed"))) as Pool["connect"];
    routePool.instrumentPool(failingPool);
    const checkoutScope = openScope(httpCopy, "99999999-9999-4999-8999-999999999999", "/checkout-fail", "route_handler");
    try {
      await httpCopy.runWithRequestScope(checkoutScope, async () => {
        await failingPool.connect().catch(() => undefined);
      });
      finish(httpCopy, checkoutScope, 200);
      const checkoutSample = ssrCopy.requestScopeSnapshot().samples.find((item) => item.correlationId === checkoutScope.id);
      expect(checkoutSample?.outcome).toBe("complete");
      expect(checkoutSample?.checkoutCount).toBe(0);
      expect(checkoutSample?.releaseCount).toBe(0);
      expect(checkoutSample?.checkoutFailures).toBe(1);
      expect(checkoutSample?.queryCount).toBe(0);
      expect(routePool.poolMetrics(failingPool)?.acquires).toBe(0);
      expect(routePool.poolMetrics(failingPool)?.checkoutErrors).toBe(1);
    } finally {
      await failingPool.end();
    }

    const queryPool = new Pool({ connectionString: UNIT_URL, max: 10 });
    installImmediateConnect(queryPool, 0, true);
    routePool.instrumentPool(queryPool);
    const queryScope = openScope(ssrCopy, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "/query-fail");
    try {
      await httpCopy.runWithRequestScope(queryScope, async () => {
        const client = await queryPool.connect();
        await client.query("SELECT secret_sql", ["person@example.com"]).catch(() => undefined);
        client.release();
      });
      finish(ssrCopy, queryScope, 200);
      const querySample = httpCopy.requestScopeSnapshot().samples.find((item) => item.correlationId === queryScope.id);
      expect(querySample?.outcome).toBe("complete");
      expect(querySample?.checkoutCount).toBe(1);
      expect(querySample?.releaseCount).toBe(1);
      expect(querySample?.queryCount).toBe(1);
      expect(querySample?.queryFailures).toBe(1);
      expect(querySample?.rawQueryCount).toBe(1);
      expect(querySample?.prismaQueryCount).toBe(0);
      expect(JSON.stringify(querySample)).not.toContain("person@example.com");
      expect(JSON.stringify(querySample)).not.toContain("AB1234567");
      expect(routePool.poolMetrics(queryPool)?.query.errors).toBe(1);
      expect(routePool.poolMetrics(queryPool)?.query.count).toBe(1);
    } finally {
      await queryPool.end();
    }
  });

  it("seals from another copy and keeps the incomplete and sample caps", async () => {
    const httpCopy = await loadScope();
    const ssrCopy = await loadScope();
    const openCheckout = openScope(httpCopy, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "/open");
    let tracked: ReturnType<ScopeModule["startRequestCheckout"]> = null;
    httpCopy.runWithRequestScope(openCheckout, () => {
      tracked = ssrCopy.startRequestCheckout(performance.now());
    });
    finish(httpCopy, openCheckout, 200);
    expect(ssrCopy.requestScopeSnapshot().open).toBe(1);
    expect(ssrCopy.requestScopeSnapshot().samples).toHaveLength(0);
    ssrCopy.reconcileUnsealedRequestScopes();
    const incomplete = httpCopy.requestScopeSnapshot().incomplete.find((item) => item.correlationId === openCheckout.id);
    expect(incomplete?.outcome).toBe("incomplete");
    expect(incomplete?.checkoutCount).toBe(0);
    expect(incomplete?.pendingCheckouts).toBe(1);
    expect(tracked).not.toBeNull();

    const aborted = openScope(ssrCopy, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "/abort");
    finish(httpCopy, aborted, 499, true);
    expect(ssrCopy.requestScopeSnapshot().samples.find((item) => item.correlationId === aborted.id)?.outcome).toBe("aborted");

    httpCopy.resetRequestScopes();
    for (let index = 0; index < httpCopy.REQUEST_SCOPE_INCOMPLETE_LIMIT + 1; index += 1) {
      const scope = openScope(httpCopy, `incomplete-${index}`, `/stuck/${index}`);
      httpCopy.runWithRequestScope(scope, () => {
        ssrCopy.startRequestCheckout(performance.now());
      });
      finish(ssrCopy, scope, 200);
    }
    httpCopy.reconcileUnsealedRequestScopes();
    const capped = ssrCopy.requestScopeSnapshot();
    expect(capped.incomplete).toHaveLength(ssrCopy.REQUEST_SCOPE_INCOMPLETE_LIMIT);
    expect(capped.incompleteOverflow).toBe(1);
    expect(capped.incomplete.every((item) => item.outcome === "incomplete")).toBe(true);

    ssrCopy.resetRequestScopes();
    for (let index = 0; index < ssrCopy.REQUEST_SCOPE_SAMPLE_LIMIT + 1; index += 1) {
      const scope = openScope(ssrCopy, `sample-${index}`, `/done/${index}`);
      finish(httpCopy, scope, 204);
    }
    const sealed = httpCopy.requestScopeSnapshot();
    expect(sealed.samples).toHaveLength(httpCopy.REQUEST_SCOPE_SAMPLE_LIMIT);
    const drained = ssrCopy.drainRequestScopeWindow();
    expect(drained.samples).toHaveLength(ssrCopy.REQUEST_SCOPE_SAMPLE_LIMIT);
    expect(drained.sampleOverflow).toBe(1);
  });

  it("leaves process-wide histograms intact when request scopes are recorded", async () => {
    const httpCopy = await loadScope();
    const routePool = await loadPool();
    const runtime = await import("@/server/perf/runtime");
    const pool = new Pool({ connectionString: UNIT_URL, max: 10 });
    installImmediateConnect(pool);
    routePool.instrumentPool(pool);
    try {
      const outside = await pool.connect();
      await outside.query("SELECT 1");
      outside.release();
      expect(routePool.poolMetrics(pool)?.acquires).toBe(1);
      expect(routePool.poolMetrics(pool)?.releases).toBe(1);
      expect(routePool.poolMetrics(pool)?.query.count).toBe(1);
      expect(routePool.poolMetrics(pool)?.inFlight).toBe(0);
      expect(httpCopy.requestScopeSnapshot().samples).toHaveLength(0);
      expect(runtime.perfSnapshot().requests.count).toBe(0);

      const scope = openScope(httpCopy, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "/inside");
      await httpCopy.runWithRequestScope(scope, async () => {
        const client = await pool.connect();
        await client.query({ text: "SELECT 1", rowMode: "array" });
        client.release();
      });
      finish(httpCopy, scope, 200);
      const sample = httpCopy.requestScopeSnapshot().samples[0];
      expect(sample?.checkoutCount).toBe(1);
      expect(sample?.prismaQueryCount).toBe(1);
      expect(sample?.rawQueryCount).toBe(0);
      expect(routePool.poolMetrics(pool)?.acquires).toBe(2);
      expect(routePool.poolMetrics(pool)?.releases).toBe(2);
      expect(routePool.poolMetrics(pool)?.query.count).toBe(2);
      expect(routePool.poolMetrics(pool)?.prisma.count).toBe(1);
      expect(runtime.perfSnapshot().requests.count).toBe(1);
      expect(pool.options.max).toBe(10);
    } finally {
      await pool.end();
    }
  });

  it("carries the HTTP server context into a separately evaluated scope and pool", async () => {
    const httpRuntime = await loadRuntime();
    const ssrCopy = await loadScope();
    const routePool = await loadPool();
    const pool = new Pool({ connectionString: UNIT_URL, max: 10 });
    installImmediateConnect(pool);
    routePool.instrumentPool(pool);
    httpRuntime.installRequestInstrumentation();
    const seen: string[] = [];
    const server = createServer(async (_req: IncomingMessage, res: ServerResponse) => {
      const current = ssrCopy.currentRequestScope();
      seen.push(current?.id ?? "none");
      const client = await pool.connect();
      await client.query("SELECT secret_sql");
      await client.query({ text: "SELECT secret_sql", rowMode: "array" });
      client.release();
      res.statusCode = 200;
      res.end("ok");
    });
    const base = await listen(server);
    try {
      expect((await fetch(`${base}/dashboard`)).status).toBe(200);
      expect((await fetch(`${base}/api/health`)).status).toBe(200);
      expect(seen).toHaveLength(2);
      expect(seen[0]).toMatch(/^[0-9a-f-]{36}$/i);
      expect(seen[1]).toMatch(/^[0-9a-f-]{36}$/i);
      expect(seen[0]).not.toBe(seen[1]);
      expect(ssrCopy.currentRequestScope()).toBeNull();
      const samples = ssrCopy.requestScopeSnapshot().samples;
      const dashboard = samples.find((item) => item.route === "/dashboard");
      const health = samples.find((item) => item.route === "/api/health");
      expect(dashboard?.outcome).toBe("complete");
      expect(dashboard?.kind).toBe("page");
      expect(dashboard?.checkoutCount).toBe(1);
      expect(dashboard?.queryCount).toBe(2);
      expect(dashboard?.rawQueryCount).toBe(1);
      expect(dashboard?.prismaQueryCount).toBe(1);
      expect(health?.kind).toBe("route_handler");
      expect(health?.checkoutCount).toBe(1);
      expect(health?.queryCount).toBe(2);
      expect(health?.correlationId).not.toBe(dashboard?.correlationId);
      expect(routePool.poolMetrics(pool)?.acquires).toBe(2);
      expect(routePool.poolMetrics(pool)?.query.count).toBe(4);
      expect(routePool.poolMetrics(pool)?.prisma.count).toBe(2);
      expect(pool.options.max).toBe(10);
    } finally {
      await closeServer(server);
      await pool.end();
    }
  });
});
