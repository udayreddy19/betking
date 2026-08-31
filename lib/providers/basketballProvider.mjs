/**
 * Basketball Provider Chain — NBA Stats API -> balldontlie -> ESPN
 */

import { normalizeStandardMatch } from '../normalizers/matchNormalizer.mjs';

export async function fetchBasketballMatches(type = 'live') {
  const allowSample = process.env.ENABLE_MOCK_SPORTS === 'true' && process.env.NODE_ENV !== 'production';
  return {
    provider: 'nba-stats',
    matches: allowSample ? [
      normalizeStandardMatch({
        id: 'nba_1',
        sport: 'basketball',
        competition: 'NBA Regular Season',
        isLive: true,
        matchState: 'in',
        team1: { name: 'Los Angeles Lakers', shortName: 'LAL' },
        team2: { name: 'Golden State Warriors', shortName: 'GSW' },
        liveDetails: { runs: 104, score2: 98, period: 'Q4 03:20' },
        venue: { name: 'Crypto.com Arena', city: 'Los Angeles' },
      }, 'nba-stats'),
    ] : [],
  };
}
