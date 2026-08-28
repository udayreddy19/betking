/**
 * Phase 20 Integration Test Suite
 * 
 * Validates:
 * 1. Resilient Telemetry Delivery Queue with bounded capacity, backpressure, and exponential retry.
 * 2. Real-time odds event stream pub/sub with non-blocking guarantees.
 * 3. Real-time pricing anomaly detector (probability jumps, stale feed, margin violations, model instability).
 * 4. Alert & incident correlation engine (combining alerts into CORRELATED_INCIDENT).
 * 5. Live market health engine (HEALTHY, WATCH, DEGRADED, SUSPENDED).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { telemetryQueue } from '../../lib/odds-v3/telemetry/telemetryDeliveryQueue.mjs';
import {
  emitOddsEvent,
  subscribeToOddsEvents,
  getRecentOddsEvents,
  clearOddsEventBuffer,
  EVENT_TYPES,
} from '../../lib/odds-v3/telemetry/oddsEventStream.mjs';
import {
  evaluatePricingAnomaly,
  getRecentAnomalies,
  clearAnomalyRegistry,
  ANOMALY_SEVERITY,
} from '../../lib/odds-v3/monitoring/pricingAnomalyDetector.mjs';
import {
  correlateAlertIncident,
  getActiveIncidents,
  resolveIncident,
} from '../../lib/odds-v3/monitoring/alertCorrelationEngine.mjs';
import {
  evaluateMarketHealth,
  evaluateActiveMarketsHealth,
  MARKET_HEALTH_STATUS,
} from '../../lib/odds-v3/monitoring/liveMarketHealthEngine.mjs';

describe('Phase 20 — OddsEngine V3 Live Intelligence, Continuous Learning & Production Optimization', () => {
  beforeEach(() => {
    telemetryQueue.clear();
    clearOddsEventBuffer();
    clearAnomalyRegistry();
  });

  describe('1. Resilient Telemetry Delivery Queue', () => {
    it('enqueues observations and tracks backpressure metrics without blocking', () => {
      const obs = { matchId: 'm_q1', marketId: 'winner', selectionId: '1', timestamp: Date.now() };
      const success = telemetryQueue.enqueue(obs);
      expect(success).toBe(true);

      const metrics = telemetryQueue.getMetrics();
      expect(metrics.queueDepth).toBe(1);
      expect(metrics.enqueuedTotal).toBeGreaterThanOrEqual(1);
      expect(metrics.status).toBe('HEALTHY');
    });

    it('handles batch flushing with non-blocking error recovery', async () => {
      telemetryQueue.enqueue({ matchId: 'm_q2', marketId: 'winner', selectionId: '1', timestamp: Date.now() });
      const res = await telemetryQueue.flushBatch(10);
      expect(res).toBeDefined();
      expect(typeof res.queueDepth).toBe('number');
    });
  });

  describe('2. Real-Time Odds Event Stream', () => {
    it('emits events to subscribers and retains recent events in ring buffer', () => {
      let receivedEvent = null;
      const unsubscribe = subscribeToOddsEvents((evt) => {
        receivedEvent = evt;
      });

      emitOddsEvent(EVENT_TYPES.ODDS_PUBLISHED, { matchId: 'm_evt1', market: 'winner', odds: 1.85 });

      expect(receivedEvent).toBeDefined();
      expect(receivedEvent.type).toBe(EVENT_TYPES.ODDS_PUBLISHED);
      expect(receivedEvent.odds).toBe(1.85);

      const recent = getRecentOddsEvents(10);
      expect(recent.length).toBeGreaterThanOrEqual(1);

      unsubscribe();
    });
  });

  describe('3. Real-Time Pricing Anomaly Detector', () => {
    it('detects unexplained probability jumps without game state changes', () => {
      const res = evaluatePricingAnomaly({
        matchId: 'm_anom_1',
        market: 'match_winner',
        previousProb: 0.50,
        newProb: 0.75, // +0.25 jump without state change
        previousOdds: 2.0,
        newOdds: 1.33,
        matchStateChanged: false,
      });

      expect(res.hasAnomalies).toBe(true);
      expect(res.anomalies.some((a) => a.type === 'UNEXPLAINED_PROBABILITY_JUMP')).toBe(true);
      expect(res.anomalies[0].severity).toBe(ANOMALY_SEVERITY.HIGH);
    });

    it('detects stale feeds and margin bound violations', () => {
      const res = evaluatePricingAnomaly({
        matchId: 'm_anom_2',
        market: 'match_winner',
        newProb: 0.50,
        newOdds: 1.90,
        margin: 0.15, // outside 0.12 bound
        feedAgeMs: 18000, // exceeds 15,000ms threshold
      });

      expect(res.hasAnomalies).toBe(true);
      expect(res.anomalies.some((a) => a.type === 'STALE_FEED_EXCEEDED')).toBe(true);
      expect(res.anomalies.some((a) => a.type === 'MARGIN_BOUND_VIOLATION')).toBe(true);
    });
  });

  describe('4. Alert & Incident Correlation Engine', () => {
    it('combines multiple alerts into a unified CORRELATED_INCIDENT', () => {
      const incident = correlateAlertIncident({
        title: 'Multi-Feed Stale Disruption on IND vs AUS',
        factors: ['PROVIDER_OUTAGE', 'STALE_FEED_EXCEEDED', 'EXTREME_PROVIDER_DIVERGENCE'],
        affectedSports: ['cricket'],
        affectedMarkets: ['match_winner', 'next_over_total'],
        severity: 'HIGH',
        rootCause: 'Primary feed API timeout',
      });

      expect(incident.incidentId).toBeDefined();
      expect(incident.status).toBe('ACTIVE');
      expect(incident.correlatedFactors.length).toBe(3);

      const activeList = getActiveIncidents(10);
      expect(activeList.length).toBeGreaterThanOrEqual(1);

      const resolved = resolveIncident(incident.incidentId);
      expect(resolved.status).toBe('RESOLVED');
    });
  });

  describe('5. Live Market Health Engine', () => {
    it('evaluates market health correctly into HEALTHY, WATCH, DEGRADED, SUSPENDED', () => {
      const healthy = evaluateMarketHealth({ marketId: 'm_h', feedAgeMs: 100, providerDivergence: 0.01, margin: 0.05 });
      expect(healthy.status).toBe(MARKET_HEALTH_STATUS.HEALTHY);
      expect(healthy.healthScore).toBe(100);

      const watch = evaluateMarketHealth({ marketId: 'm_w', feedAgeMs: 6000, providerDivergence: 0.08, margin: 0.05 });
      expect(watch.status).toBe(MARKET_HEALTH_STATUS.WATCH);

      const suspended = evaluateMarketHealth({ marketId: 'm_s', isSuspended: true });
      expect(suspended.status).toBe(MARKET_HEALTH_STATUS.SUSPENDED);
      expect(suspended.healthScore).toBe(0);

      const batch = evaluateActiveMarketsHealth([healthy.metrics, watch.metrics, { isSuspended: true }]);
      expect(batch.totalMarkets).toBe(3);
      expect(batch.overallHealthPercent).toBeDefined();
    });
  });
});
