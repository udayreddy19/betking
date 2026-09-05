import { describe, expect, it } from 'vitest';
import { getMatchMaxOvers, resolveCricketOversFormat } from '../../src/utils/cricketFormat.js';
import { resolveCricketFormat } from '../../lib/odds-v3/format/CricketFormatRules.mjs';

describe('T10 overs format detection', () => {
  it('treats Frankfurt T10 as 10 overs even when matchType is T20', () => {
    const match = {
      matchType: 'T20',
      league: 'German Super League Frankfurt T10',
    };
    expect(resolveCricketOversFormat(match)).toBe('T10');
    expect(resolveCricketFormat(match)).toBe('T10');
    expect(getMatchMaxOvers(match)).toBe(10);
  });

  it('treats German Super League / ECS series as T10 even without T10 in the title', () => {
    expect(resolveCricketOversFormat({
      matchType: 'T20',
      matchFormat: 'T20',
      league: 'German Super League',
      seriesName: 'German Super League, 2026',
    })).toBe('T10');
    expect(resolveCricketOversFormat({
      matchType: 'T20',
      league: 'ECS Hungary',
      seriesName: 'ECS Hungary, 2026',
    })).toBe('T10');
  });

  it('treats Quantum Cricket League virtual games as T10', () => {
    const match = {
      league: 'Quantum Cricket League',
      team1: { name: 'Pakistan (V)' },
      team2: { name: 'New Zealand (V)' },
      liveDetails: { overs: '4.0', inningsId: 2 },
    };
    expect(getMatchMaxOvers(match)).toBe(10);
  });

  it('infers T10 when the first innings finished at 10.0', () => {
    const match = {
      matchType: 'T20',
      league: 'Unknown Cup',
      liveDetails: {
        inningsId: 2,
        firstOvers: '10.0',
        firstRuns: 98,
        chaseRuns: 40,
        chaseOvers: '4.0',
      },
    };
    expect(resolveCricketOversFormat(match)).toBe('T10');
    expect(getMatchMaxOvers(match)).toBe(10);
  });

  it('keeps real T20 leagues at 20 overs', () => {
    expect(getMatchMaxOvers({ league: 'Indian Premier League', matchType: 'T20' })).toBe(20);
    expect(getMatchMaxOvers({ league: 'The Hundred', matchType: '100' })).toBe(20);
  });

  it('treats Oman D50 as 50-over ODI even when matchType is T20', () => {
    const match = {
      matchType: 'T20',
      matchFormat: 'T20',
      league: 'Oman D50 2026',
      liveDetails: {
        inningsId: 2,
        firstOvers: '48.5',
        firstRuns: 187,
        chaseRuns: 39,
        chaseOvers: '8.3',
      },
    };
    expect(resolveCricketOversFormat(match)).toBe('ODI');
    expect(resolveCricketFormat(match)).toBe('ODI');
    expect(getMatchMaxOvers(match)).toBe(50);
  });

  it('infers ODI when first innings overs exceed 20', () => {
    expect(resolveCricketOversFormat({
      matchType: 'T20',
      league: 'Unknown Cup',
      liveDetails: { firstOvers: '48.5', inningsId: 2, chaseRuns: 20 },
    })).toBe('ODI');
  });
});
