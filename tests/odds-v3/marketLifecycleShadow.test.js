import { describe, it, expect } from 'vitest';
import { generate } from '../../lib/odds-v3/OddsEngineV3.mjs';
import { createCanonicalMatchState } from '../../lib/odds-v3/models/CanonicalMatchState.mjs';

describe('OddsEngineV3 — Phase 7 Market Lifecycle Shadow Tests', () => {
  const baseInput = {
    matchId: 'match_lifecycle_test',
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
    providerTimestamp: Date.now(),
    stateVersion: 1,
  };

  it('omits completed first innings, powerplay, and first over markets from active snapshot', () => {
    const state = createCanonicalMatchState(baseInput);
    const snapshot = generate(state);

    const marketTypes = snapshot.markets.map(m => m.marketType);
    expect(marketTypes).not.toContain('FIRST_OVER');
    expect(marketTypes).not.toContain('POWERPLAY');
    expect(marketTypes).not.toContain('TEAM_1_COMPLETED_INNINGS');
  });

  it('marks match winner as SETTLED when target is reached (no 1.01 fallback)', () => {
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

    const winnerMarket = snapshot.markets[0];
    expect(winnerMarket.status).toBe('SETTLED');
    const winnerSel = winnerMarket.selections.find(s => s.name === 'Trent Rockets');
    expect(winnerSel.probability).toBe(1);
    expect(winnerSel.odds).toBe(1);
  });

  it('marks match winner as SETTLED when balls are exhausted', () => {
    const exhaustedState = createCanonicalMatchState({
      ...baseInput,
      team2: { id: 'TRT', name: 'Trent Rockets', runs: 120, wickets: 6, balls: 100 },
      runsRequired: 23,
      ballsCompleted: 100,
      ballsRemaining: 0,
    });

    const snapshot = generate(exhaustedState);
    expect(snapshot.status).toBe('DETERMINED');
    expect(snapshot.markets[0].status).toBe('SETTLED');
    const ovalSel = snapshot.markets[0].selections.find(s => s.name === 'Oval Invincibles');
    expect(ovalSel.probability).toBe(1);
    expect(ovalSel.odds).toBe(1);
  });
});
