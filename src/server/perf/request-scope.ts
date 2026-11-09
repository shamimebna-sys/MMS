import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import { slowRequestMs } from "@/server/perf/config";
import type { RequestKind } from "@/server/perf/redact";
import { onPerfReset, perfState, type RequestOutcome, type RequestSample } from "@/server/perf/state";

/**
 * Request-scoped pool and SQL attribution.
 *
 * The store is entered at the HTTP `request` boundary and holds only ids,
 * counters, and timestamps. It does not hold the request, the response,
 * SQL text, parameter values, headers, or credentials.
 *
 * Turbopack evaluates this file once per runtime graph. The store is the
 * AsyncLocalStorage on `globalThis[Symbol.for("mms.perf.request-als")]`,
 * so `run` and `getStore` share one instance. A module-local instance is
 * not kept: graphs that never call `run` would leave it unset, and the
 * bundler would fold their checkout read to null.
 *
 * Checkout attribution captures the store when `pool.connect()` is called.
 * The later grant or release may run on another request's stack when the
 * pool is saturated. Those events stay on the checkout that started them.
 *
 * Client-side query duration is `performance.now()` around `client.query`.
 * It includes JavaScript event-loop delay before the callback runs, so it
 * is not pure PostgreSQL execution time. `sqlDurationMs` sums every query.
 * `sqlUnionMs` merges overlapping intervals so parallel queries are not
 * treated as sequential elapsed time.
 *
 * Per-request CPU is not measured. `process.cpuUsage()` is process-wide and
 * cannot be split across overlapping requests. Event-loop delay and
 * utilization stay on the process monitor (`node_event_loop_delay_ms`).
 *
 * A sample stays unsealed after the response finishes while tracked
 * checkouts are still open. The existing perf-window flush, and runtime
 * stop, seal those samples as `incomplete`. There is no per-request timer.
 * Open scopes are capped so a response that never finishes cannot grow
 * without a visible incomplete sample. Unfinished queries are not given
 * an invented end time; their later callback still updates the process-wide
 * histograms only.
 *
 * Request-level checkout wait is the full time from `connect()` to grant,
 * including the first connection's setup. Process-wide `pg_checkout_wait_ms`
 * still excludes that setup and records it as `pg_connection_setup_ms`.
 */

const SCOPES = Symbol.for("mms.perf.requestScopes");
const RESET_HOOK = Symbol.for("mms.perf.requestScopes.reset");
const REQUEST_ALS = Symbol.for("mms.perf.request-als");
const RECENT_LIMIT = 8;
const QUERY_INTERVAL_LIMIT = 4_096;

export const REQUEST_SCOPE_SAMPLE_LIMIT = 32;
export const REQUEST_SCOPE_INCOMPLETE_LIMIT = 32;
export const REQUEST_SCOPE_OPEN_LIMIT = 2_000;

type QueryInterval = { start: number; end: number };

type OpenCheckout = {
  startedAt: number;
  grantedAt: number | null;
  settled: boolean;
};

type RequestScope = {
  id: string;
  method: string;
  route: string;
  kind: RequestKind;
  startedAt: number;
  responseEnded: boolean;
  aborted: boolean;
  status: number;
  durationMs: number;
  sealed: boolean;
  pending: Set<OpenCheckout>;
  active: Set<OpenCheckout>;
  checkoutCount: number;
  releaseCount: number;
  checkoutFailures: number;
  maxConcurrentCheckouts: number;
  checkoutWaitMs: number;
  maxCheckoutWaitMs: number;
  occupancyMs: number;
  maxOccupancyMs: number;
  queryCount: number;
  rawQueryCount: number;
  prismaQueryCount: number;
  queryFailures: number;
  sqlDurationMs: number;
  maxQueryMs: number;
  activeQueries: number;
  maxConcurrentQueries: number;
  queryIntervals: QueryInterval[];
  sqlUnionTruncated: boolean;
};

type CheckoutLink = {
  scope: RequestScope;
  checkout: OpenCheckout;
};

export type TrackedCheckout = {
  scope: RequestScope;
  checkout: OpenCheckout;
};

type Registry = {
  open: Map<string, RequestScope>;
  sealed: RequestSample[];
  incomplete: RequestSample[];
  windowSealed: RequestSample[];
  windowIncomplete: RequestSample[];
  incompleteOverflow: number;
  windowIncompleteOverflow: number;
  windowSampleOverflow: number;
  checkouts: WeakMap<object, CheckoutLink>;
};

