import { describe, it, expect } from 'vitest';
import {
  parseSafeTimestamp,
  resolveMatchTimestampTrust,
  TIMESTAMP_STATUS,
} from '../../lib/settlement/safeTimestampParser.mjs';
import { evaluateSettlementConfidence } from '../../lib/settlement/settlementConfidenceEngine.mjs';
import { authorizeSettlement } from '../../lib/settlement/settlementAuthorizationEngine.mjs';
import { evaluateWicketInOverMarketBet } from '../../lib/liveMatchSettlement.mjs';

describe('Safe Timestamp Parser & Settlement Worker Resilience', () => {
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
          providerEventId: 'sr:match:73684582',
          source: 'sportradar',
          matchName: 'Kochi Blue Tigers vs Thrissur Titans',
          team1Name: 'Kochi Blue Tigers',
          team2Name: 'Thrissur Titans',
          sport: 'cricket',
          league: 'T20 Kerala League',
        },
      ],
    },
  };

  // 1. Valid ISO date
  it('1. should parse valid ISO date as VALID', () => {
    const iso = '2026-08-29T12:00:00.000Z';
    const res = parseSafeTimestamp(iso, 'providerTimestamp');
    expect(res.timestampStatus).toBe(TIMESTAMP_STATUS.VALID);
    expect(res.parsedTimestamp).toBe(iso);
    expect(res.timestampEpochMs).toBe(Date.parse(iso));
  });

  // 2. Valid epoch timestamp
  it('2. should parse valid epoch number and numeric string as VALID', () => {
    const epochMs = 1788004800000;
    const res1 = parseSafeTimestamp(epochMs, 'providerTimestamp');
    expect(res1.timestampStatus).toBe(TIMESTAMP_STATUS.VALID);
    expect(res1.timestampEpochMs).toBe(epochMs);

    const res2 = parseSafeTimestamp(String(epochMs), 'providerTimestamp');
    expect(res2.timestampStatus).toBe(TIMESTAMP_STATUS.VALID);
    expect(res2.timestampEpochMs).toBe(epochMs);
  });

  // 3. "Live" non-date string
  it('3. should parse "Live" as INVALID and not throw RangeError', () => {
    const res = parseSafeTimestamp('Live', 'providerTimestamp');
    expect(res.timestampStatus).toBe(TIMESTAMP_STATUS.INVALID);
    expect(res.parsedTimestamp).toBeNull();
    expect(res.timestampEpochMs).toBeNull();
  });

  // 4. "Second innings" non-date string
  it('4. should parse "Second innings" as INVALID', () => {
    const res = parseSafeTimestamp('Second innings', 'match.time');
    expect(res.timestampStatus).toBe(TIMESTAMP_STATUS.INVALID);
    expect(res.parsedTimestamp).toBeNull();
  });

  // 5. "14.4" non-date string
  it('5. should parse "14.4" overs string as INVALID', () => {
    const res = parseSafeTimestamp('14.4', 'match.time');
    expect(res.timestampStatus).toBe(TIMESTAMP_STATUS.INVALID);
    expect(res.parsedTimestamp).toBeNull();
  });

  // 6. null input
  it('6. should treat null as MISSING', () => {
    const res = parseSafeTimestamp(null, 'providerTimestamp');
    expect(res.timestampStatus).toBe(TIMESTAMP_STATUS.MISSING);
    expect(res.parsedTimestamp).toBeNull();
  });

  // 7. undefined input
  it('7. should treat undefined as MISSING', () => {
    const res = parseSafeTimestamp(undefined, 'providerTimestamp');
    expect(res.timestampStatus).toBe(TIMESTAMP_STATUS.MISSING);
    expect(res.parsedTimestamp).toBeNull();
  });

  // 8. Invalid string
  it('8. should parse garbage text as INVALID', () => {
    const res = parseSafeTimestamp('not-a-real-date-string-xyz', 'providerTimestamp');
    expect(res.timestampStatus).toBe(TIMESTAMP_STATUS.INVALID);
    expect(res.parsedTimestamp).toBeNull();
  });

  // 9. Stale timestamp calculation
  it('9. should accurately flag stale timestamps older than maxAgeSeconds', () => {
    const twoMinutesAgoMs = Date.now() - 120 * 1000;
    const match = {
      providerTimestamp: new Date(twoMinutesAgoMs).toISOString(),
    };
    const trust = resolveMatchTimestampTrust(match, { maxAgeSeconds: 60 });
    expect(trust.timestampStatus).toBe(TIMESTAMP_STATUS.STALE);
    expect(trust.stale).toBe(true);
    expect(trust.ageSeconds).toBeGreaterThanOrEqual(119);
  });

  // 10. Unknown / Invalid timestamp NEVER becomes NOW
  it('10. resolveMatchTimestampTrust NEVER replaces invalid or missing timestamp with current time', () => {
    const matchWithLiveString = {
      providerTimestamp: 'Live',
      cachedAt: 'Second innings',
      time: '14.4',
    };
    const trust = resolveMatchTimestampTrust(matchWithLiveString, { maxAgeSeconds: 60 });
    expect(trust.timestampStatus).toBe(TIMESTAMP_STATUS.INVALID);
    expect(trust.freshestTimestamp).toBeNull();
    expect(trust.ageSeconds).toBeNull();
    expect(trust.stale).toBe(false); // Unknown freshness != fabricated freshness
  });

  // 11. Invalid timestamp does not crash confidence engine
  it('11. evaluateSettlementConfidence executes safely with invalid timestamps', () => {
    const match = {
      id: sampleBet.match_id,
      providerTimestamp: 'Live',
      status: 'LIVE',
      isLive: true,
    };
    const conf = evaluateSettlementConfidence({
      match,
      bet: sampleBet,
      marketContext: {
        marketId: sampleBet.market_id,
        boundaryReached: true,
        hasImmutableSnapshotEvidence: true,
      },
      evaluatedOutcome: 'LOST',
    });

    expect(conf.settlementAllowed).toBe(true);
    expect(conf.confidenceState).toBe('CONFIRMED');
    expect(conf.freshness.freshestTimestamp).toBeNull();
    expect(conf.freshness.timestampStatus).toBe(TIMESTAMP_STATUS.INVALID);
  });

  // 12. Non-snapshot live market cannot claim high confidence with unverified timestamp
  it('12. live unverified market without snapshots cannot claim high confidence', () => {
    const match = {
      id: sampleBet.match_id,
      providerTimestamp: 'Live',
      status: 'LIVE',
      isLive: true,
    };
    const conf = evaluateSettlementConfidence({
      match,
      bet: { ...sampleBet, market_id: 'match_winner' },
      marketContext: {
        marketId: 'match_winner',
        boundaryReached: false,
        hasImmutableSnapshotEvidence: false,
      },
      evaluatedOutcome: null,
    });

    expect(conf.settlementAllowed).toBe(false);
    expect(conf.freshness.timestampStatus).toBe(TIMESTAMP_STATUS.INVALID);
  });

  // 13. Snapshot-authorized micro-market finality preserved
  it('13. snapshot-backed micro-market grades and authorizes settlement safely', async () => {
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

    const auth = authorizeSettlement({
      match: fakeMatch,
      bet: sampleBet,
      marketContext: {
        marketId: sampleBet.market_id,
        boundaryReached: true,
        hasImmutableSnapshotEvidence: true,
        snapshotReason: graded.reason,
      },
      evaluatedOutcome: graded.outcome,
      authorizedBy: 'LiveMatchSettlementWorker',
    });

    expect(auth.success).toBe(true);
    expect(auth.authorization.authorizationId).toBeDefined();
  });

  // 14. Event identity terminology accuracy: names are not IDs
  it('14. verifies event identity terminology distinguishes team names from team IDs', () => {
    const leg = sampleBet.placement_snapshot.legs[0];
    expect(typeof leg.team1Name).toBe('string');
    expect(typeof leg.team2Name).toBe('string');
    expect(leg.team1Id).toBeUndefined(); // IDs are not fabricated when only names are captured
    expect(leg.providerEventId).toBe('sr:match:73684582');
  });
});
