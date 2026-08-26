#!/usr/bin/env node
/**
 * Measure provider update intervals from live_feed_health / provider health logs when present.
 * Read-only. Does not change ODDS_LIVE_STALE_MS.
 */
import 'dotenv/config';
import { query } from '../db/pg.js';
import { getOddsFreshnessConfig } from '../lib/oddsFreshnessConfig.mjs';

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

async function main() {
  const cfg = getOddsFreshnessConfig();
  console.log(JSON.stringify({ event: 'ODDS_FRESHNESS_CONFIG', ...cfg }, null, 2));

  const tables = await query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('provider_health_log', 'live_feed_health', 'provider_poll_metrics', 'odds_provider_ticks')
  `);
  const available = tables.rows.map((r) => r.table_name);
  if (!available.length) {
    console.log(JSON.stringify({
      event: 'ODDS_FRESHNESS_MEASUREMENT',
      status: 'NO_PROVIDER_INTERVAL_TABLE',
      message: 'No provider interval history table found. Config thresholds recorded only; p95 NOT MEASURED from live samples.',
      comparedToLiveStaleMs: cfg.liveStaleThresholdMs,
    }, null, 2));
    process.exit(0);
  }

  // Best-effort: provider_health_log with created_at gaps per provider
  if (available.includes('provider_health_log')) {
    const rows = await query(`
      SELECT provider_id, created_at
      FROM provider_health_log
      WHERE created_at > NOW() - INTERVAL '24 hours'
      ORDER BY provider_id, created_at
    `);
    const byProvider = new Map();
    for (const row of rows.rows) {
      const key = row.provider_id || 'unknown';
      if (!byProvider.has(key)) byProvider.set(key, []);
      byProvider.get(key).push(new Date(row.created_at).getTime());
    }
    const report = [];
    for (const [providerId, times] of byProvider) {
      const intervals = [];
      for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1]);
      const stats = summarize(intervals);
      report.push({
        providerId,
        ...stats,
        vsLiveStaleMs: cfg.liveStaleThresholdMs,
        staleThresholdAggressive: stats ? stats.p95Ms > cfg.liveStaleThresholdMs : null,
      });
    }
    console.log(JSON.stringify({ event: 'ODDS_FRESHNESS_MEASUREMENT', status: 'OK', providers: report }, null, 2));
    process.exit(0);
  }

  console.log(JSON.stringify({
    event: 'ODDS_FRESHNESS_MEASUREMENT',
    status: 'TABLE_UNSUPPORTED',
    available,
    message: 'Tables exist but no supported measurement query; p95 NOT MEASURED.',
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ event: 'ODDS_FRESHNESS_MEASUREMENT', status: 'ERROR', error: err.message }));
  process.exit(1);
});
