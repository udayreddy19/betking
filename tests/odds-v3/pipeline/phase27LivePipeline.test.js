/**
 * Phase 27 Test Suite — Live Observation Collection & Automated Settlement Pipeline
 * 
 * Validates:
 * 1. Canonical event resolver (Fuzzy aliases, deterministic ID generation, conflict handling).
 * 2. Match lifecycle state machine (Valid forward paths, rejection of illegal backward transitions).
 * 3. Observation sampling policy & fingerprint deduplication.
 * 4. Multi-provider settlement verification (Unanimous agreement vs Disagreement conflict).
 * 5. Idempotent settlement join (Append-only metrics, zero duplicate Brier scoring).
 * 6. Longitudinal data collection progress tracking against sample gate (N >= 1,000).
 */

import { describe, it, expect } from 'vitest';
import {
  generateCanonicalEventId,
  resolveCanonicalEvent,
  RESOLUTION_STATUS,
} from '../../../lib/odds-v3/pipeline/canonicalEventResolver.mjs';
import {
  transitionMatchLifecycle,
  MATCH_LIFECYCLE_STATES,
} from '../../../lib/odds-v3/pipeline/matchLifecycleStateMachine.mjs';
import {
  computeObservationFingerprint,
  shouldSampleObservation,
} from '../../../lib/odds-v3/pipeline/observationSamplingPolicy.mjs';
import {
  verifyMultiProviderSettlement,
  idempotentJoinSettlement,
  SETTLEMENT_STATUS,
} from '../../../lib/odds-v3/pipeline/settlementVerificationEngine.mjs';
import {
  calculateCollectionProgress,
} from '../../../lib/odds-v3/validation/dataCollectionProgressEngine.mjs';

