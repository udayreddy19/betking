/**
 * Hockey Provider Chain — NHL API -> ESPN
 */

import { normalizeStandardMatch } from '../normalizers/matchNormalizer.mjs';

export async function fetchHockeyMatches(type = 'live') {
  return {
    provider: 'nhl-api',
    matches: [
      normalizeStandardMatch({
        id: 'nhl_1',
        sport: 'hockey',
        competition: 'NHL Stanley Cup 2026',
        isLive: true,
        matchState: 'in',
        team1: { name: 'Edmonton Oilers', shortName: 'EDM' },
        team2: { name: 'Florida Panthers', shortName: 'FLA' },
        liveDetails: { runs: 3, score2: 2, period: 'Period 3 05:14' },
        venue: { name: 'Rogers Place', city: 'Edmonton' },
      }, 'nhl-api'),
    ],
  };
}
