import type { Pool } from "pg";
import { isPerfEnabled, perfWindowMs, slowQueryMs, slowRequestMs } from "@/server/perf/config";
import { readEventLoop, resetEventLoopWindow, startEventLoopMonitor, stopEventLoopMonitor } from "@/server/perf/event-loop";
import { DurationHistogram } from "@/server/perf/histogram";
import { instrumentPool, poolMetrics } from "@/server/perf/pool";
import { installRequestInstrumentation } from "@/server/perf/request";
import {
  drainRequestScopeWindow,
  publicRequestScope,
  reconcileUnsealedRequestScopes,
  requestScopeSnapshot,
  resetRequestScopes,
  type PublicRequestScope,
} from "@/server/perf/request-scope";
import { perfState, resetPerfCounters, setPerfSink, type PoolMetrics, type RequestSample } from "@/server/perf/state";

export { isPerfEnabled, perfWindowMs, setPerfSink, slowQueryMs, slowRequestMs };
export { instrumentPool, poolMetrics };
export { installRequestInstrumentation, uninstallRequestInstrumentation } from "@/server/perf/request";
export { resetPerfCounters };
export { currentRequestScope, requestScopeSnapshot, unionMilliseconds } from "@/server/perf/request-scope";
export { REQUEST_SCOPE_INCOMPLETE_LIMIT, REQUEST_SCOPE_OPEN_LIMIT, REQUEST_SCOPE_SAMPLE_LIMIT } from "@/server/perf/request-scope";

const RECENT_LIMIT = 8;

type HistSummary = {
  count: number;
  errors: number;
  slow: number;
  max: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
};

type LogLine = {
  ts: string;
  pid: number;
  metric: string;
  windowMs: number;
  elapsedMs: number;
  count: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
  errors: number;
  slow: number;
  slowMs?: number;
  utilization?: number | null;
  resolutionMs?: number;
  faults?: number;
  pool?: {
    max: number;
    totalCount: number;
    idleCount: number;
    waitingCount: number;
    maxWaiting: number;
    maxInFlight: number;
    saturatedSamples: number;
    acquires: number;
    releases: number;
    inFlight: number;
    checkoutErrors: number;
    queryErrors: number;
  };
  samples?: Array<{
    correlationId: string;
    method: string;
    route: string;
    status: number;
    kind: string;
    durationMs: number;
  }>;
};

/** Attaches counters to the existing shared pool. Does not open a pool or change `max`. */
export function attachSharedPool(pool: Pool): void {
  if (!isPerfEnabled()) return;
  instrumentPool(pool);
  startPerfRuntime();
}

/** HTTP timing and the process monitor. Pool attachment happens when `db` loads. */
export function installServerPerf(): void {
  if (!isPerfEnabled()) return;
  installRequestInstrumentation();
  startPerfRuntime();
}

export function startPerfRuntime(): void {
  if (!isPerfEnabled()) return;
  const current = perfState();
  startEventLoopMonitor();
  if (!current.exitHook) {
    const hook = () => stopPerfRuntime();
    current.exitHook = hook;
    process.once("beforeExit", hook);
  }
  if (current.timer) return;
  const timer = setInterval(() => {
    try {
      flushPerfLogs();
    } catch {
      perfState().faults += 1;
    }
  }, perfWindowMs());
  timer.unref();
  current.timer = timer;
}

export function stopPerfRuntime(): void {
  reconcileUnsealedRequestScopes();
  const current = perfState();
  if (current.timer) {
    clearInterval(current.timer);
    current.timer = null;
  }
  if (current.exitHook) {
    process.removeListener("beforeExit", current.exitHook);
    current.exitHook = null;
  }
  stopEventLoopMonitor();
}

export function flushPerfLogs(): string[] {
  reconcileUnsealedRequestScopes();
  const lines = buildLines();
  const sink = perfState().sink;
  for (const line of lines) {
    try {
      sink(line);
    } catch {
      perfState().faults += 1;
    }
  }
  resetWindows();
  return lines;
}

