import { describe, it, expect } from 'vitest';
import { generate } from '../../lib/odds-v3/OddsEngineV3.mjs';
import { createCanonicalMatchState } from '../../lib/odds-v3/models/CanonicalMatchState.mjs';

describe('OddsEngineV3 — Integration & Snapshot Generation', () => {
  const baseInput = {
    matchId: 'match_v3_test',
    sport: 'CRICKET',
    format: 'THE_HUNDRED',
    status: 'LIVE',
    team1: { id: 'OVI', name: 'Oval Invincibles', runs: 142, wickets: 5, balls: 100 },
    team2: { id: 'TRT', name: 'Trent Rockets', runs: 98, wickets: 3, balls: 58 },
    currentInnings: 2,
    battingTeamId: 'TRT',
    bowlingTeamId: 'OVI',
    target: 143,
    runsRequired: 45,
    ballsPerInnings: 100,
    ballsCompleted: 58,
    ballsRemaining: 42,
    batter1: { name: 'Alex Hales', runs: 42, balls: 28 },
    batter2: { name: 'Tom Kohler-Cadmore', runs: 31, balls: 22 },
    providerTimestamp: Date.now(),
    stateVersion: 1,
  };

  it('generates a compact live book for Innings 2 chase', () => {
    const state = createCanonicalMatchState(baseInput);
    const snapshot = generate(state);

    expect(snapshot.engine).toBe('OddsEngineV3');
    expect(snapshot.engineVersion).toBe('3.0.0');
    expect(snapshot.matchId).toBe('match_v3_test');
    expect(snapshot.status).toBe('OK');
    expect(snapshot.markets.length).toBeGreaterThanOrEqual(12);

    const marketTypes = snapshot.markets.map(m => m.marketType);
    expect(marketTypes).toContain('MATCH_WINNER');
    expect(marketTypes).toContain('TEAM_TOTAL');
    expect(marketTypes).toContain('MATCH_TOTAL');
    expect(marketTypes).toContain('NEXT_DELIVERY_RUNS');
    expect(marketTypes).toContain('PLAYER_SCORE_25');
    expect(marketTypes).toContain('BATTER_HEAD_TO_HEAD');
  });

  it('dynamically recalculates odds as match state moves from State A to State B to State C to State D', () => {
    const makeState = (runs, wkts, balls, req, v) => createCanonicalMatchState({
      ...baseInput,
      team2: { id: 'TRT', name: 'Trent Rockets', runs, wickets: wkts, balls },
      ballsCompleted: balls,
      ballsRemaining: 100 - balls,
      runsRequired: req,
      stateVersion: v,
    });

    const snapA = generate(makeState(98, 3, 58, 45, 1));
    const snapB = generate(makeState(108, 3, 68, 35, 2));
    const snapC = generate(makeState(128, 3, 80, 15, 3));
    const snapD = generate(makeState(138, 3, 90, 5, 4));

    const wA = snapA.markets.find(m => m.marketType === 'MATCH_WINNER');
    const wB = snapB.markets.find(m => m.marketType === 'MATCH_WINNER');
    const wC = snapC.markets.find(m => m.marketType === 'MATCH_WINNER');
    const wD = snapD.markets.find(m => m.marketType === 'MATCH_WINNER');

    // Chasing team odds should shorten as required runs drop (1.25 -> 1.24 -> 1.04 -> 1.01)
    const tA = wA.selections.find(s => s.name === 'Trent Rockets').odds;
    const tB = wB.selections.find(s => s.name === 'Trent Rockets').odds;
    const tC = wC.selections.find(s => s.name === 'Trent Rockets').odds;
    const tD = wD.selections.find(s => s.name === 'Trent Rockets').odds;

    expect(tA).toBeGreaterThan(tB);
    expect(tB).toBeGreaterThan(tC);
    expect(tC).toBeGreaterThan(tD);
  });

  it('returns INVALID_STATE status for bad match state', () => {
    const badState = { ...baseInput, ballsRemaining: 999 }; // 58 + 999 != 100
    const snapshot = generate(badState);

    expect(snapshot.status).toBe('INVALID_STATE');
    expect(snapshot.markets.length).toBe(0);
  });

  it('returns DETERMINED status for settled match', () => {
    const winState = createCanonicalMatchState({
      ...baseInput,
      team2: { id: 'TRT', name: 'Trent Rockets', runs: 143, wickets: 3, balls: 85 },
      runsRequired: 0,
      ballsCompleted: 85,
      ballsRemaining: 15,
    });

    const snapshot = generate(winState);
    expect(snapshot.status).toBe('DETERMINED');
    expect(snapshot.markets.length).toBe(1);
    expect(snapshot.markets[0].status).toBe('SETTLED');
  });

  it('is completely isolated and deterministic', () => {
    const state1 = createCanonicalMatchState(baseInput);
    const state2 = createCanonicalMatchState(baseInput);

    const snap1 = generate(state1);
    const snap2 = generate(state2);

    expect(snap1.markets).toEqual(snap2.markets);
  });
});