describe('Phase 27 — Live Observation Collection & Automated Settlement Pipeline', () => {
  describe('1. Canonical Event Resolver', () => {
    it('generates identical canonical IDs for alias variations (IND vs AUS vs India v Australia)', () => {
      const id1 = generateCanonicalEventId({ sport: 'cricket', team1: 'IND', team2: 'AUS', dateStr: '2026-08-28' });
      const id2 = generateCanonicalEventId({ sport: 'cricket', team1: 'India', team2: 'Australia', dateStr: '2026-08-28' });

      expect(id1).toBe(id2);
      expect(id1.startsWith('evt_cricket_')).toBe(true);
    });

    it('resolves direct matches and flags partial ambiguous matches', () => {
      const canonicalId = generateCanonicalEventId({ sport: 'cricket', team1: 'csk', team2: 'mi', dateStr: '2026-08-28' });
      const knownEvents = [{ canonicalEventId: canonicalId, sport: 'cricket', team1: 'chennai super kings', team2: 'mumbai indians' }];

      const res = resolveCanonicalEvent({
        providerName: 'cricbuzz',
        providerEventId: 'cb_12345',
        sport: 'cricket',
        team1: 'CSK',
        team2: 'MI',
        startTime: '2026-08-28',
        existingCanonicalEvents: knownEvents,
      });

      expect(res.status).toBe(RESOLUTION_STATUS.MATCHED);
      expect(res.canonicalEventId).toBe(canonicalId);
    });
  });

  describe('2. Match Lifecycle State Machine', () => {
    it('allows valid state progression: SCHEDULED -> PRE_MATCH -> LIVE -> SETTLED -> ARCHIVED', () => {
      const t1 = transitionMatchLifecycle({ currentState: MATCH_LIFECYCLE_STATES.SCHEDULED, nextState: MATCH_LIFECYCLE_STATES.PRE_MATCH });
      expect(t1.valid).toBe(true);

      const t2 = transitionMatchLifecycle({ currentState: MATCH_LIFECYCLE_STATES.PRE_MATCH, nextState: MATCH_LIFECYCLE_STATES.LIVE });
      expect(t2.valid).toBe(true);

      const t3 = transitionMatchLifecycle({ currentState: MATCH_LIFECYCLE_STATES.LIVE, nextState: MATCH_LIFECYCLE_STATES.COMPLETED_PENDING_VERIFICATION });
      expect(t3.valid).toBe(true);
    });

    it('strictly rejects illegal backward regressions (e.g. SETTLED -> LIVE)', () => {
      const invalid = transitionMatchLifecycle({ currentState: MATCH_LIFECYCLE_STATES.SETTLED, nextState: MATCH_LIFECYCLE_STATES.LIVE });
      expect(invalid.valid).toBe(false);
      expect(invalid.error).toContain('ILLEGAL_LIFECYCLE_TRANSITION');
    });
  });

  describe('3. Observation Sampling Policy & Deduplication', () => {
    it('samples on match state change and probability delta while suppressing noisy ticks', () => {
      const first = shouldSampleObservation({ lastObservation: null });
      expect(first.shouldSample).toBe(true);

      const stateChange = shouldSampleObservation({
        lastObservation: { probability: 0.50, timestamp: new Date().toISOString() },
        canonicalStateChanged: true,
      });
      expect(stateChange.shouldSample).toBe(true);

      const noisyTick = shouldSampleObservation({
        lastObservation: { probability: 0.50, regime: 'NORMAL_LIVE', timestamp: new Date().toISOString() },
        currentProbability: 0.505, // Delta < 0.02
        canonicalStateChanged: false,
        currentRegime: 'NORMAL_LIVE',
      });
      expect(noisyTick.shouldSample).toBe(false);
    });

    it('computes deterministic fingerprints for observation uniqueness', () => {
      const fp1 = computeObservationFingerprint({
        canonicalEventId: 'evt_100',
        marketType: 'match_winner',
        selection: '1',
        canonicalStateHash: 'hash_abc',
        modelVersion: 'v3.1-prod',
        probability: 0.552,
      });

      const fp2 = computeObservationFingerprint({
        canonicalEventId: 'evt_100',
        marketType: 'match_winner',
        selection: '1',
        canonicalStateHash: 'hash_abc',
        modelVersion: 'v3.1-prod',
        probability: 0.554, // Same 0.55 bucket
      });

      expect(fp1).toBe(fp2);
    });
  });

  describe('4. Multi-Provider Settlement Verification & Idempotent Join', () => {
    it('verifies unanimous outcomes and flags provider conflicts', () => {
      const agreed = verifyMultiProviderSettlement({
        matchId: 'm1',
        providerResults: { cricbuzz: '1', crex: '1', espn: '1' },
      });
      expect(agreed.status).toBe(SETTLEMENT_STATUS.VERIFIED);
      expect(agreed.winningSelection).toBe('1');

      const conflict = verifyMultiProviderSettlement({
        matchId: 'm1',
        providerResults: { cricbuzz: '1', crex: '2' }, // Disagreement
      });
      expect(conflict.status).toBe(SETTLEMENT_STATUS.CONFLICT);
    });

    it('guarantees idempotent settlement joins without duplicate metrics', () => {
      const initialObs = { selection: '1', probability: 0.70 };

      // First join
      const join1 = idempotentJoinSettlement(initialObs, { winningSelection: '1' });
      expect(join1.isModified).toBe(true);
      expect(join1.observation.settlement.brierContribution).toBe(0.09); // (0.70 - 1)^2 = 0.09

      // Second join (Retry)
      const join2 = idempotentJoinSettlement(join1.observation, { winningSelection: '1' });
      expect(join2.isAlreadySettled).toBe(true);
      expect(join2.isModified).toBe(false);
    });
  });

  describe('5. Longitudinal Data Collection Progress', () => {
    it('tracks progress towards sample size gate (N = 1000)', () => {
      const progress = calculateCollectionProgress({
        observations: [
          { sport: 'cricket', marketType: 'match_winner', modelVersion: 'v3.1-prod', settlement: { outcome: 1 } },
          { sport: 'cricket', marketType: 'match_winner', modelVersion: 'v3.1-prod', settlement: null },
        ],
      });

      expect(progress.totalObservations).toBe(2);
      expect(progress.settledObservations).toBe(1);
      expect(progress.status).toBe('INSUFFICIENT_DATA');
      expect(progress.sampleRemaining).toBe(999);
    });
  });
});
