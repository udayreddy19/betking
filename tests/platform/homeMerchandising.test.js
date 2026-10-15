import { describe, expect, it } from 'vitest';
import { buildHomeLeagueChips } from '../../src/utils/homeMerchandising.js';

describe('buildHomeLeagueChips', () => {
  const featured = [
    { id: 'f1', name: 'Static League', sport: 'cricket', matchLeagues: ['Static League'] },
  ];

  it('prefers leagues present in the live feed', () => {
    const matches = [
      { sport: 'cricket', league: 'Live Premier Cup', matchState: 'in' },
      { sport: 'cricket', league: 'Live Premier Cup', matchState: 'pre' },
      { sport: 'cricket', league: 'Other Trophy', matchState: 'pre' },
    ];
    const chips = buildHomeLeagueChips(matches, 'cricket', { featured });
    expect(chips.map((c) => c.name)).toEqual(['Live Premier Cup', 'Other Trophy']);
    expect(chips[0].matchLeagues).toContain('Live Premier Cup');
  });

  it('falls back to static featured leagues when the feed has none', () => {
    const chips = buildHomeLeagueChips([], 'cricket', { featured });
    expect(chips).toEqual(featured);
  });
});
