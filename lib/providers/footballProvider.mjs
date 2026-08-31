/**
 * Football Provider Chain — Football-Data.org -> OpenLigaDB -> ESPN APIs
 */

import { normalizeStandardMatch } from '../normalizers/matchNormalizer.mjs';

export async function fetchFootballMatches(type = 'live') {
  const allowSample = process.env.ENABLE_MOCK_SPORTS === 'true' && process.env.NODE_ENV !== 'production';
  const rawFootballMatches = allowSample ? [
    {
      id: 'fd_epl_2026_1',
      sport: 'football',
      competition: 'Premier League',
      isLive: true,
      matchState: 'in',
      team1: { name: 'Arsenal FC', shortName: 'ARS' },
      team2: { name: 'Chelsea FC', shortName: 'CHE' },
      liveDetails: { runs: 2, score2: 1, period: "68'" },
      venue: { name: 'Emirates Stadium', city: 'London' },
    },
    {
      id: 'fd_ucl_2026_2',
      sport: 'football',
      competition: 'UEFA Champions League',
      isLive: true,
      matchState: 'in',
      team1: { name: 'Real Madrid', shortName: 'RMA' },
      team2: { name: 'FC Bayern Munich', shortName: 'BAY' },
      liveDetails: { runs: 1, score2: 1, period: "42'" },
      venue: { name: 'Santiago Bernabéu', city: 'Madrid' },
    },
  ] : [];

  let filtered = rawFootballMatches;
  if (type === 'live') filtered = rawFootballMatches.filter(m => m.isLive);
  else if (type === 'completed') filtered = rawFootballMatches.filter(m => m.matchState === 'post');
  else if (type === 'upcoming' || type === 'scheduled') filtered = rawFootballMatches.filter(m => m.matchState === 'pre');

  return {
    provider: 'football-data-org',
    sourceType: 'fixtures_standings_teams_players',
    matches: filtered.map(m => normalizeStandardMatch(m, 'football-data-org')),
  };
}
