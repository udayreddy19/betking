import { describe, it, expect } from 'vitest';
import { generate } from '../../lib/odds-v3/OddsEngineV3.mjs';
import { createCanonicalMatchState } from '../../lib/odds-v3/models/CanonicalMatchState.mjs';

describe('OddsEngineV3 — Phase 6 Live Movement Shadow Tests', () => {
  function makeState(runs, ballsCompleted, stateVersion) {
    const target = 143;
    const ballsPerInnings = 100;
    const ballsRemaining = ballsPerInnings - ballsCompleted;
    const runsRequired = target - runs;

    return createCanonicalMatchState({
      matchId: 'match_movement_test',
      sport: 'CRICKET',
      format: 'THE_HUNDRED',
      status: 'LIVE',
      team1: { id: 'OVI', name: 'Oval Invincibles', runs: 142, wickets: 5, balls: 100 },
      team2: { id: 'TRT', name: 'Trent Rockets', runs, wickets: 3, balls: ballsCompleted },
      currentInnings: 2,
      battingTeamId: 'TRT',
      bowlingTeamId: 'OVI',
      target,
      runsRequired,
      ballsPerInnings,
      ballsCompleted,
      ballsRemaining,
      providerTimestamp: Date.now(),
      stateVersion,
    });
  }

  it('validates logical probability directional movement across States A, B, C, D', () => {
    // STATE A: 98/3, 45 required off 42
    const snapA = generate(makeState(98, 58, 1));
    // STATE B: 108/3, 35 required off 32
    const snapB = generate(makeState(108, 68, 2));
    // STATE C: 128/3, 15 required off 20
    const snapC = generate(makeState(128, 80, 3));
    // STATE D: 138/3, 5 required off 10
    const snapD = generate(makeState(138, 90, 4));

    const getP = (snap) => {
      const wm = snap.markets.find(m => m.marketType === 'MATCH_WINNER');
      const trentSel = wm.selections.find(s => s.name === 'Trent Rockets');
      return trentSel.probability;
    };

    const pA = getP(snapA);
    const pB = getP(snapB);
    const pC = getP(snapC);
    const pD = getP(snapD);

    // Directional check: as Trent scores toward target with wickets intact, p(win) monotonically increases
    expect(pB).toBeGreaterThan(pA);
    expect(pC).toBeGreaterThan(pB);
    expect(pD).toBeGreaterThan(pC);

    // Odds check: as win probability increases, odds decrease
    const getOdds = (snap) => {
      const wm = snap.markets.find(m => m.marketType === 'MATCH_WINNER');
      const trentSel = wm.selections.find(s => s.name === 'Trent Rockets');
      return trentSel.odds;
    };

    expect(getOdds(snapB)).toBeLessThan(getOdds(snapA));
    expect(getOdds(snapC)).toBeLessThan(getOdds(snapB));
    expect(getOdds(snapD)).toBeLessThan(getOdds(snapC));
  });
});
