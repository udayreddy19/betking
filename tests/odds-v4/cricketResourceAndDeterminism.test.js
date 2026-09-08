import { describe, it, expect } from 'vitest';
import {
  remainingResourcePct,
  expectedRemainingRuns,
  formatFullInningsExpectation,
} from '../../lib/odds-v4/models/resourceTables.mjs';
import {
  chaseWinProbability,
  inningsOneWinProbability,
} from '../../lib/odds-v4/models/WinExpectancyEngine.mjs';
import { buildCanonicalFromMatch } from '../../lib/odds-v3/buildCanonicalFromMatch.mjs';
import { generate as generateOddsV4 } from '../../lib/odds-v4/OddsEngineV4.mjs';

describe('Priority 6: Cricket Format-Aware Resource Model', () => {
  it('correctly handles Test cricket with null ballsRemaining without inventing values', () => {
    // Test match with ballsRemaining: null
    const res = remainingResourcePct({
      format: 'TEST',
      wicketsInHand: 6,
      ballsRemaining: null,
    });
    expect(res).toBeNull();

    const expectedRuns = expectedRemainingRuns({
      format: 'TEST',
      wicketsInHand: 6,
      ballsRemaining: null,
    });
    expect(expectedRuns).toBeNull();

    // In WinExpectancyEngine, Test chase with null ballsRemaining uses Test wicket expectancy
    const testChase = chaseWinProbability({
      format: 'TEST',
      runsRequired: 80,
      wicketsRemaining: 6,
      ballsRemaining: null,
    });
    expect(testChase.method).toBe('test_wicket_expectancy');
    expect(testChase.pChase).toBeGreaterThan(0.5); // 6 wickets in hand to get 80 runs is favored in Test cricket
    expect(testChase.pChase + testChase.pField).toBeCloseTo(1.0, 5);

    // Test innings 1 with null ballsRemaining
    const testInns1 = inningsOneWinProbability({
      format: 'TEST',
      battingRuns: 250,
      wicketsRemaining: 4,
      ballsRemaining: null,
    });
    expect(testInns1.method).toBe('test_innings1_model');
    expect(testInns1.pBatFirst).toBeGreaterThan(0.2);
  });

  it('correctly calculates The Hundred using legal deliveries (0-100 balls)', () => {
    // 64 legal deliveries remaining with 8 wickets in hand
    const hundredPct = remainingResourcePct({
      format: 'THE_HUNDRED',
      wicketsInHand: 8,
      ballsRemaining: 64,
      ballsPerInnings: 100,
    });
    expect(hundredPct).toBeGreaterThan(40);
    expect(hundredPct).toBeLessThan(70);

    const hundredRuns = expectedRemainingRuns({
      format: 'THE_HUNDRED',
      wicketsInHand: 8,
      ballsRemaining: 64,
      ballsPerInnings: 100,
    });
    expect(hundredRuns).toBeGreaterThan(60);
    expect(hundredRuns).toBeLessThan(110);
  });

  it('differentiates DLS curves between T20, T10, and ODI', () => {
    // 30 balls remaining, 5 wickets in hand
    const t10 = remainingResourcePct({ format: 'T10', wicketsInHand: 5, ballsRemaining: 30, ballsPerInnings: 60 });
    const t20 = remainingResourcePct({ format: 'T20', wicketsInHand: 5, ballsRemaining: 30, ballsPerInnings: 120 });
    const odi = remainingResourcePct({ format: 'ODI', wicketsInHand: 5, ballsRemaining: 30, ballsPerInnings: 300 });

    // 30 balls is 50% of a T10 match, but only 25% of T20 and 10% of ODI
    expect(t10).toBeGreaterThan(t20);
    expect(t20).toBeGreaterThan(odi);
  });
});

describe('Priority 7: Canonical Match Determinism & Stable Identity', () => {
  it('uses authoritative providerTimestamp, providerSequence, and persistent providerTeamId', () => {
    const rawMatch = {
      id: 'match_det_1',
      sport: 'cricket',
      format: 'T20',
      status: 'LIVE',
      providerTimestamp: 1725800000000,
      providerSequence: 42,
      eventTimestamp: 1725800001000,
      team1: {
        providerTeamId: 'prov_team_csk',
        id: 'csk',
        name: 'Chennai Super Kings',
        runs: 120,
        wickets: 3,
      },
      team2: {
        providerTeamId: 'prov_team_rcb',
        id: 'rcb',
        name: 'Royal Challengers Bengaluru',
        runs: 0,
        wickets: 0,
      },
      liveDetails: {
        overs: '14.2',
        score1: '120',
      },
    };

    const canonical = buildCanonicalFromMatch(rawMatch);
    expect(canonical.providerTimestamp).toBe(1725800000000);
    expect(canonical.providerTimestampFallback).toBe(false);
    expect(canonical.providerSequence).toBe(42);
    expect(canonical.eventTimestamp).toBe(1725800001000);
    expect(canonical.team1.id).toBe('prov_team_csk');
    expect(canonical.team2.id).toBe('prov_team_rcb');
  });

  it('produces identical output for identical inputs (deterministic replay with frozen clock)', () => {
    import('vitest').then(({ vi }) => {
      vi.useFakeTimers();
      vi.setSystemTime(1725800000000);

      const rawMatch = {
        id: 'match_replay_test',
        sport: 'cricket',
        format: 'T20',
        status: 'LIVE',
        providerTimestamp: 1725800000000,
        team1: { providerTeamId: 't1', name: 'Team 1', runs: 85, wickets: 2 },
        team2: { providerTeamId: 't2', name: 'Team 2', runs: 0, wickets: 0 },
        liveDetails: { overs: '10.0', score1: '85' },
      };

      const canonical1 = buildCanonicalFromMatch(rawMatch, { frozenClock: 1725800000000 });
      const snap1 = generateOddsV4(canonical1, { winnerOnly: true });

      const canonical2 = buildCanonicalFromMatch(rawMatch, { frozenClock: 1725800000000 });
      const snap2 = generateOddsV4(canonical2, { winnerOnly: true });

      // Exact identity
      expect(snap1.status).toBe(snap2.status);
      expect(snap1.markets.length).toBe(snap2.markets.length);
      expect(snap1.markets[0].selections[0].odds).toBe(snap2.markets[0].selections[0].odds);
      expect(snap1.markets[0].selections[1].odds).toBe(snap2.markets[0].selections[1].odds);

      vi.useRealTimers();
    });
  });
});
