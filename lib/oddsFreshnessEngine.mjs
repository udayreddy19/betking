import { marketSuspensionEngine } from './marketSuspensionEngine.mjs';
import { resolveStaleThresholdMs, getOddsFreshnessConfig } from './oddsFreshnessConfig.mjs';

const MARKET_ODDS_TIMESTAMPS = new Map(); // marketId -> { providerUpdatedAt, receivedAt, providerId }

export class OddsFreshnessEngine {
  constructor() {
    const cfg = getOddsFreshnessConfig();
    this.liveStaleThresholdMs = cfg.liveStaleThresholdMs;
    this.preMatchStaleThresholdMs = cfg.preMatchStaleThresholdMs;
  }

  /** Process incoming odds update timestamp & check freshness */
  async processOddsFreshness(marketId, providerUpdatedAt = null, isLive = true, providerId = null) {
    if (!marketId) return null;

    const now = Date.now();
    const receivedAt = now;
    const providerTimeMs = providerUpdatedAt ? new Date(providerUpdatedAt).getTime() : now;
    const ageMs = Math.max(0, now - providerTimeMs);

    MARKET_ODDS_TIMESTAMPS.set(marketId, {
      providerUpdatedAt: providerUpdatedAt || new Date().toISOString(),
      receivedAt: new Date(receivedAt).toISOString(),
      ageMs,
      providerId: providerId || null,
    });

    const threshold = resolveStaleThresholdMs({ isLive, providerId });
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
      thresholdMs: threshold,
      providerId: providerId || null,
    };
  }

  /** Get recorded freshness state for a market */
  getFreshnessState(marketId, isLive = true) {
    const record = MARKET_ODDS_TIMESTAMPS.get(marketId);
    if (!record) return { freshnessStatus: 'UNKNOWN', ageMs: 999999 };

    const ageMs = Date.now() - new Date(record.receivedAt).getTime();
    const threshold = resolveStaleThresholdMs({ isLive, providerId: record.providerId });

    let freshnessStatus = 'FRESH';
    if (ageMs > threshold * 2) freshnessStatus = 'INVALID';
    else if (ageMs > threshold) freshnessStatus = 'STALE';
    else if (ageMs > threshold / 2) freshnessStatus = 'WARNING';

    return { ...record, ageMs, freshnessStatus, thresholdMs: threshold };
  }
}

export const oddsFreshnessEngine = new OddsFreshnessEngine();
