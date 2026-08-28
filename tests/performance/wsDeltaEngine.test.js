import { describe, it, expect, beforeEach } from 'vitest';
import { computeSnapshotDelta, clearDeltaHistory } from '../../lib/wsDeltaEngine.mjs';
import { cacheOddsSnapshot, getCachedOddsSnapshot, invalidateOddsCache } from '../../lib/oddsCacheEngine.mjs';

describe('Performance & Concurrency — Caching and Delta Streamer', () => {
  beforeEach(() => {
    clearDeltaHistory('test_match_delta');
    invalidateOddsCache('test_match_cache');
  });

  describe('WebSocket Delta Engine', () => {
    it('returns FULL snapshot on initial frame', () => {
      const snap1 = {
        stateVersion: 1,
        status: 'OK',
        markets: [
          { marketId: 'winner', status: 'OPEN', selections: [{ id: 'team_a', price: 1.90 }] },
        ],
      };
      const res = computeSnapshotDelta('test_match_delta', snap1);
      expect(res.type).toBe('FULL');
      expect(res.markets.length).toBe(1);
    });

    it('returns compact DELTA on subsequent ticks with price changes', () => {
      const snap1 = {
        stateVersion: 1,
        status: 'OK',
        markets: [
          { marketId: 'winner', status: 'OPEN', selections: [{ id: 'team_a', price: 1.90 }] },
        ],
      };
      computeSnapshotDelta('test_match_delta', snap1);

      const snap2 = {
        stateVersion: 2,
        status: 'OK',
        markets: [
          { marketId: 'winner', status: 'OPEN', selections: [{ id: 'team_a', price: 1.95 }] },
        ],
      };
      const delta = computeSnapshotDelta('test_match_delta', snap2);
      expect(delta.type).toBe('DELTA');
      expect(delta.changedCount).toBe(1);
      expect(delta.markets[0].selections[0].price).toBe(1.95);
    });
  });

  describe('Odds Cache Engine', () => {
    it('caches and retrieves odds snapshots', async () => {
      const sample = { matchId: 'test_match_cache', status: 'OK', version: 42 };
      await cacheOddsSnapshot('test_match_cache', sample, 10);
      const retrieved = await getCachedOddsSnapshot('test_match_cache');
      expect(retrieved).toEqual(sample);

      await invalidateOddsCache('test_match_cache');
      const afterInvalidation = await getCachedOddsSnapshot('test_match_cache');
      expect(afterInvalidation).toBeNull();
    });
  });
});
