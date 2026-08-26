/**
 * Centralized odds freshness thresholds.
 * Defaults are conservative relative to aggregator poll (~2s) + cache TTL (~1s).
 * Provider-specific overrides via env — do not scatter magic numbers.
 *
 * Measured production p95 intervals were NOT available at authoring time;
 * defaults use configured poll intervals × safety factor.
 */

import { LIVE_SCORES_POLL_MS, AGGREGATOR_CACHE_TTL_MS } from './livePolling.mjs';

function envMs(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Safety multiplier over poll interval before marking live odds STALE. */
const LIVE_POLL_FACTOR = envMs('ODDS_LIVE_STALE_POLL_FACTOR', 8);

const DEFAULT_LIVE_STALE_MS = Math.max(
  15_000,
  LIVE_SCORES_POLL_MS * LIVE_POLL_FACTOR + AGGREGATOR_CACHE_TTL_MS,
);

export function getOddsFreshnessConfig() {
  return {
    liveStaleThresholdMs: envMs('ODDS_LIVE_STALE_MS', DEFAULT_LIVE_STALE_MS),
    preMatchStaleThresholdMs: envMs('ODDS_PREMATCH_STALE_MS', 300_000),
    providerOverrides: {
      cricbuzz: envMs('ODDS_STALE_MS_CRICBUZZ', 0) || null,
      crex: envMs('ODDS_STALE_MS_CREX', 0) || null,
      fancode: envMs('ODDS_STALE_MS_FANCODE', 0) || null,
      espn: envMs('ODDS_STALE_MS_ESPN', 0) || null,
      '10cric2026': envMs('ODDS_STALE_MS_TENCRIC', 0) || null,
    },
    derivedFrom: {
      LIVE_SCORES_POLL_MS,
      AGGREGATOR_CACHE_TTL_MS,
      LIVE_POLL_FACTOR,
      DEFAULT_LIVE_STALE_MS,
    },
  };
}

export function resolveStaleThresholdMs({ isLive = true, providerId = null } = {}) {
  const cfg = getOddsFreshnessConfig();
  if (!isLive) return cfg.preMatchStaleThresholdMs;
  const key = String(providerId || '').toLowerCase();
  const override = key ? cfg.providerOverrides[key] : null;
  if (override && override > 0) return override;
  return cfg.liveStaleThresholdMs;
}
