/**
 * Phase 18 Integration Test Suite
 * 
 * Validates:
 * 1. Prediction -> Price -> Outcome integrity auditing.
 * 2. Multi-feed provider disagreement engine and safety actions (LOW to EXTREME).
 * 3. Closing line value (CLV) trajectory and movement efficiency analysis.
 * 4. Market-level and cricket match-state scorecards.
 * 5. Margin fairness auditing and pathological spike detection.
 * 6. 9-category failure taxonomy tracking with standard recovery behaviors.
 * 7. Price explainability mathematical lineage generation.
 * 8. Deterministic price replay runner.
 * 9. Feed redundancy failover and 5-dimension unified quality scoring.
 */

import { describe, it, expect } from 'vitest';
import { auditPredictionPriceOutcomeIntegrity } from '../../lib/odds-v3/dataset/predictionPriceOutcomeIntegrity.mjs';
import {
  evaluateProviderDisagreement,
  DISAGREEMENT_LEVELS,
  DISAGREEMENT_ACTIONS,
} from '../../lib/odds-v3/pricing/providerDisagreementEngine.mjs';
import {
  analyzeClosingLineEfficiency,
  aggregateClosingLineDataset,
} from '../../lib/odds-v3/validation/closingLineAnalyzer.mjs';
import {
  buildMarketScorecards,
  evaluateCricketStateScorecard,
} from '../../lib/odds-v3/validation/marketScorecard.mjs';
import { auditMarginFairness } from '../../lib/odds-v3/pricing/marginFairnessAuditor.mjs';
import {
  recordModelFailure,
  getFailureTaxonomyReport,
  FAILURE_CATEGORIES,
} from '../../lib/odds-v3/monitoring/failureTaxonomy.mjs';
import { buildPriceExplainabilityRecord } from '../../lib/odds-v3/pricing/priceExplainability.mjs';
import { executeDeterministicReplay } from '../../scripts/oddsReplayCli.mjs';
import {
  evaluateFeedRedundancy,
  computeUnifiedQualityScore,
  REDUNDANCY_LEVELS,
} from '../../lib/odds-v3/resilience/feedRedundancyManager.mjs';