export type RequestScopeWindow = {
  samples: RequestSample[];
  incomplete: RequestSample[];
  incompleteOverflow: number;
  sampleOverflow: number;
};

export type PublicRequestScope = {
  requestId: string;
  category: RequestKind;
  method: string;
  route: string;
  status: number;
  httpDurationMs: number;
  outcome: RequestOutcome;
  aborted: boolean;
  checkoutCount: number;
  releaseCount: number;
  checkoutFailures: number;
  pendingCheckouts: number;
  activeCheckouts: number;
  maxConcurrentCheckouts: number;
  checkoutWaitMs: number;
  maxCheckoutWaitMs: number;
  occupancyMs: number;
  maxOccupancyMs: number;
  queryCount: number;
  rawQueryCount: number;
  prismaQueryCount: number;
  queryFailures: number;
  sqlDurationMs: number;
  sqlUnionMs: number;
  sqlUnionTruncated: boolean;
  maxQueryMs: number;
  maxConcurrentQueries: number;
};

type RequestAlsGlobal = {
  [REQUEST_ALS]?: AsyncLocalStorage<RequestScope>;
};

function isRequestAls(value: unknown): value is AsyncLocalStorage<RequestScope> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { getStore?: unknown; run?: unknown };
  return typeof candidate.getStore === "function" && typeof candidate.run === "function";
}

/**
 * Server-only. Callers live under `src/server` and this module imports
 * `node:async_hooks`, so a browser bundle cannot evaluate it.
 * The slot is created synchronously. A re-entrant or overlapping load
 * keeps the instance already published on `globalThis`.
 */
function sharedRequestAls(): AsyncLocalStorage<RequestScope> {
  if (typeof window !== "undefined") {
    throw new Error("Request-scope storage is server-only.");
  }
  const host = globalThis as unknown as RequestAlsGlobal;
  const existing = host[REQUEST_ALS];
  if (isRequestAls(existing)) return existing;
  const created = new AsyncLocalStorage<RequestScope>();
  const raced = host[REQUEST_ALS];
  if (isRequestAls(raced)) return raced;
  host[REQUEST_ALS] = created;
  return created;
}

/** The process-wide request store. Every evaluation of this module returns the same object. */
export function sharedRequestAsyncLocalStorage(): AsyncLocalStorage<RequestScope> {
  return sharedRequestAls();
}

function emptyRegistry(): Registry {
  return {
    open: new Map(),
    sealed: [],
    incomplete: [],
    windowSealed: [],
    windowIncomplete: [],
    incompleteOverflow: 0,
    windowIncompleteOverflow: 0,
    windowSampleOverflow: 0,
    checkouts: new WeakMap(),
  };
}

function registryOrNull(): Registry | null {
  const globals = globalThis as Record<symbol, Registry | undefined>;
  return globals[SCOPES] ?? null;
}

function registry(): Registry {
  const globals = globalThis as Record<symbol, Registry | undefined>;
  const existing = globals[SCOPES];
  if (existing) return existing;
  const created = emptyRegistry();
  globals[SCOPES] = created;
  return created;
}

function readRequestScope(): RequestScope | null {
  const scope = sharedRequestAls().getStore();
  if (!scope || scope.sealed) return null;
  return scope;
}

export function currentRequestScope(): { id: string; kind: RequestKind } | null {
  const scope = readRequestScope();
  if (!scope) return null;
  return { id: scope.id, kind: scope.kind };
}

export function runWithRequestScope<T>(scope: RequestScope, run: () => T): T {
  return sharedRequestAls().run(scope, run);
}

export function createRequestScope(input: {
  id: string;
  method: string;
  route: string;
  kind: RequestKind;
  startedAt: number;
}): RequestScope {
  const scope: RequestScope = {
    id: input.id,
    method: input.method,
    route: input.route,
    kind: input.kind,
    startedAt: input.startedAt,
    responseEnded: false,
    aborted: false,
    status: 0,
    durationMs: 0,
    sealed: false,
    pending: new Set(),
    active: new Set(),
    checkoutCount: 0,
    releaseCount: 0,
    checkoutFailures: 0,
    maxConcurrentCheckouts: 0,
    checkoutWaitMs: 0,
    maxCheckoutWaitMs: 0,
    occupancyMs: 0,
    maxOccupancyMs: 0,
    queryCount: 0,
    rawQueryCount: 0,
    prismaQueryCount: 0,
    queryFailures: 0,
    sqlDurationMs: 0,
    maxQueryMs: 0,
    activeQueries: 0,
    maxConcurrentQueries: 0,
    queryIntervals: [],
    sqlUnionTruncated: false,
  };
  const current = registry();
  current.open.set(scope.id, scope);
  let guard = 0;
  while (current.open.size > REQUEST_SCOPE_OPEN_LIMIT && guard <= REQUEST_SCOPE_OPEN_LIMIT) {
    guard += 1;
    const oldest = current.open.values().next().value as RequestScope | undefined;
    if (!oldest) break;
    seal(oldest, "incomplete");
  }
  return scope;
}

