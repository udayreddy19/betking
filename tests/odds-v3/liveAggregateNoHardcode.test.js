import { describe, it, expect } from 'vitest';
import { createCanonicalMatchState } from '../../lib/odds-v3/models/CanonicalMatchState.mjs';
import { generateExtendedMatchTotals } from '../../lib/odds-v3/markets/matchTotals.mjs';
import { generateExtendedInningsTotals } from '../../lib/odds-v3/markets/inningsTotal.mjs';
import { calculateOverUnderProbability } from '../../lib/odds-v3/models/distributionModel.mjs';

function odiChaseState(extra = {}) {
  return createCanonicalMatchState({
    matchId: 'live_agg_audit',
    sport: 'CRICKET',
    format: 'ODI',
    status: 'LIVE',
    team1: {
      id: 'SAU', name: 'Saudi Arabia', runs: 190, wickets: 10, balls: 300,
      fours: 18, sixes: 4,
    },
    team2: {
      id: 'NEP', name: 'Nepal', runs: 42, wickets: 2, balls: 68,
      fours: 5, sixes: 1,
    },
    currentInnings: 2,
    battingTeamId: 'NEP',
    bowlingTeamId: 'SAU',
    target: 191,
    runsRequired: 149,
    ballsPerInnings: 300,
    ballsCompleted: 68,
    ballsRemaining: 232,
    providerTimestamp: Date.now(),
    stateVersion: 1,
    ...extra,
  });
}

describe('Live aggregate markets — no hardcoded ignore-live pricing', () => {
  it('total match sixes/fours use live counts (4+1=5 sixes, 18+5=23 fours)', () => {
    const markets = generateExtendedMatchTotals(odiChaseState());
    const sixes = markets.find((m) => m.marketId === 'total_match_sixes');
    const fours = markets.find((m) => m.marketId === 'total_match_fours');
    expect(sixes.line).toBeGreaterThanOrEqual(5.5);
    expect(fours.line).toBeGreaterThanOrEqual(23.5);
    // Line sits above live; Under is not a coin-flip when plenty of balls remain for sixes
    const sixOver = sixes.selections.find((s) => /over/i.test(s.name));
    const sixUnder = sixes.selections.find((s) => /under/i.test(s.name));
    expect(sixOver.odds).toBeGreaterThan(1);
    expect(sixUnder.odds).toBeGreaterThan(1);
  });

  it('total match wickets line tracks live projection (not fixed 12.5)', () => {
    const market = generateExtendedMatchTotals(odiChaseState())
      .find((m) => m.marketId === 'total_match_wickets');
    expect(market.line).toBeGreaterThan(12.5);
    const over = market.selections.find((s) => s.selectionId === 'sel_wkt_over');
    const under = market.selections.find((s) => s.selectionId === 'sel_wkt_under');
    // Near the projection, prices should be competitive — not absurdly locked either way
    expect(over.odds).toBeLessThan(3);
    expect(under.odds).toBeLessThan(3);
  });

  it('team fours/sixes in innings 1 respect live batting-team counts', () => {
    const state = createCanonicalMatchState({
      matchId: 'inn1_bounds',
      sport: 'CRICKET',
      format: 'T20',
      status: 'LIVE',
      team1: { id: 'A', name: 'A', runs: 120, wickets: 3, balls: 90, fours: 14, sixes: 6 },
      team2: { id: 'B', name: 'B', runs: 0, wickets: 0, balls: 0, fours: 0, sixes: 0 },
      currentInnings: 1,
      battingTeamId: 'A',
      bowlingTeamId: 'B',
      target: null,
      runsRequired: null,
      ballsPerInnings: 120,
      ballsCompleted: 90,
      ballsRemaining: 30,
      providerTimestamp: Date.now(),
      stateVersion: 1,
    });
    const markets = generateExtendedInningsTotals(state);
    const fours = markets.find((m) => m.marketId === 'team_total_fours');
    const sixes = markets.find((m) => m.marketId === 'team_total_sixes');
    expect(fours.line).toBeGreaterThanOrEqual(14.5);
    expect(sixes.line).toBeGreaterThanOrEqual(6.5);
  });

  it('V4-style OU call must use (mean, line, …) not (mean, sd, line)', () => {
    // Correct: mean 150, line 155.5 → Under favoured
    const correct = calculateOverUnderProbability(150, 155.5, 1.5, 120, 12);
    // Bug pattern: mean 150, "line"=12 (sd), third arg=155.5 treated as varianceRatio
    const buggy = calculateOverUnderProbability(150, 12, 155.5, 120, 5);
    expect(correct.pUnder).toBeGreaterThan(0.5);
    expect(buggy.pOver).not.toBeCloseTo(correct.pOver, 1);
  });
});
