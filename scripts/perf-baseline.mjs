#!/usr/bin/env node
/**
 * Lightweight perf baseline — P50/P95/P99 for key HTTP endpoints.
 *
 * Usage:
 *   node scripts/perf-baseline.mjs
 *   PERF_BASE_URL=https://oddsyra.com node scripts/perf-baseline.mjs
 */

const baseUrl = process.env.PERF_BASE_URL || 'http://127.0.0.1:5001';
const samples = Number(process.env.PERF_SAMPLES || 30);

const ENDPOINTS = [
  { name: 'health', path: '/health' },
  { name: 'readiness', path: '/readiness' },
  { name: 'sports_catalog', path: '/api/v1/sports' },
];

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function sample(path) {
  const start = performance.now();
  const res = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(15000) });
  const ms = performance.now() - start;
  return { ok: res.ok, ms, status: res.status };
}

async function benchEndpoint({ name, path }) {
  const timings = [];
  let failures = 0;
  for (let i = 0; i < samples; i += 1) {
    try {
      const r = await sample(path);
      timings.push(r.ms);
      if (!r.ok) failures += 1;
    } catch {
      failures += 1;
    }
  }
  timings.sort((a, b) => a - b);
  return {
    name,
    path,
    samples: timings.length,
    failures,
    p50Ms: Math.round(percentile(timings, 50)),
    p95Ms: Math.round(percentile(timings, 95)),
    p99Ms: Math.round(percentile(timings, 99)),
    minMs: Math.round(timings[0] || 0),
    maxMs: Math.round(timings[timings.length - 1] || 0),
  };
}

async function main() {
  const results = [];
  for (const ep of ENDPOINTS) {
    results.push(await benchEndpoint(ep));
  }
  const report = {
    event: 'PERF_BASELINE',
    baseUrl,
    samples,
    recordedAt: new Date().toISOString(),
    endpoints: results,
  };
  console.log(JSON.stringify(report, null, 2));
  const slow = results.find((r) => r.p95Ms > 500 || r.failures > 0);
  process.exit(slow ? 2 : 0);
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
