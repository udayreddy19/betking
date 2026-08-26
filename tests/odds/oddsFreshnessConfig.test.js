import { describe, it, expect } from 'vitest';
import { getOddsFreshnessConfig, resolveStaleThresholdMs } from '../../lib/oddsFreshnessConfig.mjs';
import { oddsFreshnessEngine } from '../../lib/oddsFreshnessEngine.mjs';

describe('odds freshness centralized config', () => {
  it('exposes live/prematch thresholds from config (not scattered literals)', () => {
    const cfg = getOddsFreshnessConfig();
    expect(cfg.liveStaleThresholdMs).toBeGreaterThanOrEqual(15_000);
    expect(cfg.preMatchStaleThresholdMs).toBe(300_000);
    expect(cfg.derivedFrom.LIVE_SCORES_POLL_MS).toBeGreaterThan(0);
  });

  it('honors provider-specific override when set', () => {
    const prev = process.env.ODDS_STALE_MS_CRICBUZZ;
    process.env.ODDS_STALE_MS_CRICBUZZ = '45000';
    try {
      expect(resolveStaleThresholdMs({ isLive: true, providerId: 'cricbuzz' })).toBe(45000);
    } finally {
      if (prev == null) delete process.env.ODDS_STALE_MS_CRICBUZZ;
      else process.env.ODDS_STALE_MS_CRICBUZZ = prev;
    }
  });

  it('marks very old provider timestamps as STALE/INVALID', async () => {
    const old = new Date(Date.now() - 120_000).toISOString();
    const result = await oddsFreshnessEngine.processOddsFreshness('mkt_fresh_test', old, true, 'cricbuzz');
    expect(['STALE', 'INVALID']).toContain(result.freshnessStatus);
  });
});
