import { describe, it, expect } from 'vitest';
import {
  textsMatch,
  matchBelongsToLeague,
  resolveLeagueId,
  seriesCoveredByFeatured,
  getLeagueMeta,
  canonicalLeagueName,
} from '../../src/utils/leagueNavigation.js';

describe('leagueNavigation aliases', () => {
  it('matches CPL short name to Caribbean Premier League', () => {
    expect(textsMatch('CPL', 'Caribbean Premier League')).toBe(true);
    expect(textsMatch('CPL 2026', 'Caribbean Premier League, 2026')).toBe(true);
  });

  it('matches TNPL short name to Tamil Nadu Premier League', () => {
    expect(textsMatch('TNPL', 'Tamil Nadu Premier League')).toBe(true);
  });

  it('matches tour name to Test Series feed label', () => {
    expect(
      textsMatch('Bangladesh tour of Australia', 'Test Series Australia vs Bangladesh'),
    ).toBe(true);
  });

  it('includes Cricbuzz CPL matches under featured Caribbean Premier League', () => {
    const meta = getLeagueMeta('cpl');
    expect(matchBelongsToLeague({ league: 'CPL', seriesName: 'CPL 2026' }, meta)).toBe(true);
    expect(matchBelongsToLeague({ league: 'Caribbean Premier League, 2026' }, meta)).toBe(true);
  });

  it('resolves dynamic CPL series id to featured cpl', () => {
    const series = [{ id: 'cb-series-12123', name: 'CPL', rawName: 'CPL 2026', seriesId: 12123 }];
    expect(resolveLeagueId('cb-series-12123', series)).toBe('cpl');
    expect(resolveLeagueId('CPL', series)).toBe('cpl');
  });

  it('treats CPL/TNPL series as covered by featured leagues', () => {
    expect(seriesCoveredByFeatured({ name: 'CPL', rawName: 'CPL 2026' })).toBe(true);
    expect(seriesCoveredByFeatured({ name: 'TNPL', rawName: 'TNPL 2026' })).toBe(true);
  });

  it('canonicalizes CPL feed leagues under Caribbean Premier League', () => {
    expect(canonicalLeagueName('CPL')).toBe('Caribbean Premier League');
    expect(canonicalLeagueName('Caribbean Premier League, 2026')).toBe('Caribbean Premier League');
  });
});
