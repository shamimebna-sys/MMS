import { performance } from "node:perf_hooks";
import type { Pool, PoolClient } from "pg";
import { slowQueryMs } from "@/server/perf/config";
import {
  cancelRequestCheckout,
  grantRequestCheckout,
  noteQueryFinish,
  noteQueryStart,
  releaseRequestCheckout,
  requestQueryScope,
  startRequestCheckout,
  type TrackedCheckout,
} from "@/server/perf/request-scope";
import { createPoolMetrics, guard, perfState, type PoolMetrics } from "@/server/perf/state";

const POOL_MARK = Symbol.for("mms.perf.pool");
const QUERY_MARK = Symbol.for("mms.perf.query");

type MarkedPool = Pool & { [POOL_MARK]?: true };
type MarkedClient = PoolClient & { [QUERY_MARK]?: true };
type QueryCaller = (...args: unknown[]) => unknown;

/**
 * Checkout wait is the time from `pool.connect()` until a client that was already
 * connected is handed back. The checkout that first receives a client, after pg emits
 * `connect` for it, is `pg_connection_setup_ms`: that interval includes the handshake,
 * and pg does not expose a split between queueing and TCP for that first checkout.
 * A later waiter can start before the client exists; it is still checkout wait.
 * Query time is `client.query` only, after checkout. Nested transactions reuse the
 * checked-out client (savepoints), so they add query samples and not checkouts.
 *
 * Prisma's adapter sends `rowMode: "array"`. Those round-trips are `prisma_adapter_query_ms`
 * and are also included in `pg_query_ms`. They exclude checkout and query compilation.
 * Prisma's query event stringifies parameter values, so it is not enabled.
 *
 * `pool.query()` uses this `connect` wrapper and then `client.query`, so it is not
 * wrapped again. The request is captured here, when checkout starts. Grant, query,
 * and release stay on that checkout when a saturated pool runs the callback on
 * another request's stack. Query timing is client-side and includes event-loop
 * delay before the callback. It does not change query results or connection ownership.
 */
export function instrumentPool(pool: Pool): void {
  const marked = pool as MarkedPool;
  if (marked[POOL_MARK]) return;
  marked[POOL_MARK] = true;

  const current = perfState();
  current.pools.add(pool);
  current.poolMetrics.set(pool, createPoolMetrics());
  const freshClients = new WeakSet<object>();

  const originalConnect = pool.connect.bind(pool) as Pool["connect"];
  pool.connect = function connect(callback?: (err: Error | undefined, client: PoolClient | undefined, done: (release?: Error) => void) => void) {
    const requestedAt = performance.now();
    const tracked = startRequestCheckout(requestedAt);
    const settle = (error: unknown, client: PoolClient | undefined) => {
      finishCheckout(pool, requestedAt, error, client, freshClients, tracked);
    };
    if (typeof callback === "function") {
      try {
        originalConnect((err, client, done) => {
          guard(() => settle(err, client));
          callback(err, client, done);
        });
      } catch (error) {
        if (tracked) cancelRequestCheckout(tracked);
        throw error;
      }
      guard(() => noteSaturation(pool));
      return;
    }
    let pending: Promise<PoolClient>;
    try {
      pending = originalConnect() as Promise<PoolClient>;
    } catch (error) {
      if (tracked) cancelRequestCheckout(tracked);
      throw error;
    }
    guard(() => noteSaturation(pool));
    return pending.then(
      (client) => {
        guard(() => settle(undefined, client));
        return client;
      },
      (error: unknown) => {
        guard(() => settle(error, undefined));
        throw error;
      },
    );
  } as Pool["connect"];

  pool.on("connect", (client: PoolClient) => {
    freshClients.add(client);
  });
  pool.on("release", (_error: Error | undefined, client: PoolClient) => {
    guard(() => {
      if (client) freshClients.delete(client);
      const metrics = metricsFor(pool);
      metrics.releases += 1;
      if (metrics.inFlight > 0) metrics.inFlight -= 1;
      noteSaturation(pool);
      if (client) releaseRequestCheckout(client);
    });
  });

  const originalEnd = pool.end.bind(pool) as (callback?: (err: Error) => void) => Promise<void> | void;
  pool.end = function end(callback?: (err: Error) => void) {
    detachPool(pool);
    if (typeof callback === "function") return originalEnd(callback);
    return originalEnd();
  } as Pool["end"];
}

export function poolMetrics(pool: Pool): PoolMetrics | null {
  return perfState().poolMetrics.get(pool) ?? null;
}

