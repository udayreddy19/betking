import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  lookupEventForSettlement,
  LOOKUP_RESULT_CODES,
  RETRYABLE_LOOKUP_CODES,
  logSettlementEventLookup,
} from '../../lib/settlement/settlementEventLookup.mjs';
import { evaluateSettlementConfidence } from '../../lib/settlement/settlementConfidenceEngine.mjs';
import { authorizeSettlement } from '../../lib/settlement/settlementAuthorizationEngine.mjs';
import { evaluateWicketInOverMarketBet } from '../../lib/liveMatchSettlement.mjs';

describe('Match Visibility & Settlement Event Lookup Hardening', () => {
  const sampleBet = {
    bet_id: 'bet_1788004010338_n5gmyk',
    match_id: 'oy_9853f10f-a7fb-324b-a4b5-a9c0506b36e7',
    market_id: 'i2_wicket_in_next_over_12',
    selection_id: 'sel_nwkt_yes',
    status: 'ACCEPTED',
    stake: 1000.0,
    odds: 2.93,
    potential_payout: 2930.0,
    placement_snapshot: {
      legs: [
        {
          matchId: 'oy_9853f10f-a7fb-324b-a4b5-a9c0506b36e7',
          matchName: 'Kochi Blue Tigers vs Thrissur Titans',
          team1Name: 'Kochi Blue Tigers',
          team2Name: 'Thrissur Titans',
          sport: 'cricket',
          league: 'T20 Kerala League',
        },
      ],
    },
  };

  const liveMatch = {
    id: 'oy_9853f10f-a7fb-324b-a4b5-a9c0506b36e7',
    matchId: 'oy_9853f10f-a7fb-324b-a4b5-a9c0506b36e7',
    team1: { name: 'Kochi Blue Tigers' },
    team2: { name: 'Thrissur Titans' },
    status: 'LIVE',
    isLive: true,
    liveDetails: {
      inningsId: 2,
      firstRuns: 171,
      firstWickets: 10,
      chaseRuns: 112,
      chaseWickets: 3,
      chaseOvers: '14.4',
    },
    providerTimestamp: '2026-08-29T12:00:00.000Z',
  };

  // 1. Event visible in live list -> settlement works
  it('1. should successfully find event when visible in live map', async () => {
    const liveById = new Map();
    liveById.set(sampleBet.match_id, liveMatch);

    const result = await lookupEventForSettlement({
      bet: sampleBet,
      liveById,
    });

    expect(result.success).toBe(true);
    expect(result.lookupResult).toBe(LOOKUP_RESULT_CODES.EVENT_FOUND_LIVE);
    expect(result.match.id).toBe(sampleBet.match_id);
  });

  // 2. Event removed from live list but available in hydrated map
  it('2. should find event in hydrated memory map when removed from live list', async () => {
    const byId = new Map();
    byId.set(sampleBet.match_id, { ...liveMatch, status: 'LIVE' });

    const result = await lookupEventForSettlement({
      bet: sampleBet,
      liveById: new Map(),
      byId,
    });

    expect(result.success).toBe(true);
    expect(result.lookupSource).toBe('HYDRATED_MEMORY_MAP');
  });

  // 3. Event available in completed fixtures
  it('3. should identify completed match state when event has finished', async () => {
    const byId = new Map();
    byId.set(sampleBet.match_id, {
      ...liveMatch,
      status: 'COMPLETED',
      matchState: 'post',
      isLive: false,
    });

    const result = await lookupEventForSettlement({
      bet: sampleBet,
      liveById: new Map(),
      byId,
    });

    expect(result.success).toBe(true);
    expect(result.lookupResult).toBe(LOOKUP_RESULT_CODES.EVENT_FOUND_COMPLETED);
    expect(result.eventStatus).toBe('COMPLETED');
  });

  // 4. Safe timestamp handling with non-date string ('Live')
  it('4. should safely evaluate confidence when match.time is "Live" without throwing RangeError', () => {
    const matchWithLiveString = {
      ...liveMatch,
      providerTimestamp: null,
      cachedAt: null,
      lastUpdatedAt: null,
      time: 'Live',
    };

    const confidence = evaluateSettlementConfidence({
      match: matchWithLiveString,
      bet: sampleBet,
      marketContext: {
        marketId: sampleBet.market_id,
        boundaryReached: true,
        hasImmutableSnapshotEvidence: true,
      },
      evaluatedOutcome: 'LOST',
    });

    expect(confidence.settlementAllowed).toBe(true);
    expect(confidence.confidenceState).toBe('CONFIRMED');
    expect(confidence.freshness.stale).toBe(false);
  });

  // 5. Provider timeout classification
  it('5. should classify network timeout as retryable PROVIDER_TIMEOUT', () => {
    expect(RETRYABLE_LOOKUP_CODES.has(LOOKUP_RESULT_CODES.PROVIDER_TIMEOUT)).toBe(true);
  });

  // 6. Provider rate limit classification
  it('6. should classify 429 as retryable PROVIDER_RATE_LIMITED', () => {
    expect(RETRYABLE_LOOKUP_CODES.has(LOOKUP_RESULT_CODES.PROVIDER_RATE_LIMITED)).toBe(true);
  });

  // 7. Intermittent lookup does not mutate bet to terminal state
  it('7. should not produce terminal state on temporary lookup failure', async () => {
    const result = await lookupEventForSettlement({
      bet: { ...sampleBet, match_id: 'non_existent_fixture' },
      liveById: new Map(),
      byId: new Map(),
    });

    expect(result.success).toBe(false);
    expect(result.lookupResult).toBe(LOOKUP_RESULT_CODES.EVENT_NOT_FOUND);
    expect(result.retryable).toBe(true);
  });

  // 8. Frontend absence does not block backend settlement with snapshots
  it('8. backend authorizes settlement via immutable snapshots even if live ticker is absent', async () => {
    const auth = authorizeSettlement({
      match: liveMatch,
      bet: sampleBet,
      marketContext: {
        marketId: sampleBet.market_id,
        boundaryReached: true,
        hasImmutableSnapshotEvidence: true,
        snapshotReason: 'wicket_in_over_12_i2_wkts=0',
      },
      evaluatedOutcome: 'LOST',
      authorizedBy: 'LiveMatchSettlementWorker',
    });

    expect(auth.success).toBe(true);
    expect(auth.authorization.token).toBeDefined();
    expect(auth.confidence.confidenceState).toBe('CONFIRMED');
  });

  // 9. Identity mismatch detection
  it('9. should detect EVENT_ID_MISMATCH when fixture team names conflict', async () => {
    const mismatchedMatch = {
      id: sampleBet.match_id,
      team1: { name: 'Completely Different Team A' },
      team2: { name: 'Completely Different Team B' },
      status: 'LIVE',
    };
    const liveById = new Map([[sampleBet.match_id, mismatchedMatch]]);

    const result = await lookupEventForSettlement({
      bet: sampleBet,
      liveById,
    });

    expect(result.success).toBe(false);
    expect(result.lookupResult).toBe(LOOKUP_RESULT_CODES.EVENT_ID_MISMATCH);
    expect(result.errorCode).toBe('IDENTITY_MISMATCH');
  });

  // 10. Missing match ID safety
  it('10. should safely reject bet missing match_id', async () => {
    const result = await lookupEventForSettlement({
      bet: { bet_id: 'bad_bet' },
    });

    expect(result.success).toBe(false);
    expect(result.lookupResult).toBe(LOOKUP_RESULT_CODES.EVENT_NOT_FOUND);
  });

  // 11. Event not found must NEVER authorize settlement
  it('11. missing event must NEVER authorize settlement or forge win/loss', () => {
    const auth = authorizeSettlement({
      match: null,
      bet: sampleBet,
      marketContext: {
        marketId: sampleBet.market_id,
        boundaryReached: false,
      },
      evaluatedOutcome: null,
    });

    expect(auth.success).toBe(false);
    expect(auth.error).toBe('MISSING_DATA: Match object unavailable or unhydrated');
  });

  // 12. Structured logger format compliance
  it('12. structured logger should format log without sensitive user data', () => {
    const log = logSettlementEventLookup({
      betId: sampleBet.bet_id,
      eventId: sampleBet.match_id,
      lookupSource: 'REDIS_CANONICAL_CACHE',
      lookupResult: LOOKUP_RESULT_CODES.EVENT_FOUND_LIVE,
      eventStatus: 'LIVE',
    });

    expect(log.event).toBe('SETTLEMENT_EVENT_LOOKUP');
    expect(log.betId).toBe(sampleBet.bet_id);
    expect(log.eventId).toBe(sampleBet.match_id);
    expect(log.ts).toBeDefined();
  });

  // 13. Retry logic classification preserves safe state
  it('13. retryable lookup errors allow safe retry flow', () => {
    const retryableErrors = [
      LOOKUP_RESULT_CODES.PROVIDER_TIMEOUT,
      LOOKUP_RESULT_CODES.PROVIDER_RATE_LIMITED,
      LOOKUP_RESULT_CODES.PROVIDER_UNAVAILABLE,
      LOOKUP_RESULT_CODES.STALE_CACHE,
    ];
    for (const code of retryableErrors) {
      expect(RETRYABLE_LOOKUP_CODES.has(code)).toBe(true);
    }
  });

  // 14. Wicket in over grader handles innings 2 market correctly
  it('14. evaluateWicketInOverMarketBet grades i2_wicket_in_next_over_12 correctly with snapshot', async () => {
    // Over 12 had 0 wickets
    const fakeMatch = {
      id: sampleBet.match_id,
      matchId: sampleBet.match_id,
      liveDetails: {
        inningsId: 2,
        chaseOvers: '14.4',
        overHistory: [
          { overNum: 12, balls: ['1', '0', '4', '1', '2', '0'], isCurrent: false },
        ],
      },
    };

    const graded = await evaluateWicketInOverMarketBet(sampleBet, fakeMatch);
    expect(graded.outcome).toBe('LOST');
    expect(graded.reason).toContain('wicket_in_over_12_i2');
  });
});
