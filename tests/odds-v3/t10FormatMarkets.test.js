import { describe, expect, it } from 'vitest';
import { generate } from '../../lib/odds-v3/OddsEngineV3.mjs';
import { createCanonicalMatchState } from '../../lib/odds-v3/models/CanonicalMatchState.mjs';
import { buildCanonicalFromMatch } from '../../lib/odds-v3/buildCanonicalFromMatch.mjs';
import { nextBallSlot, resolveCricketFormat } from '../../lib/odds-v3/format/CricketFormatRules.mjs';

describe('T10 live book', () => {
  it('detects T10 from the series name even when matchType is T20', () => {
    expect(resolveCricketFormat({
      matchType: 'T20',
      league: 'German Super League Frankfurt T10',
    })).toBe('T10');
  });

  it('treats 6.0 overs as Over 7 Ball 1, not Over 6 Ball 6', () => {
    expect(nextBallSlot(36, 6)).toEqual({
      overNum: 7,
      ballNum: 1,
      nextOverNum: 7,
      currentOverComplete: true,
    });
    expect(nextBallSlot(35, 6).overNum).toBe(6);
    expect(nextBallSlot(35, 6).ballNum).toBe(6);
  });

  it('does not offer 15/20-over markets and prices a steep T10 chase as a long shot', () => {
    const match = {
      id: 'gsl_t10',
      sport: 'cricket',
      matchType: 'T20',
      league: 'German Super League Frankfurt T10',
      isLive: true,
      matchState: 'in',
      team1: { name: 'Darmstadt Sultans', shortName: 'DS' },
      team2: { name: 'FC Germania Gustavsburg', shortName: 'FCGG' },
      liveDetails: {
        inningsId: 2,
        firstRuns: 162,
        firstWickets: 5,
        firstOvers: '10.0',
        firstTeamName: 'Darmstadt Sultans',
        chaseRuns: 77,
        chaseWickets: 1,
        chaseOvers: '6.0',
        chaseTeamName: 'FC Germania Gustavsburg',
        score2: 77,
        wickets2: 1,
        overs2: '6.0',
      },
    };

    const state = buildCanonicalFromMatch(match);
    expect(state.format).toBe('T10');
    expect(state.ballsPerInnings).toBe(60);
    expect(state.ballsCompleted).toBe(36);
    expect(state.ballsRemaining).toBe(24);
    expect(state.runsRequired).toBe(86);

    const snapshot = generate(state);
    const names = snapshot.markets.map((m) => m.name);

    expect(names.some((n) => /0 to 15/.test(n))).toBe(false);
    expect(names.some((n) => /0 to 20/.test(n))).toBe(false);
    expect(names.some((n) => /0 to 10/.test(n))).toBe(true);

    const delivery = snapshot.markets.find((m) => m.marketType === 'NEXT_DELIVERY_RUNS');
    expect(delivery.name).toBe('Over 7 Ball 1 - Delivery Result');

    const nextOver = snapshot.markets.find((m) => m.marketType === 'NEXT_OVER_TOTAL');
    expect(nextOver.name).toMatch(/Next Over \(7\)/);

    const winner = snapshot.markets.find((m) => m.marketType === 'MATCH_WINNER');
    const chase = winner.selections.find((s) => s.name === 'FC Germania Gustavsburg');
    const defend = winner.selections.find((s) => s.name === 'Darmstadt Sultans');
    expect(chase.odds).toBeGreaterThan(defend.odds);
    expect(chase.odds).toBeGreaterThan(6);
  });

  it('still generates a T20 book when the format is actually T20', () => {
    const state = createCanonicalMatchState({
      matchId: 't20',
      sport: 'CRICKET',
      format: 'T20',
      status: 'LIVE',
      team1: { id: 'a', name: 'A', runs: 162, wickets: 5, balls: 120 },
      team2: { id: 'b', name: 'B', runs: 77, wickets: 1, balls: 36 },
      currentInnings: 2,
      battingTeamId: 'b',
      bowlingTeamId: 'a',
      target: 163,
      runsRequired: 86,
      ballsPerInnings: 120,
      ballsCompleted: 36,
      ballsRemaining: 84,
      providerTimestamp: Date.now(),
      stateVersion: 1,
    });
    const snapshot = generate(state);
    expect(snapshot.markets.some((m) => /0 to 20/.test(m.name))).toBe(true);
  });
});