export function discardRequestScope(scope: RequestScope): void {
  if (scope.sealed) return;
  scope.sealed = true;
  scope.pending.clear();
  scope.active.clear();
  scope.queryIntervals = [];
  registryOrNull()?.open.delete(scope.id);
}

export function finishRequestResponse(
  scope: RequestScope,
  input: { status: number; aborted: boolean; endedAt: number },
): void {
  if (scope.sealed || scope.responseEnded) return;
  scope.responseEnded = true;
  scope.aborted = input.aborted;
  scope.status = input.status;
  scope.durationMs = Math.max(0, input.endedAt - scope.startedAt);
  trySeal(scope);
}

export function startRequestCheckout(startedAt: number): TrackedCheckout | null {
  const scope = readRequestScope();
  if (!scope) return null;
  const checkout: OpenCheckout = { startedAt, grantedAt: null, settled: false };
  scope.pending.add(checkout);
  return { scope, checkout };
}

export function grantRequestCheckout(tracked: TrackedCheckout, client: object, grantedAt: number): void {
  const { scope, checkout } = tracked;
  if (checkout.settled) return;
  scope.pending.delete(checkout);
  if (scope.sealed) {
    checkout.settled = true;
    return;
  }
  checkout.grantedAt = grantedAt;
  scope.active.add(checkout);
  scope.checkoutCount += 1;
  const waited = Math.max(0, grantedAt - checkout.startedAt);
  scope.checkoutWaitMs += waited;
  if (waited > scope.maxCheckoutWaitMs) scope.maxCheckoutWaitMs = waited;
  if (scope.active.size > scope.maxConcurrentCheckouts) {
    scope.maxConcurrentCheckouts = scope.active.size;
  }
  registry().checkouts.set(client, { scope, checkout });
}

export function cancelRequestCheckout(tracked: TrackedCheckout): void {
  const { scope, checkout } = tracked;
  if (checkout.settled) return;
  checkout.settled = true;
  scope.pending.delete(checkout);
  if (scope.sealed) return;
  scope.checkoutFailures += 1;
  trySeal(scope);
}

export function releaseRequestCheckout(client: object): void {
  const current = registryOrNull();
  if (!current) return;
  const link = current.checkouts.get(client);
  if (!link) return;
  current.checkouts.delete(client);
  const { scope, checkout } = link;
  if (checkout.settled) return;
  checkout.settled = true;
  scope.active.delete(checkout);
  if (scope.sealed) return;
  const grantedAt = checkout.grantedAt ?? performance.now();
  const occupancy = Math.max(0, performance.now() - grantedAt);
  scope.occupancyMs += occupancy;
  if (occupancy > scope.maxOccupancyMs) scope.maxOccupancyMs = occupancy;
  scope.releaseCount += 1;
  trySeal(scope);
}

export function requestQueryScope(client: object): RequestScope | null {
  const link = registryOrNull()?.checkouts.get(client);
  if (!link || link.scope.sealed || link.checkout.settled) return null;
  return link.scope;
}

export function noteQueryStart(scope: RequestScope): void {
  if (scope.sealed) return;
  scope.activeQueries += 1;
  if (scope.activeQueries > scope.maxConcurrentQueries) {
    scope.maxConcurrentQueries = scope.activeQueries;
  }
}

/**
 * Records one finished query. Duration includes event-loop delay before
 * this callback, not only time inside PostgreSQL.
 */
export function noteQueryFinish(
  scope: RequestScope,
  started: number,
  ended: number,
  isError: boolean,
  prisma: boolean,
): void {
  if (scope.sealed) return;
  if (scope.activeQueries > 0) scope.activeQueries -= 1;
  const elapsed = Number.isFinite(ended - started) ? Math.max(0, ended - started) : 0;
  scope.queryCount += 1;
  scope.sqlDurationMs += elapsed;
  if (elapsed > scope.maxQueryMs) scope.maxQueryMs = elapsed;
  if (isError) scope.queryFailures += 1;
  if (prisma) scope.prismaQueryCount += 1;
  else scope.rawQueryCount += 1;
  if (scope.queryIntervals.length < QUERY_INTERVAL_LIMIT) {
    scope.queryIntervals.push({ start: started, end: ended });
  } else {
    scope.sqlUnionTruncated = true;
  }
}

