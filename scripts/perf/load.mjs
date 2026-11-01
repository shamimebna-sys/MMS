const base = process.env.PERF_URL || "http://127.0.0.1:3000/api/health";
const concurrency = Number(process.env.PERF_CONCURRENCY || 20);
const requests = Number(process.env.PERF_REQUESTS || 100);

const samples = [];
let failures = 0;
let cursor = 0;

async function worker() {
  while (cursor < requests) {
    const current = cursor;
    cursor += 1;
    if (current >= requests) return;
    const started = performance.now();
    try {
      const response = await fetch(base);
      if (!response.ok) failures += 1;
      samples.push(performance.now() - started);
    } catch {
      failures += 1;
      samples.push(performance.now() - started);
    }
  }
}

const started = performance.now();
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const elapsed = performance.now() - started;
samples.sort((a, b) => a - b);
const p95 = samples[Math.min(samples.length - 1, Math.ceil(samples.length * 0.95) - 1)] ?? 0;
console.log(
  JSON.stringify({
    url: base,
    concurrency,
    requests,
    failures,
    elapsedMs: Math.round(elapsed),
    p95Ms: Math.round(p95),
    localTarget: "health p95 under 500ms at 20 concurrent requests on this machine",
  }),
);
if (failures > 0 || p95 > 500) process.exitCode = 1;
