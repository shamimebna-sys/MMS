/**
 * Off unless explicitly enabled, except local `next dev`.
 * Vitest stays off so existing tests keep the unwrapped pool.
 * Production stays off until PERF_INSTRUMENTATION=1.
 */
export function isPerfEnabled(): boolean {
  const flag = process.env.PERF_INSTRUMENTATION?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  if (flag === "1" || flag === "true" || flag === "on") return true;
  if (process.env.VITEST) return false;
  return process.env.NODE_ENV === "development";
}

export function perfWindowMs(): number {
  return readNumber("PERF_WINDOW_MS", 10_000, 1_000, 60_000);
}

export function slowRequestMs(): number {
  return readNumber("PERF_SLOW_REQUEST_MS", 1_000, 0, 120_000);
}

export function slowQueryMs(): number {
  return readNumber("PERF_SLOW_QUERY_MS", 100, 0, 120_000);
}

function readNumber(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
