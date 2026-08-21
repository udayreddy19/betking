import { describe, it, expect } from 'vitest';
import { validateMatchState } from '../../lib/odds-v3/validation/MatchStateValidator.mjs';
import { createCanonicalMatchState } from '../../lib/odds-v3/models/CanonicalMatchState.mjs';

describe('OddsEngineV3 — MatchStateValidator', () => {
  const baseInput = {
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

  it('validates a correct live match state', () => {
    const state = createCanonicalMatchState(baseInput);
    const result = validateMatchState(state);
    expect(result.valid).toBe(true);
    expect(result.determined).toBeUndefined();
  });

  it('rejects unsupported sports', () => {
    const state = createCanonicalMatchState({ ...baseInput, sport: 'FOOTBALL' });
    const result = validateMatchState(state);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('unsupported sport');
  });

  it('rejects unsupported format', () => {
    const state = createCanonicalMatchState({ ...baseInput, format: 'INVALID_FORMAT' });
    const result = validateMatchState(state);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('unsupported format');
  });

  it('detects DETERMINED when target is reached', () => {
    const state = createCanonicalMatchState({
      ...baseInput,
      team2: { id: 'TRT', name: 'Trent Rockets', runs: 143, wickets: 3, balls: 85 },
      runsRequired: 0,
      ballsCompleted: 85,
      ballsRemaining: 15,
    });
    const result = validateMatchState(state);
    expect(result.valid).toBe(true);
    expect(result.determined).toBe(true);
    expect(result.winnerId).toBe('TRT');
  });

  it('detects DETERMINED when all out or 0 balls remaining', () => {
    const state = createCanonicalMatchState({
      ...baseInput,
      team2: { id: 'TRT', name: 'Trent Rockets', runs: 120, wickets: 10, balls: 90 },
      runsRequired: 23,
      ballsCompleted: 90,
      ballsRemaining: 10,
    });
    const result = validateMatchState(state);
    expect(result.valid).toBe(true);
    expect(result.determined).toBe(true);
    expect(result.winnerId).toBe('OVI');
  });

  it('rejects mismatched runsRequired', () => {
    const state = createCanonicalMatchState({
      ...baseInput,
      runsRequired: 99, // target 143 - runs 98 = 45 != 99
    });
    const result = validateMatchState(state);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('runsRequired');
  });

  it('detects DETERMINED when target is surpassed (winning six overshoot)', () => {
    const state = createCanonicalMatchState({
      ...baseInput,
      team2: { id: 'TRT', name: 'Trent Rockets', runs: 148, wickets: 3, balls: 85 },
      runsRequired: 0,
      ballsCompleted: 85,
      ballsRemaining: 15,
    });
    const result = validateMatchState(state);
    expect(result.valid).toBe(true);
    expect(result.determined).toBe(true);
    expect(result.winnerId).toBe('TRT');
  });

  it('detects DETERMINED when chase is mathematically impossible', () => {
    const state = createCanonicalMatchState({
      ...baseInput,
      team2: { id: 'TRT', name: 'Trent Rockets', runs: 98, wickets: 3, balls: 95 },
      runsRequired: 45,
      ballsCompleted: 95,
      ballsRemaining: 5,
    });
    const result = validateMatchState(state);
    expect(result.valid).toBe(true);
    expect(result.determined).toBe(true);
    expect(result.winnerId).toBe('OVI');
  });

  it('detects TIE when scores are level with no balls remaining', () => {
    const state = createCanonicalMatchState({
      ...baseInput,
      team1: { id: 'OVI', name: 'Oval Invincibles', runs: 142, wickets: 5, balls: 100 },
      team2: { id: 'TRT', name: 'Trent Rockets', runs: 142, wickets: 8, balls: 100 },
      target: 143,
      runsRequired: 1,
      ballsCompleted: 100,
      ballsRemaining: 0,
    });
    const result = validateMatchState(state);
    expect(result.valid).toBe(true);
    expect(result.determined).toBe(true);
    expect(result.tied).toBe(true);
    expect(result.winnerId).toBeNull();
  });
});
