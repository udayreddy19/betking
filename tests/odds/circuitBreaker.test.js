import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateFeedCircuitBreaker,
  applyCircuitBreakerToMarkets,
  resetMatchCircuitBreaker,
} from '../../lib/odds-v3/circuitBreaker.mjs';
import {
  filterSelectionVolatility,
  applyVolatilityProtection,
  clearVolatilityHistory,
} from '../../lib/odds-v3/volatilityFilter.mjs';
import { MultiProviderOrchestrator } from '../../lib/odds-v3/adapters/MultiProviderOrchestrator.mjs';

describe('OddsEngine V3 — Circuit Breaker & Volatility Filter', () => {
  beforeEach(() => {
    resetMatchCircuitBreaker('test_match_1');
    clearVolatilityHistory('test_match_1');
  });

  describe('Circuit Breaker', () => {
    it('allows fresh ticks with low latency', () => {
      const res = evaluateFeedCircuitBreaker('test_match_1', {
        timestamp: new Date().toISOString(),
      });
      expect(res.isTripped).toBe(false);
      expect(res.latencyMs).toBeLessThanOrEqual(500);
    });

    it('trips circuit breaker when latency exceeds threshold', () => {
      const staleTimestamp = new Date(Date.now() - 4000).toISOString();
      const res = evaluateFeedCircuitBreaker('test_match_1', {
        timestamp: staleTimestamp,
      }, { maxFeedLatencyMs: 2500 });

      expect(res.isTripped).toBe(true);
      expect(res.reason).toContain('FEED_LATENCY_EXCEEDED');
    });

    it('suspends markets when circuit breaker is tripped', () => {
      const markets = [
        { marketId: 'm1', status: 'OPEN', selections: [{ id: 's1', price: 1.95 }] },
      ];
      const protectedMarkets = applyCircuitBreakerToMarkets(markets, true, 'LATENCY_TRIP');
      expect(protectedMarkets[0].status).toBe('SUSPENDED');
      expect(protectedMarkets[0].suspensionReason).toBe('LATENCY_TRIP');
      expect(protectedMarkets[0].selections[0].suspended).toBe(true);
    });
  });

  describe('Volatility Spike Filter', () => {
    it('allows normal price movements', () => {
      filterSelectionVolatility('test_match_1', 'winner', { id: 'team_a', price: 1.85 });
      const next = filterSelectionVolatility('test_match_1', 'winner', { id: 'team_a', price: 1.90 });
      expect(next.isQuarantined).toBe(false);
      expect(next.wasDampened).toBe(false);
      expect(next.price).toBe(1.90);
    });

    it('dampens abnormal price jumps without verified event', () => {
      filterSelectionVolatility('test_match_1', 'winner', { id: 'team_a', price: 1.50 });
      // 100% price spike without wicket/boundary
      const next = filterSelectionVolatility('test_match_1', 'winner', { id: 'team_a', price: 3.00 }, { eventType: null });
      expect(next.wasDampened).toBe(true);
      expect(next.price).toBeLessThan(3.00);
    });

    it('allows price jump when legitimate game event occurred', () => {
      filterSelectionVolatility('test_match_1', 'winner', { id: 'team_a', price: 1.50 });
      const next = filterSelectionVolatility('test_match_1', 'winner', { id: 'team_a', price: 2.80 }, { eventType: 'WICKET' });
      expect(next.isQuarantined).toBe(false);
      expect(next.wasDampened).toBe(false);
      expect(next.price).toBe(2.80);
    });
  });

  describe('Multi-Provider Orchestrator', () => {
    it('handles heartbeat and failover to healthy secondary provider', () => {
      const orchestrator = new MultiProviderOrchestrator({ defaultProvider: 'feed_a', failoverThresholdErrors: 2 });
      orchestrator.registerProvider('feed_a', { priority: 100, isPrimary: true });
      orchestrator.registerProvider('feed_b', { priority: 80 });

      expect(orchestrator.getActiveProvider().providerId).toBe('feed_a');

      orchestrator.recordError('feed_a');
      const failoverResult = orchestrator.recordError('feed_a'); // triggers failover on 2nd error

      expect(failoverResult.to).toBe('feed_b');
      expect(orchestrator.getActiveProvider().providerId).toBe('feed_b');
    });
  });
});
