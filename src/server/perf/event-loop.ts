import { monitorEventLoopDelay, performance, type IntervalHistogram } from "node:perf_hooks";
import { perfState } from "@/server/perf/state";

const RESOLUTION_MS = 20;

/** One histogram per process. `enable()` does not ref the event loop on Node 20. */
export function startEventLoopMonitor(): IntervalHistogram {
  const current = perfState();
  if (current.eventLoop) return current.eventLoop;
  const histogram = monitorEventLoopDelay({ resolution: RESOLUTION_MS });
  histogram.enable();
  current.eventLoop = histogram;
  current.elu = performance.eventLoopUtilization();
  return histogram;
}

export function stopEventLoopMonitor(): void {
  const current = perfState();
  if (!current.eventLoop) return;
  current.eventLoop.disable();
  current.eventLoop = null;
  current.elu = null;
}

export function eventLoopResolutionMs(): number {
  return RESOLUTION_MS;
}

export function readEventLoop(): {
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
  utilization: number | null;
} | null {
  const current = perfState();
  const histogram = current.eventLoop;
  if (!histogram) return null;
  return {
    p50: nsToMs(histogram.percentile(50)),
    p95: nsToMs(histogram.percentile(95)),
    p99: nsToMs(histogram.percentile(99)),
    max: nsToMs(histogram.max),
    utilization: takeUtilization(),
  };
}

export function resetEventLoopWindow(): void {
  const histogram = perfState().eventLoop;
  histogram?.reset();
  const current = perfState();
  if (current.eventLoop) current.elu = performance.eventLoopUtilization();
}

function takeUtilization(): number | null {
  if (typeof performance.eventLoopUtilization !== "function") return null;
  const current = perfState();
  const previous = current.elu ?? performance.eventLoopUtilization();
  const delta = performance.eventLoopUtilization(previous);
  current.elu = delta;
  if (!Number.isFinite(delta.utilization)) return null;
  return delta.utilization;
}

function nsToMs(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return value / 1e6;
}
