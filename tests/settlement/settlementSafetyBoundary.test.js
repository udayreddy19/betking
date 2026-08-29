import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  authorizeSettlement,
  validateSettlementAuthorization,
  computeEvidenceHash,
  settlementMetrics,
} from '../../lib/settlement/settlementAuthorizationEngine.mjs';
import {
  evaluateSettlementConfidence,
  CONFIDENCE_STATES,
  FINALITY_STATES,
  resolveMarketFinalityPolicy,
} from '../../lib/settlement/settlementConfidenceEngine.mjs';
import { normalizeBallToCanonicalEvent } from '../../lib/settlement/canonicalBallEvents.mjs';

describe('Settlement Safety Boundary & Forensic Evidence Hardening Suite', () => {
  // Test 1: Mandatory authorization issuance for valid completed bet
  it('Test 1: Valid completed bet generates valid SettlementAuthorizationToken with SHA-256 hash', () => {
    const bet = {
      bet_id: 'bet_sec_001',
      user_id: 'usr_001',
      match_id: 'm_ipl_001',
      market_id: 'winner',
      selection_id: 'team_csk',
      stake: 500,
      odds: 1.95,
    };
    const match = {
      id: 'm_ipl_001',
      status: 'COMPLETED',
      matchState: 'completed',
      finishedAt: new Date(Date.now() - 60000).toISOString(),
    };

    const res = authorizeSettlement({
      bet,
      match,
      marketContext: { marketType: 'MATCH_WINNER' },
      evaluatedOutcome: 'WON',
      config: { settlementGracePeriodSeconds: 0 },
      authorizedBy: 'TestConfidenceEngine',
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.authorization);
    assert.strictEqual(res.authorization.betId, 'bet_sec_001');
    assert.strictEqual(res.authorization.matchId, 'm_ipl_001');
    assert.strictEqual(res.authorization.gradedOutcome, 'WON');
    assert.strictEqual(res.authorization.confidenceState, CONFIDENCE_STATES.CONFIRMED);
    assert.ok(res.authorization.evidenceHash.startsWith('sha256:'));
    assert.ok(new Date(res.authorization.expiresAt).getTime() > Date.now());

    // Validation should succeed
    const val = validateSettlementAuthorization({
      authorization: res.authorization,
      bet,
      matchState: match,
    });
    assert.strictEqual(val.valid, true);
  });

  // Test 2: Expired authorization token is rejected
  it('Test 2: Expired authorization token is rejected by validateSettlementAuthorization', () => {
    const bet = { bet_id: 'bet_sec_002', match_id: 'm_ipl_002' };
    const expiredAuth = {
      authorizationId: 'auth_exp_001',
      betId: 'bet_sec_002',
      matchId: 'm_ipl_002',
      marketId: 'winner',
      selectionId: 'sel_1',
      gradedOutcome: 'WON',
      confidenceState: CONFIDENCE_STATES.CONFIRMED,
      finalityState: FINALITY_STATES.SETTLEMENT_ELIGIBLE,
      evidenceHash: 'sha256:dummy',
      expiresAt: new Date(Date.now() - 10000).toISOString(), // 10s in the past
      providerConsensus: { providersAgree: true, providersAvailable: 1 },
      freshness: { stale: false },
    };

    const val = validateSettlementAuthorization({
      authorization: expiredAuth,
      bet,
      matchState: { matchId: 'm_ipl_002' },
    });
    assert.strictEqual(val.valid, false);
    assert.ok(val.reason.includes('SETTLEMENT_AUTHORIZATION_EXPIRED'));
  });

  // Test 3: Token for wrong betId is rejected
  it('Test 3: Authorization token with mismatched betId is rejected', () => {
    const bet = { bet_id: 'bet_sec_003', match_id: 'm_ipl_003' };
    const wrongBetAuth = {
      authorizationId: 'auth_wrong_001',
      betId: 'bet_DIFFERENT_999',
      matchId: 'm_ipl_003',
      marketId: 'winner',
      selectionId: 'sel_1',
      gradedOutcome: 'WON',
      confidenceState: CONFIDENCE_STATES.CONFIRMED,
      finalityState: FINALITY_STATES.SETTLEMENT_ELIGIBLE,
      evidenceHash: 'sha256:dummy',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      providerConsensus: { providersAgree: true, providersAvailable: 1 },
      freshness: { stale: false },
    };

    const val = validateSettlementAuthorization({
      authorization: wrongBetAuth,
      bet,
      matchState: { matchId: 'm_ipl_003' },
    });
    assert.strictEqual(val.valid, false);
    assert.ok(val.reason.includes('SETTLEMENT_AUTHORIZATION_MISMATCH'));
  });

  // Test 4: Tampered evidence hash is rejected
  it('Test 4: Tampered evidence hash is rejected by validateSettlementAuthorization', () => {
    const bet = { bet_id: 'bet_sec_004', match_id: 'm_ipl_004', market_id: 'winner', selection_id: 'sel_4' };
    const match = { id: 'm_ipl_004', status: 'COMPLETED' };

    const res = authorizeSettlement({
      bet,
      match,
      marketContext: { marketType: 'MATCH_WINNER' },
      evaluatedOutcome: 'WON',
      config: { settlementGracePeriodSeconds: 0 },
    });

    assert.strictEqual(res.success, true);
    // Tamper with gradedOutcome inside the token
    const tamperedAuth = { ...res.authorization, gradedOutcome: 'LOST' };

    const val = validateSettlementAuthorization({
      authorization: tamperedAuth,
      bet,
      matchState: match,
    });
    assert.strictEqual(val.valid, false);
    assert.ok(val.reason.includes('SETTLEMENT_AUTHORIZATION_CORRUPTED'));
  });

  // Test 5: Authorization is refused when providers conflict
  it('Test 5: Authorization is blocked when multi-provider consensus fails', () => {
    const bet = { bet_id: 'bet_sec_005', match_id: 'm_ipl_005', market_id: 'overs_0_20' };
    const match = {
      id: 'm_ipl_005',
      status: 'COMPLETED',
      providerObservations: [
        { provider: 'cricbuzz', score: 180, wickets: 4 },
        { provider: '10cric', score: 172, wickets: 6 },
      ],
    };

    const res = authorizeSettlement({
      bet,
      match,
      marketContext: { marketType: 'SCORE' },
      evaluatedOutcome: 'WON',
      providerObservations: match.providerObservations,
      config: { requireProviderConsensus: true },
    });

    assert.strictEqual(res.success, false);
    assert.ok(res.error.includes('SETTLEMENT_BLOCKED'));
    assert.strictEqual(res.authorization, null);
    assert.strictEqual(res.confidence.confidenceState, CONFIDENCE_STATES.CONFLICT);
  });

  // Test 6: In-play match data exceeding 300s is blocked for authorization
  it('Test 6: In-play stale provider data blocks settlement authorization', () => {
    const bet = { bet_id: 'bet_sec_006', match_id: 'm_ipl_006', market_id: 'live_over_5' };
    const match = {
      id: 'm_ipl_006',
      status: 'LIVE',
      lastUpdatedAt: new Date(Date.now() - 400000).toISOString(), // 400s ago
    };

    const res = authorizeSettlement({
      bet,
      match,
      marketContext: { boundaryReached: true },
      evaluatedOutcome: 'WON',
      config: { settlementDataMaxAgeSeconds: 300 },
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.confidence.confidenceState, CONFIDENCE_STATES.STALE);
    assert.strictEqual(res.authorization, null);
  });

  // Test 7: Cricket Ball Event normalizer supports before/after forensic fields
  it('Test 7: normalizeBallToCanonicalEvent captures score before/after and player context without fabrication', () => {
    const ballEvent = normalizeBallToCanonicalEvent({
      matchId: 'm_test_ipl',
      innings: 1,
      overNumber: 18,
      ballNumber: 4,
      sequenceNumber: 112,
      rawBall: 'W',
      provider: 'cricbuzz',
      scoreBefore: 156,
      scoreAfter: 156,
      wicketsBefore: 5,
      wicketsAfter: 6,
      bowlerName: 'Jasprit Bumrah',
      dismissedPlayerName: 'Virat Kohli',
      dismissalType: 'BOWLED',
    });

    assert.strictEqual(ballEvent.overNumber, 18);
    assert.strictEqual(ballEvent.ballNumber, 4);
    assert.strictEqual(ballEvent.wicket, true);
    assert.strictEqual(ballEvent.scoreBefore, 156);
    assert.strictEqual(ballEvent.scoreAfter, 156);
    assert.strictEqual(ballEvent.wicketsBefore, 5);
    assert.strictEqual(ballEvent.wicketsAfter, 6);
    assert.strictEqual(ballEvent.bowlerName, 'Jasprit Bumrah');
    assert.strictEqual(ballEvent.dismissedPlayerName, 'Virat Kohli');
    assert.strictEqual(ballEvent.dismissalType, 'BOWLED');
    assert.strictEqual(ballEvent.provider, 'cricbuzz');
  });

  // Test 8: Missing ball event context uses null/explicit fallback rather than fabricated strings
  it('Test 8: normalizeBallToCanonicalEvent leaves missing fields as null rather than fabricating', () => {
    const ballEvent = normalizeBallToCanonicalEvent({
      matchId: 'm_test_ipl',
      innings: 1,
      overNumber: 5,
      ballNumber: 2,
      sequenceNumber: 26,
      rawBall: '4',
    });

    assert.strictEqual(ballEvent.runs, 4);
    assert.strictEqual(ballEvent.wicket, false);
    assert.strictEqual(ballEvent.scoreBefore, null);
    assert.strictEqual(ballEvent.bowlerName, null);
    assert.strictEqual(ballEvent.dismissedPlayerName, null);
  });

  // Test 9: Market finality policy resolution
  it('Test 9: Market finality policies correctly map Toss, Over, and Match Winner requirements', () => {
    const tossPolicy = resolveMarketFinalityPolicy('TOSS_WINNER');
    assert.strictEqual(tossPolicy.requiredGraceSeconds, 0);
    assert.strictEqual(tossPolicy.requireMatchFinal, false);

    const winnerPolicy = resolveMarketFinalityPolicy('MATCH_WINNER');
    assert.strictEqual(winnerPolicy.requiredGraceSeconds, 30);
    assert.strictEqual(winnerPolicy.requireMatchFinal, true);

    const overPolicy = resolveMarketFinalityPolicy('OVER_TOTAL');
    assert.strictEqual(overPolicy.requireEventFinal, true);
    assert.strictEqual(overPolicy.requireMatchFinal, false);
  });

  // Test 10: Unauthorized settlement invocation metrics tracking
  it('Test 10: Invalid authorization validation increments settlement_unauthorized_invocations_total', () => {
    const priorCount = settlementMetrics.settlement_unauthorized_invocations_total;
    const bet = { bet_id: 'bet_sec_010', match_id: 'm_ipl_010' };

    validateSettlementAuthorization({
      authorization: null,
      bet,
      matchState: {},
    });

    assert.strictEqual(settlementMetrics.settlement_unauthorized_invocations_total, priorCount + 1);
  });
});
