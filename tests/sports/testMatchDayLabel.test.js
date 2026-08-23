import { describe, it, expect } from 'vitest';
import { getTestMatchDayLabel, isTestMatch } from '../../src/utils/cricketFormat.js';

describe('getTestMatchDayLabel', () => {
  it('does not invent 4th Day when day is unknown', () => {
    const match = {
      league: 'Test Series Sri Lanka vs. India',
      matchFormat: 'TEST',
      isLive: true,
      matchState: 'in',
      liveDetails: { overs: '0.0', runs: 0, commentary: 'Live' },
    };
    expect(isTestMatch(match)).toBe(true);
    expect(getTestMatchDayLabel(match)).toBeNull();
  });

  it('parses explicit day from commentary', () => {
    const match = {
      league: 'Test Series',
      liveDetails: { commentary: 'Day 2 · Morning Session', overs: '45.0', runs: 120 },
    };
    expect(getTestMatchDayLabel(match)).toBe('2nd Day · Morning Session');
  });
});
