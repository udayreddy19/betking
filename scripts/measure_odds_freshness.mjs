#!/usr/bin/env node
/**
 * Measure provider update intervals from provider_health_logs.
 * Idle gaps (provider not polled) are excluded from p95 — only active windows
 * where consecutive HEALTHY samples are within ACTIVE_GAP_MS (default 60s).
 * Read-only. Does not change ODDS_LIVE_STALE_MS.
 */
import 'dotenv/config';
import { query } from '../db/pg.js';
import { getOddsFreshnessConfig } from '../lib/oddsFreshnessConfig.mjs';

const ACTIVE_GAP_MS = Number(process.env.ODDS_FRESHNESS_ACTIVE_GAP_MS) || 60_000;
const LOOKBACK_HOURS = Number(process.env.ODDS_FRESHNESS_LOOKBACK_HOURS) || 24;

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarize(intervalsMs) {
  const sorted = [...intervalsMs].filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    sampleCount: sorted.length,
    averageMs: Math.round(sum / sorted.length),
    medianMs: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    maxMs: sorted[sorted.length - 1],
  };
}

function reportProvider(providerId, times, statuses, cfg) {
  const allIntervals = [];
  const activeIntervals = [];
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    allIntervals.push(gap);
    if (gap > 0 && gap <= ACTIVE_GAP_MS) activeIntervals.push(gap);
  }
  const activeStats = summarize(activeIntervals);
  const failureCount = statuses.filter((s) => /fail|error|offline|down|degraded|timeout/i.test(String(s || ''))).length;
  const timeoutCount = statuses.filter((s) => /timeout/i.test(String(s || ''))).length;
  const p95 = activeStats?.p95Ms ?? null;
  let status = 'INSUFFICIENT_ACTIVE_SAMPLES';
  if (activeStats && p95 != null) {
    status = p95 <= cfg.liveStaleThresholdMs ? 'PASS' : 'P95_ABOVE_STALE_THRESHOLD';
  }
  return {
    provider: providerId,
    eventCount: times.length,
    ...activeStats,
    failureCount,
    timeoutCount,
    failureRate: times.length ? Number((failureCount / times.length).toFixed(4)) : null,
    timeoutRate: times.length ? Number((timeoutCount / times.length).toFixed(4)) : null,
    activeGapFilterMs: ACTIVE_GAP_MS,
    rawIntervalCount: allIntervals.length,
    currentStaleThresholdMs: cfg.liveStaleThresholdMs,
    status,
    methodology: `p95 from consecutive provider_health_logs gaps ≤ ${ACTIVE_GAP_MS}ms (active windows only)`,
  };
}

async function main() {
  const cfg = getOddsFreshnessConfig();
  console.log(JSON.stringify({ event: 'ODDS_FRESHNESS_CONFIG', ...cfg }, null, 2));

  const tables = await query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'provider_health_logs'
  `);
  if (!tables.rows.length) {
    console.log(JSON.stringify({
      event: 'ODDS_FRESHNESS_MEASUREMENT',
      status: 'NO_PROVIDER_INTERVAL_TABLE',
      message: 'provider_health_logs missing; p95 NOT MEASURED.',
      comparedToLiveStaleMs: cfg.liveStaleThresholdMs,
    }, null, 2));
    process.exit(0);
  }

  const rows = await query(
    `
    SELECT provider_name, created_at, status
    FROM provider_health_logs
    WHERE created_at > NOW() - ($1::text || ' hours')::interval
    ORDER BY provider_name, created_at
  `,
    [String(LOOKBACK_HOURS)],
  );

  if (!rows.rows.length) {
    console.log(JSON.stringify({
      event: 'ODDS_FRESHNESS_MEASUREMENT',
      status: 'NO_SAMPLES',
      message: 'No provider_health_logs rows in lookback; p95 NOT MEASURED.',
      comparedToLiveStaleMs: cfg.liveStaleThresholdMs,
    }, null, 2));
    process.exit(0);
  }

  const byProvider = new Map();
  for (const row of rows.rows) {
    const key = row.provider_name || 'unknown';
    if (!byProvider.has(key)) byProvider.set(key, { times: [], statuses: [] });
    byProvider.get(key).times.push(new Date(row.created_at).getTime());
    byProvider.get(key).statuses.push(row.status);
  }

  const providers = [];
  for (const [providerId, data] of byProvider) {
    providers.push(reportProvider(providerId, data.times, data.statuses, cfg));
  }

  console.log(JSON.stringify({
    event: 'ODDS_FRESHNESS_MEASUREMENT',
    status: 'OK',
    sourceTable: 'provider_health_logs',
    lookbackHours: LOOKBACK_HOURS,
    activeGapFilterMs: ACTIVE_GAP_MS,
    providers,
    summaryTable: providers.map((p) => ({
      provider: p.provider,
      p95Ms: p.p95Ms,
      currentStaleThresholdMs: p.currentStaleThresholdMs,
      status: p.status,
      sampleCount: p.sampleCount ?? 0,
    })),
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ event: 'ODDS_FRESHNESS_MEASUREMENT', status: 'ERROR', error: err.message }));
  process.exit(1);
});