export function unionMilliseconds(intervals: ReadonlyArray<QueryInterval>): number {
  const sorted = intervals
    .filter((interval) => Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.end > interval.start)
    .map((interval) => ({ start: interval.start, end: interval.end }))
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const first = sorted[0];
  if (!first) return 0;
  let total = 0;
  let start = first.start;
  let end = first.end;
  for (let index = 1; index < sorted.length; index += 1) {
    const next = sorted[index];
    if (!next) continue;
    if (next.start <= end) {
      if (next.end > end) end = next.end;
    } else {
      total += end - start;
      start = next.start;
      end = next.end;
    }
  }
  total += end - start;
  return total;
}

/** Seals response-ended scopes that still hold a checkout. Does not start a timer. */
export function reconcileUnsealedRequestScopes(): void {
  const current = registryOrNull();
  if (!current) return;
  for (const scope of [...current.open.values()]) {
    if (scope.sealed) {
      current.open.delete(scope.id);
      continue;
    }
    if (!scope.responseEnded) continue;
    if (scope.pending.size === 0 && scope.active.size === 0) {
      trySeal(scope);
      continue;
    }
    seal(scope, "incomplete");
  }
}

export function requestScopeSnapshot(): {
  open: number;
  samples: RequestSample[];
  incomplete: RequestSample[];
  incompleteOverflow: number;
} {
  const current = registryOrNull();
  if (!current) return { open: 0, samples: [], incomplete: [], incompleteOverflow: 0 };
  return {
    open: current.open.size,
    samples: current.sealed.slice(),
    incomplete: current.incomplete.slice(),
    incompleteOverflow: current.incompleteOverflow,
  };
}

export function drainRequestScopeWindow(): RequestScopeWindow {
  const current = registryOrNull();
  if (!current) return { samples: [], incomplete: [], incompleteOverflow: 0, sampleOverflow: 0 };
  const drained: RequestScopeWindow = {
    samples: current.windowSealed.splice(0),
    incomplete: current.windowIncomplete.splice(0),
    incompleteOverflow: current.windowIncompleteOverflow,
    sampleOverflow: current.windowSampleOverflow,
  };
  current.windowIncompleteOverflow = 0;
  current.windowSampleOverflow = 0;
  return drained;
}

/** Allowlisted log shape. Adding a RequestSample field does not log it by itself. */
export function publicRequestScope(sample: RequestSample): PublicRequestScope {
  return {
    requestId: sample.correlationId,
    category: sample.kind,
    method: sample.method,
    route: sample.route,
    status: sample.status,
    httpDurationMs: sample.durationMs,
    outcome: sample.outcome,
    aborted: sample.aborted,
    checkoutCount: sample.checkoutCount,
    releaseCount: sample.releaseCount,
    checkoutFailures: sample.checkoutFailures,
    pendingCheckouts: sample.pendingCheckouts,
    activeCheckouts: sample.activeCheckouts,
    maxConcurrentCheckouts: sample.maxConcurrentCheckouts,
    checkoutWaitMs: sample.checkoutWaitMs,
    maxCheckoutWaitMs: sample.maxCheckoutWaitMs,
    occupancyMs: sample.occupancyMs,
    maxOccupancyMs: sample.maxOccupancyMs,
    queryCount: sample.queryCount,
    rawQueryCount: sample.rawQueryCount,
    prismaQueryCount: sample.prismaQueryCount,
    queryFailures: sample.queryFailures,
    sqlDurationMs: sample.sqlDurationMs,
    sqlUnionMs: sample.sqlUnionMs,
    sqlUnionTruncated: sample.sqlUnionTruncated,
    maxQueryMs: sample.maxQueryMs,
    maxConcurrentQueries: sample.maxConcurrentQueries,
  };
}

export function resetRequestScopes(): void {
  const current = registryOrNull();
  if (!current) return;
  current.open.clear();
  current.sealed.length = 0;
  current.incomplete.length = 0;
  current.windowSealed.length = 0;
  current.windowIncomplete.length = 0;
  current.incompleteOverflow = 0;
  current.windowIncompleteOverflow = 0;
  current.windowSampleOverflow = 0;
  current.checkouts = new WeakMap();
}

function trySeal(scope: RequestScope): void {
  if (scope.sealed || !scope.responseEnded) return;
  if (scope.pending.size > 0 || scope.active.size > 0) return;
  seal(scope, scope.aborted ? "aborted" : "complete");
}

