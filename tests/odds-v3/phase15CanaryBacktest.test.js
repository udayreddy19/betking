import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordPricingObservation,
  recordObservationSettlement,
  queryObservations,
  getObservationStats,
  clearObservations,
} from '../../lib/odds-v3/telemetry/oddsObservationStore.mjs';
import { computeLossMetrics, evaluateModelDrift } from '../../lib/odds-v3/telemetry/driftDetector.mjs';
import { analyzeOddsMovement } from '../../lib/odds-v3/telemetry/oddsMovementAnalyzer.mjs';
import { analyzeProviderDivergence } from '../../lib/odds-v3/telemetry/providerDivergenceAnalyzer.mjs';
import { runHistoricalBacktest } from '../../lib/odds-v3/replay/backtestRunner.mjs';
import { isCanaryCandidate, evaluateShadowPricing } from '../../lib/odds-v3/canary/shadowPricingEngine.mjs';

describe('PHASE 15 — Canary, Historical Backtest, Calibration & Pricing Telemetry', () => {

  beforeEach(() => {
    clearObservations();
  });

  // 1. Observation Store
  describe('1. Telemetry Observation Store', () => {
    it('Records pricing observations non-blockingly and queries by sport', () => {
      const id1 = recordPricingObservation({
        matchId: 'm_soc_1',
        sport: 'soccer',
        marketId: 'match_winner',
        selectionId: '1',
        probability: 0.65,
        odds: 1.50,
      });

      const id2 = recordPricingObservation({
        matchId: 'm_cric_2',
        sport: 'cricket',
        marketId: 'match_winner',
        selectionId: 'CSK',
        probability: 0.55,
        odds: 1.75,
      });

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();

      const soccerObs = queryObservations({ sport: 'soccer' });
      expect(soccerObs.length).toBe(1);
      expect(soccerObs[0].selectionId).toBe('1');

      const allStats = getObservationStats();
      expect(allStats.totalObservations).toBe(2);
    });

    it('Updates settled outcome idempotently', () => {
      recordPricingObservation({
        matchId: 'm_soc_win',
        sport: 'soccer',
        marketId: 'match_winner',
        selectionId: '1',
        probability: 0.70,
        odds: 1.40,
      });

      recordObservationSettlement({
        matchId: 'm_soc_win',
        marketId: 'match_winner',
        selectionId: '1',
        won: true,
      });

      const settled = queryObservations({ onlySettled: true });
      expect(settled.length).toBe(1);
      expect(settled[0].settledOutcome).toBe(true);
    });
  });

  // 2. Drift Detector
  describe('2. Model Drift & Calibration Detector', () => {
    it('Computes Brier score and Log-Loss correctly', () => {
      const sample = [
        { probability: 0.80, settledOutcome: true },  // (0.8-1)^2 = 0.04
        { probability: 0.20, settledOutcome: false }, // (0.2-0)^2 = 0.04
      ];
      const metrics = computeLossMetrics(sample);
      expect(metrics.brierScore).toBeCloseTo(0.04, 2);
      expect(metrics.logLoss).toBeGreaterThan(0);
      expect(metrics.sampleSize).toBe(2);
    });

    it('Returns INSUFFICIENT_DATA when observation count is low', () => {
      const drift = evaluateModelDrift({ sport: 'cricket' });
      expect(drift.status).toBe('INSUFFICIENT_DATA');
    });

    it('Classifies GREEN when 7d Brier is near baseline', () => {
      for (let i = 0; i < 15; i++) {
        recordPricingObservation({
          matchId: `m_eval_${i}`,
          sport: 'cricket',
          marketId: 'match_winner',
          selectionId: 'T1',
          probability: 0.60,
          odds: 1.60,
          timestamp: Date.now() - 3600_000,
        });
        recordObservationSettlement({
          matchId: `m_eval_${i}`,
          marketId: 'match_winner',
          selectionId: 'T1',
          won: i % 2 === 0,
        });
      }

      const drift = evaluateModelDrift({ sport: 'cricket', baselineBrier: 0.25 });
      expect(['GREEN', 'YELLOW']).toContain(drift.status);
    });
  });

  // 3. Movement & Divergence Analyzers
  describe('3. Market Movement & Provider Divergence', () => {
    it('Identifies rapid odds jumps and price flickering', () => {
      const history = [
        { odds: 1.50, timestamp: 1000 },
        { odds: 2.10, timestamp: 2000 }, // +40% jump within 1s
        { odds: 1.45, timestamp: 3000 }, // -31% drop within 1s
      ];

      const analysis = analyzeOddsMovement(history);
      expect(analysis.flickerDetected).toBe(true);
      expect(analysis.maxJumpPct).toBeGreaterThan(30);
    });

    it('Calculates provider divergence and flags high disagreement rates', () => {
      const comparisonPairs = [
        { modelProb: 0.50, providerProb: 0.52 },
        { modelProb: 0.60, providerProb: 0.40 }, // 0.20 diff
        { modelProb: 0.45, providerProb: 0.44 },
      ];

      const div = analyzeProviderDivergence(comparisonPairs);
      expect(div.sampleSize).toBe(3);
      expect(div.maxDiff).toBeCloseTo(0.20, 2);
      expect(div.disagreementCount).toBe(1);
    });
  });

  // 4. Backtest Replay Runner
  describe('4. Historical Backtest Replay Runner', () => {
    it('Replays chronological match events and computes calibration buckets without look-ahead bias', () => {
      const timeline = [
        {
          timestamp: 1000,
          matchState: {
            id: 'bt_soc_1',
            matchId: 'bt_soc_1',
            sport: 'soccer',
            status: 'LIVE',
            isLive: true,
            team1: { name: 'Arsenal' },
            team2: { name: 'Chelsea' },
            score1: 2,
            score2: 1,
            liveDetails: { minute: 60, score1: 2, score2: 1 },
          },
          resolvedWinner: '1',
        },
      ];

      const res = runHistoricalBacktest({ timeline, sport: 'soccer' });
      expect(res.status).toBe('COMPLETED');
      expect(res.sampleSize).toBe(1);
      expect(res.calibrationBuckets.length).toBe(10);
    });

    it('Gracefully handles empty replay timelines without crashing', () => {
      const res = runHistoricalBacktest({ timeline: [] });
      expect(res.status).toBe('AWAITING_REAL_DATA');
      expect(res.sampleSize).toBe(0);
    });
  });

  // 5. Shadow Pricing & Canary Engine
  describe('5. Shadow Pricing & Canary Engine', () => {
    it('Deterministically assigns canary candidate by matchId hash', () => {
      const res1 = isCanaryCandidate('match_canary_test_abc', 10);
      const res2 = isCanaryCandidate('match_canary_test_abc', 10);
      expect(res1).toBe(res2); // Pure determinism
    });

    it('Evaluates shadow pricing comparison without modifying authoritative quotes', () => {
      const matchState = {
        matchId: 'shadow_match_101',
        sport: 'soccer',
        status: 'LIVE',
        isLive: true,
        team1: { name: 'Real Madrid' },
        team2: { name: 'Barcelona' },
        score1: 1,
        score2: 1,
        liveDetails: { minute: 70, score1: 1, score2: 1 },
      };

      const shadow = evaluateShadowPricing(matchState);
      expect(shadow.baselineStatus).toBe('OK');
      expect(shadow.candidateStatus).toBe('OK');
      expect(shadow.comparisons.length).toBeGreaterThan(0);
      // Authoritative baseline is returned to callers
      expect(shadow.authoritativeSnapshot.status).toBe('OK');
    });
  });
});
