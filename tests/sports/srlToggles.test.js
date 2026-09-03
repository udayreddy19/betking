import { describe, expect, it } from 'vitest';
import { isMatchSRL, isMatchOddsYraSRL, isMatchOtherSRL } from '../../src/utils/cricketFormat.js';

describe('SRL match discrimination (OddsYra SRL vs Other SRLs)', () => {
  it('correctly identifies OddsYra in-house SRL matches', () => {
    const oddsyraMatch1 = { id: 'srl_ipl_1', source: 'srl', league: 'OddsYra SRL' };
    const oddsyraMatch2 = { id: 'oy_999', seriesName: 'OddsYra SRL Premier League' };

    expect(isMatchSRL(oddsyraMatch1)).toBe(true);
    expect(isMatchOddsYraSRL(oddsyraMatch1)).toBe(true);
    expect(isMatchOtherSRL(oddsyraMatch1)).toBe(false);

    expect(isMatchSRL(oddsyraMatch2)).toBe(true);
    expect(isMatchOddsYraSRL(oddsyraMatch2)).toBe(true);
    expect(isMatchOtherSRL(oddsyraMatch2)).toBe(false);
  });

  it('correctly identifies external feed / other SRL matches', () => {
    const otherSrlMatch1 = {
      id: 'oy_10cric_888',
      source: '10cric2026',
      league: 'T20 International SRL',
      team1: 'India SRL',
      team2: 'Australia SRL',
    };
    const otherSrlMatch2 = {
      id: 'feed_srl_123',
      league: 'Simulated Reality League',
      team1: 'Delhi Capitals SRL',
      team2: 'Chennai Super Kings SRL',
    };

    expect(isMatchSRL(otherSrlMatch1)).toBe(true);
    expect(isMatchOddsYraSRL(otherSrlMatch1)).toBe(false);
    expect(isMatchOtherSRL(otherSrlMatch1)).toBe(true);

    expect(isMatchSRL(otherSrlMatch2)).toBe(true);
    expect(isMatchOddsYraSRL(otherSrlMatch2)).toBe(false);
    expect(isMatchOtherSRL(otherSrlMatch2)).toBe(true);
  });

  it('returns false for standard non-SRL matches', () => {
    const regularMatch = {
      id: 'oy_real_444',
      league: 'Indian Premier League',
      team1: 'Chennai Super Kings',
      team2: 'Mumbai Indians',
    };

    expect(isMatchSRL(regularMatch)).toBe(false);
    expect(isMatchOddsYraSRL(regularMatch)).toBe(false);
    expect(isMatchOtherSRL(regularMatch)).toBe(false);
  });
});
