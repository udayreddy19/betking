import { describe, it, expect } from 'vitest';
import { createCanonicalMatchState } from '../../lib/odds-v3/models/CanonicalMatchState.mjs';

describe('OddsEngineV3 — CanonicalMatchState Model', () => {
  const validPayload = {
    matchId: 'match_100',
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

  it('creates an immutable, valid CanonicalMatchState when all fields are correct', () => {
    const state = createCanonicalMatchState(validPayload);
    expect(state.matchId).toBe('match_100');
    expect(state.sport).toBe('CRICKET');
    expect(state.format).toBe('THE_HUNDRED');
    expect(state.team1.name).toBe('Oval Invincibles');
    expect(state.team2.runs).toBe(98);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.team1)).toBe(true);
    expect(Object.isFrozen(state.team2)).toBe(true);
  });

  it('throws error when input is null or undefined', () => {
    expect(() => createCanonicalMatchState(null)).toThrow('must be a non-null object');
  });

  it('throws error when required fields are missing', () => {
    const incomplete = { ...validPayload };
    delete incomplete.matchId;
    expect(() => createCanonicalMatchState(incomplete)).toThrow("missing required field 'matchId'");
  });

  it('throws error when team data is incomplete', () => {
    const badTeam = { ...validPayload, team1: { runs: 100 } };
    expect(() => createCanonicalMatchState(badTeam)).toThrow('team1 must have id and name');
  });
});