export function perfSnapshot(): {
  enabled: boolean;
  faults: number;
  eventLoopMonitors: number;
  timerRef: boolean | null;
  instrumentedPools: number;
  requests: HistSummary & { recent: RequestSample[] };
  requestScopes: ReturnType<typeof requestScopeSnapshot>;
  eventLoop: ReturnType<typeof readEventLoop>;
} {
  const current = perfState();
  return {
    enabled: isPerfEnabled(),
    faults: current.faults,
    eventLoopMonitors: current.eventLoop ? 1 : 0,
    timerRef: timerHasRef(current.timer),
    instrumentedPools: current.pools.size,
    requests: { ...summarize(current.requests), recent: current.recent.map((sample) => ({ ...sample })) },
    requestScopes: requestScopeSnapshot(),
    eventLoop: readEventLoop(),
  };
}

export function resetPerfForTests(): void {
  stopPerfRuntime();
  resetPerfCounters();
  resetRequestScopes();
}

function buildLines(): string[] {
  const current = perfState();
  const elapsedMs = Math.max(0, Date.now() - current.windowStarted);
  const windowMs = perfWindowMs();
  const ts = new Date().toISOString();
  const pid = process.pid;
  const lines: LogLine[] = [];

  if (current.requests.count > 0) {
    const summary = summarize(current.requests);
    lines.push({
      ts,
      pid,
      metric: "http_request_ms",
      windowMs,
      elapsedMs,
      ...summary,
      slowMs: slowRequestMs(),
      samples: current.slowSamples.slice(-RECENT_LIMIT).map(publicSample),
    });
  }

  for (const pool of current.pools) {
    const metrics = current.poolMetrics.get(pool);
    if (!metrics) continue;
    lines.push(poolLine(ts, pid, windowMs, elapsedMs, pool, metrics, current.faults));
    pushDuration(lines, ts, pid, windowMs, elapsedMs, "pg_checkout_wait_ms", metrics.checkoutWait, metrics.checkoutErrors, 0);
    pushDuration(lines, ts, pid, windowMs, elapsedMs, "pg_connection_setup_ms", metrics.connectionSetup, 0, 0);
    if (metrics.query.count > 0) {
      pushDuration(lines, ts, pid, windowMs, elapsedMs, "pg_query_ms", metrics.query, metrics.query.errors, slowQueryMs());
    }
    if (metrics.prisma.count > 0) {
      pushDuration(lines, ts, pid, windowMs, elapsedMs, "prisma_adapter_query_ms", metrics.prisma, metrics.prisma.errors, slowQueryMs());
    }
  }

  const loop = readEventLoop();
  if (loop) {
    lines.push({
      ts,
      pid,
      metric: "node_event_loop_delay_ms",
      windowMs,
      elapsedMs,
      count: 1,
      p50: round3(loop.p50),
      p95: round3(loop.p95),
      p99: round3(loop.p99),
      max: round3(loop.max),
      errors: 0,
      slow: 0,
      utilization: round3(loop.utilization),
      resolutionMs: 20,
    });
  }

  const encoded = lines.map((line) => JSON.stringify(line));
  const scopeLine = requestScopeLine(ts, pid, windowMs, elapsedMs);
  if (scopeLine) encoded.push(scopeLine);
  return encoded;
}

function requestScopeLine(ts: string, pid: number, windowMs: number, elapsedMs: number): string | null {
  const window = drainRequestScopeWindow();
  if (window.samples.length === 0 && window.incomplete.length === 0 && window.incompleteOverflow === 0 && window.sampleOverflow === 0) {
    return null;
  }
  return JSON.stringify({
    ts,
    pid,
    metric: "http_request_scope",
    windowMs,
    elapsedMs,
    sampleOverflow: window.sampleOverflow,
    incompleteOverflow: window.incompleteOverflow,
    samples: window.samples.map(loggedScope),
    incomplete: window.incomplete.map(loggedScope),
  });
}