function seal(scope: RequestScope, outcome: RequestOutcome): void {
  const current = registry();
  if (scope.sealed) {
    current.open.delete(scope.id);
    return;
  }
  if (!scope.responseEnded) {
    scope.responseEnded = true;
    scope.durationMs = Math.max(0, performance.now() - scope.startedAt);
  }
  scope.sealed = true;
  const sample = buildSample(scope, outcome);
  scope.pending.clear();
  scope.active.clear();
  scope.queryIntervals = [];
  current.open.delete(scope.id);
  remember(sample);
  try {
    publishRequestSample(sample);
  } catch {
    perfState().faults += 1;
  }
}

function buildSample(scope: RequestScope, outcome: RequestOutcome): RequestSample {
  let checkoutWaitMs = scope.checkoutWaitMs;
  let maxCheckoutWaitMs = scope.maxCheckoutWaitMs;
  let occupancyMs = scope.occupancyMs;
  let maxOccupancyMs = scope.maxOccupancyMs;
  if (outcome === "incomplete") {
    const now = performance.now();
    for (const checkout of scope.pending) {
      const waited = Math.max(0, now - checkout.startedAt);
      checkoutWaitMs += waited;
      if (waited > maxCheckoutWaitMs) maxCheckoutWaitMs = waited;
    }
    for (const checkout of scope.active) {
      if (checkout.grantedAt === null) continue;
      const held = Math.max(0, now - checkout.grantedAt);
      occupancyMs += held;
      if (held > maxOccupancyMs) maxOccupancyMs = held;
    }
  }
  const sample: RequestSample = {
    correlationId: scope.id,
    method: scope.method,
    route: scope.route,
    status: scope.status,
    kind: scope.kind,
    durationMs: scope.durationMs,
    outcome,
    aborted: scope.aborted,
    checkoutCount: scope.checkoutCount,
    releaseCount: scope.releaseCount,
    checkoutFailures: scope.checkoutFailures,
    pendingCheckouts: scope.pending.size,
    activeCheckouts: scope.active.size,
    maxConcurrentCheckouts: scope.maxConcurrentCheckouts,
    checkoutWaitMs,
    maxCheckoutWaitMs,
    occupancyMs,
    maxOccupancyMs,
    queryCount: scope.queryCount,
    rawQueryCount: scope.rawQueryCount,
    prismaQueryCount: scope.prismaQueryCount,
    queryFailures: scope.queryFailures,
    sqlDurationMs: scope.sqlDurationMs,
    sqlUnionMs: unionMilliseconds(scope.queryIntervals),
    sqlUnionTruncated: scope.sqlUnionTruncated,
    maxQueryMs: scope.maxQueryMs,
    maxConcurrentQueries: scope.maxConcurrentQueries,
  };
  return Object.freeze(sample);
}

function remember(sample: RequestSample): void {
  const current = registry();
  if (sample.outcome === "incomplete") {
    if (pushBounded(current.incomplete, sample, REQUEST_SCOPE_INCOMPLETE_LIMIT)) current.incompleteOverflow += 1;
    if (pushBounded(current.windowIncomplete, sample, REQUEST_SCOPE_INCOMPLETE_LIMIT)) current.windowIncompleteOverflow += 1;
    return;
  }
  pushBounded(current.sealed, sample, REQUEST_SCOPE_SAMPLE_LIMIT);
  if (pushBounded(current.windowSealed, sample, REQUEST_SCOPE_SAMPLE_LIMIT)) current.windowSampleOverflow += 1;
}

function pushBounded<T>(buffer: T[], sample: T, limit: number): boolean {
  buffer.push(sample);
  if (buffer.length <= limit) return false;
  buffer.shift();
  return true;
}

function publishRequestSample(sample: RequestSample): void {
  const current = perfState();
  const failed = sample.status === 0 || sample.status >= 500;
  current.requests.record(sample.durationMs, failed, slowRequestMs());
  current.recent.push(sample);
  if (current.recent.length > RECENT_LIMIT) current.recent.shift();
  if (sample.durationMs >= slowRequestMs()) {
    current.slowSamples.push(sample);
    if (current.slowSamples.length > RECENT_LIMIT) current.slowSamples.shift();
  }
}

const resetGlobals = globalThis as Record<symbol, boolean | undefined>;
if (!resetGlobals[RESET_HOOK]) {
  resetGlobals[RESET_HOOK] = true;
  onPerfReset(resetRequestScopes);
}
