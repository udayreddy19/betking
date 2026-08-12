/**
 * Odds Freshness & Automatic Stale Odds Guard
 * Evaluates odds age_ms, classifies freshness (FRESH, WARNING, STALE, INVALID),
 * and automatically triggers STALE_ODDS market suspension.
 */

import { marketSuspensionEngine } from './marketSuspensionEngine.mjs';

const MARKET_ODDS_TIMESTAMPS = new Map(); // marketId -> { providerUpdatedAt, receivedAt }

export class OddsFreshnessEngine {
  constructor() {
    this.liveStaleThresholdMs = 15000; // 15 seconds for live markets
    this.preMatchStaleThresholdMs = 300000; // 5 minutes for pre-match markets
  }

  /** Process incoming odds update timestamp & check freshness */
  async processOddsFreshness(marketId, providerUpdatedAt = null, isLive = true) {
    if (!marketId) return null;

    const now = Date.now();
    const receivedAt = now;
    const providerTimeMs = providerUpdatedAt ? new Date(providerUpdatedAt).getTime() : now;
    const ageMs = Math.max(0, now - providerTimeMs);

    MARKET_ODDS_TIMESTAMPS.set(marketId, {
      providerUpdatedAt: providerUpdatedAt || new Date().toISOString(),
      receivedAt: new Date(receivedAt).toISOString(),
      ageMs,
    });

    const threshold = isLive ? this.liveStaleThresholdMs : this.preMatchStaleThresholdMs;
    let freshnessStatus = 'FRESH';

    if (ageMs > threshold * 2) {
      freshnessStatus = 'INVALID';
    } else if (ageMs > threshold) {
      freshnessStatus = 'STALE';
    } else if (ageMs > threshold / 2) {
      freshnessStatus = 'WARNING';
    }

    if (freshnessStatus === 'STALE' || freshnessStatus === 'INVALID') {
      await marketSuspensionEngine.addSuspensionCause(marketId, 'STALE_ODDS', 'SYSTEM');
    } else {
      await marketSuspensionEngine.clearSuspensionCause(marketId, 'STALE_ODDS');
    }

    return {
      marketId,
      ageMs,
      freshnessStatus,
      isLive,
    };
  }

  /** Get recorded freshness state for a market */
  getFreshnessState(marketId, isLive = true) {
    const record = MARKET_ODDS_TIMESTAMPS.get(marketId);
    if (!record) return { freshnessStatus: 'UNKNOWN', ageMs: 999999 };

    const ageMs = Date.now() - new Date(record.receivedAt).getTime();
    const threshold = isLive ? this.liveStaleThresholdMs : this.preMatchStaleThresholdMs;

    let freshnessStatus = 'FRESH';
    if (ageMs > threshold) freshnessStatus = 'STALE';
    else if (ageMs > threshold / 2) freshnessStatus = 'WARNING';

    return { ...record, ageMs, freshnessStatus };
  }
}

export const oddsFreshnessEngine = new OddsFreshnessEngine();
