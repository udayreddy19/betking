import { describe, expect, it } from 'vitest';
import { resolveTeamFlagCode, resolveTeamFlag, isTeamBattingInMatch, isNationalTeam } from '../../src/utils/teamFlags.js';

describe('resolveTeamFlagCode', () => {
  it('maps national sides to ISO flag codes', () => {
    expect(resolveTeamFlagCode('India')).toBe('in');
    expect(resolveTeamFlagCode('Pakistan (V)')).toBe('pk');
    expect(resolveTeamFlagCode('England')).toBe('gb-eng');
    expect(resolveTeamFlagCode('Australia')).toBe('au');
    expect(resolveTeamFlagCode({ name: 'West Indies' })).toBe('wi');
    expect(resolveTeamFlagCode('Sri Lanka')).toBe('lk');
  });

  it('maps franchise and city clubs to their country', () => {
    expect(resolveTeamFlagCode('Mumbai Indians BetKing SRL')).toBe('in');
    expect(resolveTeamFlagCode('SKG Erfelden Strikers')).toBe('de');
    expect(resolveTeamFlagCode('SV Wiesbaden')).toBe('de');
    expect(resolveTeamFlagCode('Hampshire')).toBe('gb-eng');
    expect(resolveTeamFlagCode('Glamorgan')).toBe('gb-wls');
  });

  it('uses an explicit country field when present', () => {
    expect(resolveTeamFlagCode({ name: 'Unknown XI', country: 'Spain' })).toBe('es');
  });

  it('does not invent a flag URL for West Indies', () => {
    const flag = resolveTeamFlag('West Indies');
    expect(flag.kind).toBe('wi');
    expect(flag.src).toBeNull();
  });
});

describe('national vs franchise marks', () => {
  it('uses flags for nations and kit jerseys for SRL clubs', () => {
    expect(isNationalTeam('India')).toBe(true);
    expect(isNationalTeam('Pakistan (V)')).toBe(true);
    expect(isNationalTeam('Mumbai Indians BetKing SRL')).toBe(false);
    expect(isNationalTeam('Chennai Super Kings BetKing SRL')).toBe(false);

    const india = resolveTeamFlag('India');
    const mi = resolveTeamFlag({ name: 'Mumbai Indians BetKing SRL', shortName: 'MI' });
    const csk = resolveTeamFlag({ name: 'Chennai Super Kings BetKing SRL', shortName: 'CSK' });
    expect(india.kind).toBe('flag');
    expect(india.src).toContain('flagcdn.com/in.svg');
    expect(mi.kind).toBe('kit');
    expect(csk.kind).toBe('kit');
  });
});

describe('isTeamBattingInMatch', () => {
  it('flies the chasing side in the second innings', () => {
    const match = {
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      team1: { name: 'India' },
      team2: { name: 'Australia' },
      liveDetails: { firstTeamName: 'India', inningsId: 2, chaseRuns: 40 },
    };
    expect(isTeamBattingInMatch(match, match.team2)).toBe(true);
    expect(isTeamBattingInMatch(match, match.team1)).toBe(false);
  });
});