describe('Phase 18 — OddsEngine V3 Production Data Intelligence & Feed Resiliency', () => {
  describe('1. Prediction -> Price -> Outcome Integrity', () => {
    it('passes high integrity for valid observations', () => {
      const observations = [
        { matchId: 'm1', marketId: 'match_winner', selectionId: '1', predictionProbability: 0.6, publishedOdds: 1.60, settledOutcome: true, timestamp: Date.now() - 5000 },
        { matchId: 'm1', marketId: 'match_winner', selectionId: '2', predictionProbability: 0.4, publishedOdds: 2.30, settledOutcome: false, timestamp: Date.now() - 5000 },
      ];
      const audit = auditPredictionPriceOutcomeIntegrity(observations);
      expect(audit.status).toBe('PASSED_HIGH_INTEGRITY');
      expect(audit.predictionPriceOutcomeIntegrityScore).toBe(100);
      expect(audit.errorCount).toBe(0);
    });

    it('detects invalid probability, invalid odds, and future timestamps', () => {
      const badObs = [
        { matchId: 'm2', marketId: 'match_winner', selectionId: '1', predictionProbability: 1.5, publishedOdds: 1.50, timestamp: Date.now() },
        { matchId: 'm2', marketId: 'match_winner', selectionId: '2', predictionProbability: 0.5, publishedOdds: -2.0, timestamp: Date.now() },
        { matchId: 'm2', marketId: 'match_winner', selectionId: '3', predictionProbability: 0.5, publishedOdds: 1.80, timestamp: Date.now() + 1000000 },
      ];
      const audit = auditPredictionPriceOutcomeIntegrity(badObs);
      expect(audit.errorCount).toBe(3);
      expect(audit.errors.invalidProbability).toBe(1);
      expect(audit.errors.invalidOdds).toBe(1);
      expect(audit.errors.futureTimestamp).toBe(1);
      expect(audit.predictionPriceOutcomeIntegrityScore).toBeLessThan(50);
    });
  });

  describe('2. Provider Disagreement Engine', () => {
    it('classifies low divergence and continues baseline', () => {
      const quotes = [
        { provider: 'cricbuzz', odds: 1.85, probability: 0.52 },
        { provider: 'crex', odds: 1.88, probability: 0.51 },
      ];
      const res = evaluateProviderDisagreement(quotes);
      expect(res.level).toBe(DISAGREEMENT_LEVELS.LOW);
      expect(res.action).toBe(DISAGREEMENT_ACTIONS.CONTINUE_BASELINE);
    });

    it('classifies extreme divergence and triggers suspension/delay', () => {
      const quotes = [
        { provider: 'cricbuzz', odds: 1.40, probability: 0.70 },
        { provider: 'crex', odds: 2.20, probability: 0.45 },
      ];
      const res = evaluateProviderDisagreement(quotes);
      expect(res.level).toBe(DISAGREEMENT_LEVELS.EXTREME);
      expect(res.action).toBe(DISAGREEMENT_ACTIONS.SUSPEND_OR_DELAY);
      expect(res.marginAdjustment).toBeGreaterThanOrEqual(0.04);
    });
  });

  describe('3. Closing-Line & Movement Efficiency', () => {
    it('analyzes price trajectory and checks movement towards outcome', () => {
      const timeline = [
        { timestamp: 1000, odds: 2.10, modelProbability: 0.45, settledOutcome: true },
        { timestamp: 2000, odds: 1.80, modelProbability: 0.53, settledOutcome: true },
        { timestamp: 3000, odds: 1.50, modelProbability: 0.65, settledOutcome: true },
      ];
      const analysis = analyzeClosingLineEfficiency(timeline);
      expect(analysis.status).toBe('ANALYZED');
      expect(analysis.movedTowardsOutcome).toBe(true);
      expect(analysis.movementClassification).toBe('FAST');

      const smallTimeline = [
        { timestamp: 1000, odds: 2.00, modelProbability: 0.50, settledOutcome: true },
        { timestamp: 2000, odds: 1.95, modelProbability: 0.51, settledOutcome: true },
      ];
      const smallAnalysis = analyzeClosingLineEfficiency(smallTimeline);
      expect(smallAnalysis.movementClassification).toBe('NORMAL');
    });

    it('detects unstable flicker oscillation in rapid price reversals', () => {
      const noisyTimeline = [
        { timestamp: 1000, odds: 1.50 },
        { timestamp: 2000, odds: 2.20 },
        { timestamp: 3000, odds: 1.45 },
        { timestamp: 4000, odds: 2.30 },
        { timestamp: 5000, odds: 1.40 },
        { timestamp: 6000, odds: 2.35 },
        { timestamp: 7000, odds: 1.50 },
      ];
      const analysis = analyzeClosingLineEfficiency(noisyTimeline);
      expect(analysis.movementClassification).toBe('UNSTABLE');
      expect(analysis.reversalCount).toBeGreaterThan(4);
    });
  });

  describe('4. Market-Level & Cricket State Scorecards', () => {
    it('builds market scorecards and partitions cricket match phases', () => {
      const dataset = [
        { sport: 'cricket', market: 'match_winner', predictionProbability: 0.70, actualOutcome: true, matchState: { ballsCompleted: 24 } },
        { sport: 'cricket', market: 'match_winner', predictionProbability: 0.30, actualOutcome: false, matchState: { ballsCompleted: 72 } },
        { sport: 'cricket', market: 'team_total', predictionProbability: 0.55, actualOutcome: true, matchState: { ballsCompleted: 110 } },
      ];

      const scorecards = buildMarketScorecards(dataset);
      expect(scorecards.totalMarketsEvaluated).toBe(2);

      const cricketScorecard = evaluateCricketStateScorecard(dataset);
      expect(cricketScorecard.phases.powerplay.totalCount).toBe(1);
      expect(cricketScorecard.phases.middle.totalCount).toBe(1);
      expect(cricketScorecard.phases.death.totalCount).toBe(1);
    });
  });

  describe('5. Margin Fairness Auditor', () => {
    it('detects margin bound violations and pathological pricing', () => {
      const obs = [
        { matchId: 'm1', marketId: 'winner', margin: 0.05, providerLatency: 100, volatilityScore: 0.05 },
        { matchId: 'm2', marketId: 'winner', margin: 0.15, providerLatency: 100, volatilityScore: 0.05 }, // exceeds 0.12 bound
        { matchId: 'm3', marketId: 'winner', margin: 0.10, providerLatency: 50, volatilityScore: 0.02 },  // pathological spike under calm conditions
      ];

      const audit = auditMarginFairness(obs);
      expect(audit.boundViolations).toBe(1);
      expect(audit.pathologicalAnomalies).toBe(1);
      expect(audit.marginFairnessScore).toBeLessThan(100);
    });
  });

  describe('6. Failure Taxonomy Engine', () => {
    it('records and classifies failures across standard categories', () => {
      recordModelFailure({
        category: FAILURE_CATEGORIES.STALE_FEED,
        matchId: 'm_fail_1',
        sport: 'cricket',
        details: 'Feed age exceeded 16000ms',
        impact: 'MEDIUM',
      });

      const report = getFailureTaxonomyReport();
      expect(report.totalFailuresRecorded).toBeGreaterThanOrEqual(1);
      expect(report.taxonomy.STALE_FEED.count).toBeGreaterThanOrEqual(1);
      expect(report.taxonomy.STALE_FEED.recoveryBehavior).toContain('circuit breaker');
    });
  });

  describe('7. Price Explainability & Deterministic Replay', () => {
    it('constructs transparent pricing lineage record without mutating production', () => {
      const record = buildPriceExplainabilityRecord({
        matchId: 'match_expl_01',
        sport: 'cricket',
        market: 'match_winner',
        selection: '1',
        baseProbability: 0.60,
        providerConsensus: 0.58,
        modelBlend: 0.59,
        margin: 0.05,
        finalOdds: 1.61,
      });

      expect(record.explainabilityId).toBeDefined();
      expect(record.lineage.effectiveTotalMargin).toBe(0.05);
      expect(record.provenance.modelVersion).toBe('v3.1-prod');
    });

    it('reproduces deterministic pricing via replay CLI function', () => {
      const replay = executeDeterministicReplay({
        matchId: 'replay_test_01',
        runs1: 170,
        wickets1: 5,
        runs2: 130,
        wickets2: 3,
        balls2: 90,
      });

      expect(replay.matchId).toBe('replay_test_01');
      expect(replay.status).toBe('OK');
      expect(replay.winnerOdds.length).toBe(2);
      expect(replay.explainability).toBeDefined();
    });
  });

  describe('8. Feed Redundancy & Unified Quality Score', () => {
    it('evaluates feed redundancy levels for cricket and soccer', () => {
      const cricketRedundancy = evaluateFeedRedundancy('cricket', ['cricbuzz', 'crex', 'tencric', 'espn']);
      expect(cricketRedundancy.redundancyLevel).toBe(REDUNDANCY_LEVELS.REDUNDANT);
      expect(cricketRedundancy.failoverAvailable).toBe(true);

      const singleFeed = evaluateFeedRedundancy('cricket', ['cricbuzz']);
      expect(singleFeed.redundancyLevel).toBe(REDUNDANCY_LEVELS.SINGLE_POINT_OF_FAILURE);
    });

    it('computes 5-dimension unified quality score', () => {
      const score = computeUnifiedQualityScore({
        inputValid: true,
        modelValid: true,
        providerDivergence: 0.02,
        priceIntegrity: 100,
        latencyMs: 100,
      });

      expect(score.unifiedScore).toBeGreaterThan(90);
      expect(score.status).toBe('EXCELLENT');
      expect(score.dimensions.INPUT_QUALITY).toBe(100);
      expect(score.dimensions.MODEL_QUALITY).toBe(100);
    });
  });
});
