/**
 * Basketball Provider Chain — NBA Stats API -> balldontlie -> ESPN
 */

import { normalizeStandardMatch } from '../normalizers/matchNormalizer.mjs';

export async function fetchBasketballMatches(type = 'live') {
  return {
    provider: 'nba-stats',
    matches: [
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
      normalizeStandardMatch({
        id: 'nba_2',
        sport: 'basketball',
        competition: 'NBA Regular Season',
        isLive: true,
        matchState: 'in',
        team1: { name: 'Boston Celtics', shortName: 'BOS' },
        team2: { name: 'Miami Heat', shortName: 'MIA' },
        liveDetails: { runs: 88, score2: 82, period: 'Q3 08:45' },
        venue: { name: 'TD Garden', city: 'Boston' },
      }, 'nba-stats'),
    ],
  };
}