function loggedScope(sample: RequestSample): PublicRequestScope {
  const pub = publicRequestScope(sample);
  return {
    ...pub,
    httpDurationMs: round3(pub.httpDurationMs) ?? 0,
    checkoutWaitMs: round3(pub.checkoutWaitMs) ?? 0,
    maxCheckoutWaitMs: round3(pub.maxCheckoutWaitMs) ?? 0,
    occupancyMs: round3(pub.occupancyMs) ?? 0,
    maxOccupancyMs: round3(pub.maxOccupancyMs) ?? 0,
    sqlDurationMs: round3(pub.sqlDurationMs) ?? 0,
    sqlUnionMs: round3(pub.sqlUnionMs) ?? 0,
    maxQueryMs: round3(pub.maxQueryMs) ?? 0,
  };
}

function poolLine(ts: string, pid: number, windowMs: number, elapsedMs: number, pool: Pool, metrics: PoolMetrics, faults: number): LogLine {
  return {
    ts,
    pid,
    metric: "pg_pool",
    windowMs,
    elapsedMs,
    count: metrics.acquires,
    p50: null,
    p95: null,
    p99: null,
    max: null,
    errors: metrics.checkoutErrors,
    slow: 0,
    faults,
    pool: {
      max: pool.options.max ?? 0,
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
      maxWaiting: metrics.maxWaiting,
      maxInFlight: metrics.maxInFlight,
      saturatedSamples: metrics.saturatedSamples,
      acquires: metrics.acquires,
      releases: metrics.releases,
      inFlight: metrics.inFlight,
      checkoutErrors: metrics.checkoutErrors,
      queryErrors: metrics.query.errors,
    },
  };
}

function pushDuration(
  lines: LogLine[],
  ts: string,
  pid: number,
  windowMs: number,
  elapsedMs: number,
  metric: string,
  histogram: DurationHistogram,
  errors: number,
  slowMs: number,
): void {
  if (histogram.count === 0 && errors === 0) return;
  const summary = summarize(histogram);
  lines.push({
    ts,
    pid,
    metric,
    windowMs,
    elapsedMs,
    count: summary.count,
    p50: round3(summary.p50),
    p95: round3(summary.p95),
    p99: round3(summary.p99),
    max: round3(summary.max),
    errors,
    slow: summary.slow,
    ...(slowMs > 0 ? { slowMs } : {}),
  });
}

function summarize(histogram: DurationHistogram): HistSummary {
  return {
    count: histogram.count,
    errors: histogram.errors,
    slow: histogram.slow,
    max: histogram.max,
    p50: histogram.percentile(0.5),
    p95: histogram.percentile(0.95),
    p99: histogram.percentile(0.99),
  };
}

function publicSample(sample: RequestSample): NonNullable<LogLine["samples"]>[number] {
  return {
    correlationId: sample.correlationId,
    method: sample.method,
    route: sample.route,
    status: sample.status,
    kind: sample.kind,
    durationMs: round3(sample.durationMs) ?? 0,
  };
}

function resetWindows(): void {
  const current = perfState();
  current.requests.reset();
  current.slowSamples = [];
  current.faults = 0;
  current.windowStarted = Date.now();
  for (const pool of current.pools) {
    const metrics = current.poolMetrics.get(pool);
    if (!metrics) continue;
    metrics.checkoutWait.reset();
    metrics.connectionSetup.reset();
    metrics.query.reset();
    metrics.prisma.reset();
    metrics.acquires = 0;
    metrics.releases = 0;
    metrics.checkoutErrors = 0;
    metrics.connects = 0;
    metrics.maxWaiting = 0;
    metrics.maxInFlight = metrics.inFlight;
    metrics.saturatedSamples = 0;
  }
  resetEventLoopWindow();
}

function timerHasRef(timer: ReturnType<typeof setInterval> | null): boolean | null {
  if (!timer || typeof timer.hasRef !== "function") return null;
  return timer.hasRef();
}

function round3(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}
