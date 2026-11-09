import type { Pool } from "pg";
import type { IntervalHistogram } from "node:perf_hooks";
import { DurationHistogram } from "@/server/perf/histogram";
import type { RequestKind } from "@/server/perf/redact";

const STATE = Symbol.for("mms.perf.state");

export type RequestOutcome = "complete" | "aborted" | "incomplete";

/**
 * Sealed request sample. Fields are counts and durations only.
 * SQL text, parameters, headers, and bodies are never stored.
 * `sqlDurationMs` is the sum of client-side query intervals.
 * `sqlUnionMs` is their non-overlapping union.
 * Per-request CPU is intentionally absent.
 */
export type RequestSample = {
  correlationId: string;
  method: string;
  route: string;
  status: number;
  kind: RequestKind;
  durationMs: number;
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

export type PoolMetrics = {
  checkoutWait: DurationHistogram;
  connectionSetup: DurationHistogram;
  query: DurationHistogram;
  prisma: DurationHistogram;
  acquires: number;
  releases: number;
  checkoutErrors: number;
  connects: number;
  inFlight: number;
  maxInFlight: number;
  maxWaiting: number;
  saturatedSamples: number;
};

export type PerfState = {
  requests: DurationHistogram;
  recent: RequestSample[];
  slowSamples: RequestSample[];
  faults: number;
  pools: Set<Pool>;
  poolMetrics: WeakMap<Pool, PoolMetrics>;
  timer: ReturnType<typeof setInterval> | null;
  eventLoop: IntervalHistogram | null;
  elu: { idle: number; active: number; utilization: number } | null;
  windowStarted: number;
  sink: (line: string) => void;
  httpInstalled: boolean;
  originalEmit: ((this: unknown, event: string | symbol, ...args: unknown[]) => boolean) | null;
  exitHook: (() => void) | null;
};

function createState(): PerfState {
  return {
    requests: new DurationHistogram(),
    recent: [],
    slowSamples: [],
    faults: 0,
    pools: new Set(),
    poolMetrics: new WeakMap(),
    timer: null,
    eventLoop: null,
    elu: null,
    windowStarted: Date.now(),
    sink: defaultSink,
    httpInstalled: false,
    originalEmit: null,
    exitHook: null,
  };
}

function defaultSink(line: string): void {
  process.stdout.write(`${line}\n`);
}

const perfResets: Array<() => void> = [];

export function onPerfReset(reset: () => void): void {
  perfResets.push(reset);
}

export function perfState(): PerfState {
  const globalState = globalThis as Record<symbol, PerfState | undefined>;
  const existing = globalState[STATE];
  if (existing) return existing;
  const created = createState();
  globalState[STATE] = created;
  return created;
}

export function createPoolMetrics(): PoolMetrics {
  return {
    checkoutWait: new DurationHistogram(),
    connectionSetup: new DurationHistogram(),
    query: new DurationHistogram(),
    prisma: new DurationHistogram(),
    acquires: 0,
    releases: 0,
    checkoutErrors: 0,
    connects: 0,
    inFlight: 0,
    maxInFlight: 0,
    maxWaiting: 0,
    saturatedSamples: 0,
  };
}

export function guard(work: () => void): void {
  try {
    work();
  } catch {
    perfState().faults += 1;
  }
}

export function setPerfSink(sink: ((line: string) => void) | null): void {
  perfState().sink = sink ?? defaultSink;
}

export function resetPerfCounters(): void {
  const current = perfState();
  current.requests = new DurationHistogram();
  current.recent = [];
  current.slowSamples = [];
  current.faults = 0;
  current.windowStarted = Date.now();
  current.pools.clear();
  current.poolMetrics = new WeakMap();
  for (const reset of perfResets) reset();
}
