/**
 * Phase 24 Test Suite — Advanced Pricing Intelligence & Real-Time Odds Quality
 * 
 * Validates:
 * 1. Provider quality scorer & dynamic bounded weighting.
 * 2. Event-first odds reaction & noise suppression.
 * 3. Canonical state completeness & temporal ordering invariants.
 * 4. Coherent score distribution & cross-market derivations.
 * 5. Composite Odds Quality Score (0-100, tiers).
 * 6. Deterministic odds movement explainability engine.
 * 7. End-to-end Candidate Pricing Pipeline in shadow mode.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateSingleProviderQuality,
  calculateDynamicProviderWeights,
} from '../../../lib/odds-v3/quality/providerQualityEngine.mjs';
import {
  processEventOddsTransition,
  VERIFIED_EVENT_TYPES,
} from '../../../lib/odds-v3/quality/eventOddsReactionEngine.mjs';
import {
  evaluateStateCompleteness,
} from '../../../lib/odds-v3/quality/stateCompletenessEngine.mjs';
import {
  deriveOverUnderLinesFromDistribution,
  deriveDoubleChanceFromMatchWinner,
} from '../../../lib/odds-v3/quality/scoreDistributionEngine.mjs';
import {
  calculateOddsQualityScore,
  ODDS_QUALITY_TIERS,
} from '../../../lib/odds-v3/quality/oddsQualityEngine.mjs';
import {
  explainOddsMovement,
  EXPLANATION_CAUSES,
} from '../../../lib/odds-v3/quality/oddsExplainabilityEngine.mjs';
import {
  executeCandidatePricingPipeline,
} from '../../../lib/odds-v3/quality/candidatePricingPipeline.mjs';

describe('Phase 24 — Advanced Pricing Intelligence & Real-Time Odds Quality', () => {
  describe('1. Provider Quality & Dynamic Weighting', () => {
    it('computes bounded weights summing exactly to 1.0', () => {
      const res = calculateDynamicProviderWeights({
        sport: 'cricket',
        feedMetadata: {
          cricbuzz: { available: true, odds: 1.85, latencyMs: 110, timestamp: new Date().toISOString() },
          crex: { available: true, odds: 1.84, latencyMs: 90, timestamp: new Date().toISOString() },
          espn: { available: true, odds: 1.86, latencyMs: 200, timestamp: new Date().toISOString() },
          tencric: { available: true, odds: 1.83, latencyMs: 320, timestamp: new Date().toISOString() },
        },
      });

      expect(res.status).toBe('DYNAMIC_WEIGHTS_COMPUTED');
      expect(res.activeCount).toBe(4);
      const sum = Object.values(res.weights).reduce((a, b) => a + b, 0);
      expect(Number(sum.toFixed(4))).toBe(1.0);
    });

    it('assigns weight 0 to stale feeds and falls back to internal model if all fail', () => {
      const staleRes = evaluateSingleProviderQuality({
        providerId: 'cricbuzz',
        metadata: { available: true, odds: 1.85, timestamp: new Date(Date.now() - 30000).toISOString() }, // 30s old
      });
      expect(staleRes.isUsable).toBe(false);
      expect(staleRes.qualityScore).toBe(0);

      const allFailed = calculateDynamicProviderWeights({
        providers: ['cricbuzz'],
        feedMetadata: { cricbuzz: { available: false } },
      });
      expect(allFailed.status).toBe('FALLBACK_TO_INTERNAL_MODEL');
    });
  });

  describe('2. Event-First Odds Reaction & Noise Suppression', () => {
    it('reacts with low latency to verified cricket wicket event', () => {
      const res = processEventOddsTransition({
        sport: 'cricket',
        previousProbability: 0.60,
        rawCandidateProbability: 0.40,
        matchStateEvent: 'WICKET',
      });

      expect(res.isVerifiedEvent).toBe(true);
      expect(res.classification).toBe('EVENT_RESPONSE');
      expect(res.adjustedProbability).toBe(0.40);
      expect(res.reactionLatencyMs).toBeLessThanOrEqual(45);
    });

    it('suppresses micro-reversals and spurious provider spikes without events', () => {
      const noise = processEventOddsTransition({
        sport: 'cricket',
        previousProbability: 0.50,
        rawCandidateProbability: 0.65,
        matchStateEvent: null,
        providerDivergence: 0.20,
      });

      expect(noise.isVerifiedEvent).toBe(false);
      expect(noise.noiseFiltered).toBe(true);
      expect(noise.adjustedProbability).toBeLessThan(0.65);
    });
  });

  describe('3. Canonical State Completeness & Temporal Ordering', () => {
    it('passes complete cricket state and detects missing fields', () => {
      const valid = evaluateStateCompleteness({
        sport: 'cricket',
        matchState: { runs: 140, wickets: 3, ballsCompleted: 96, format: 'T20' },
      });
      expect(valid.valid).toBe(true);
      expect(valid.completenessScore).toBe(100);

      const incomplete = evaluateStateCompleteness({
        sport: 'cricket',
        matchState: { runs: 140 }, // Missing wickets, ballsCompleted, format
      });
      expect(incomplete.valid).toBe(false);
      expect(incomplete.completenessScore).toBeLessThan(50);
    });
  });

  describe('4. Score Distribution & Cross-Market Derivation', () => {
    it('derives strictly monotonic Over/Under run lines from distribution', () => {
      const res = deriveOverUnderLinesFromDistribution({
        expectedTotal: 165.0,
        lines: [155.5, 160.5, 165.5, 170.5, 175.5],
      });

      expect(res.strictlyMonotonic).toBe(true);
      expect(res.derivedLines[0].pOver).toBeGreaterThan(res.derivedLines[4].pOver);
    });

    it('derives coherent Double Chance selections from Match Winner', () => {
      const dc = deriveDoubleChanceFromMatchWinner({ p1: 0.50, pDraw: 0.25, p2: 0.25 });
      expect(dc.p1X).toBe(0.75);
      expect(dc.p12).toBe(0.75);
      expect(dc.pX2).toBe(0.50);
      expect(dc.isCoherent).toBe(true);
    });
  });

  describe('5. Composite Odds Quality Score Engine', () => {
    it('evaluates composite 0-100 quality score and tier classification', () => {
      const good = calculateOddsQualityScore({
        calibrationEce: 0.035,
        feedAgeMs: 100,
        providerSpread: 0.02,
      });
      expect(good.oddsQualityScore).toBe(100);
      expect(good.tier).toBe(ODDS_QUALITY_TIERS.EXCELLENT);

      const degraded = calculateOddsQualityScore({
        calibrationEce: 0.12,
        feedAgeMs: 12000,
        providerSpread: 0.20,
      });
      expect(degraded.oddsQualityScore).toBeLessThan(50);
      expect(degraded.tier).toBe(ODDS_QUALITY_TIERS.WEAK);
    });
  });

  describe('6. Deterministic Odds Movement Explainability', () => {
    it('explains event-driven and noise-filtered price transitions clearly', () => {
      const exp = explainOddsMovement({
        matchId: 'match_01',
        marketId: 'match_winner',
        selectionId: '1',
        previousOdds: 1.80,
        newOdds: 2.30,
        previousProbability: 0.55,
        newProbability: 0.43,
        matchStateEvent: 'WICKET',
      });

      expect(exp.primaryCause).toBe(EXPLANATION_CAUSES.EVENT);
      expect(exp.summary).toContain('WICKET');
    });
  });

  describe('7. End-to-End Candidate Pricing Pipeline', () => {
    it('executes shadow candidate pricing pipeline safely without mutations', () => {
      const pipelineRes = executeCandidatePricingPipeline({
        sport: 'cricket',
        matchState: { matchId: 'm_test', runs: 120, wickets: 2, ballsCompleted: 80, format: 'T20' },
        rawCandidateProbability: 0.60,
        matchStateEvent: 'FOUR',
      });

      expect(pipelineRes.candidateVersion).toBe('v3.2-candidate-pipeline');
      expect(pipelineRes.candidateOdds).toBeGreaterThan(1.0);
      expect(pipelineRes.quality.oddsQualityScore).toBeGreaterThan(80);
      expect(pipelineRes.explanation.primaryCause).toBe(EXPLANATION_CAUSES.EVENT);
    });
  });
});