function metricsFor(pool: Pool): PoolMetrics {
  const existing = perfState().poolMetrics.get(pool);
  if (existing) return existing;
  const created = createPoolMetrics();
  perfState().poolMetrics.set(pool, created);
  return created;
}

function detachPool(pool: Pool): void {
  perfState().pools.delete(pool);
}

function finishCheckout(
  pool: Pool,
  requestedAt: number,
  error: unknown,
  client: PoolClient | undefined,
  freshClients: WeakSet<object>,
  tracked: TrackedCheckout | null,
): void {
  const metrics = metricsFor(pool);
  if (error || !client) {
    metrics.checkoutErrors += 1;
    if (tracked) cancelRequestCheckout(tracked);
    return;
  }
  watchClient(client, metrics);
  const grantedAt = performance.now();
  const latency = grantedAt - requestedAt;
  const createdForThisCheckout = freshClients.has(client);
  if (createdForThisCheckout) freshClients.delete(client);
  if (createdForThisCheckout) {
    metrics.connectionSetup.record(latency, false, Number.POSITIVE_INFINITY);
    metrics.connects += 1;
  } else {
    metrics.checkoutWait.record(latency, false, Number.POSITIVE_INFINITY);
  }
  metrics.acquires += 1;
  metrics.inFlight += 1;
  if (metrics.inFlight > metrics.maxInFlight) metrics.maxInFlight = metrics.inFlight;
  if (tracked) grantRequestCheckout(tracked, client, grantedAt);
}

function noteSaturation(pool: Pool): void {
  const metrics = metricsFor(pool);
  const waiting = pool.waitingCount;
  if (waiting > metrics.maxWaiting) metrics.maxWaiting = waiting;
  const max = pool.options.max ?? 0;
  if (waiting > 0 && pool.idleCount === 0 && pool.totalCount >= max) {
    metrics.saturatedSamples += 1;
  }
}

function watchClient(client: PoolClient, metrics: PoolMetrics): void {
  const marked = client as MarkedClient;
  if (marked[QUERY_MARK]) return;
  const original = client.query.bind(client) as QueryCaller;
  marked.query = function query(this: PoolClient, ...args: unknown[]) {
    return timeQuery(original, args, metrics, client);
  } as PoolClient["query"];
  marked[QUERY_MARK] = true;
}

function timeQuery(original: QueryCaller, args: unknown[], metrics: PoolMetrics, client: PoolClient): unknown {
  const started = performance.now();
  const prismaAdapter = isPrismaAdapterQuery(args[0]);
  const scope = requestQueryScope(client);
  if (scope) guard(() => noteQueryStart(scope));
  let settled = false;
  const finish = (isError: boolean) => {
    if (settled) return;
    settled = true;
    const ended = performance.now();
    guard(() => {
      const elapsed = ended - started;
      const slowAt = slowQueryMs();
      metrics.query.record(elapsed, isError, slowAt);
      if (prismaAdapter) metrics.prisma.record(elapsed, isError, slowAt);
      if (scope) noteQueryFinish(scope, started, ended, isError, prismaAdapter);
    });
  };

  const callbackIndex = lastFunctionIndex(args);
  if (callbackIndex >= 0) {
    const userCallback = args[callbackIndex] as (...callbackArgs: unknown[]) => unknown;
    const wrappedArgs = args.slice();
    wrappedArgs[callbackIndex] = (...callbackArgs: unknown[]) => {
      finish(Boolean(callbackArgs[0]));
      return userCallback(...callbackArgs);
    };
    try {
      return original(...wrappedArgs);
    } catch (error) {
      finish(true);
      throw error;
    }
  }

  try {
    const result = original(...args);
    if (isPromise(result)) {
      return result.then(
        (value) => {
          finish(false);
          return value;
        },
        (error: unknown) => {
          finish(true);
          throw error;
        },
      );
    }
    finish(false);
    return result;
  } catch (error) {
    finish(true);
    throw error;
  }
}

function isPrismaAdapterQuery(config: unknown): boolean {
  if (!config || typeof config !== "object") return false;
  return (config as { rowMode?: unknown }).rowMode === "array";
}

function lastFunctionIndex(args: unknown[]): number {
  for (let index = args.length - 1; index >= 0; index -= 1) {
    if (typeof args[index] === "function") return index;
  }
  return -1;
}

function isPromise(value: unknown): value is Promise<unknown> {
  return typeof value === "object" && value !== null && typeof (value as Promise<unknown>).then === "function";
}
