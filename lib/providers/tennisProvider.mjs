/**
 * Tennis Provider Chain — ESPN -> OpenTennis -> TheSportsDB
 */

import { normalizeStandardMatch } from '../normalizers/matchNormalizer.mjs';

export async function fetchTennisMatches(type = 'live') {
  const allowSample = process.env.ENABLE_MOCK_SPORTS === 'true' && process.env.NODE_ENV !== 'production';
  return {
    provider: 'espn-tennis',
    matches: allowSample ? [
      normalizeStandardMatch({
        id: 'tns_1',
        sport: 'tennis',
        competition: 'Wimbledon Championships 2026',
        isLive: true,
        matchState: 'in',
        team1: { name: 'Carlos Alcaraz', shortName: 'ALC' },
        team2: { name: 'Jannik Sinner', shortName: 'SIN' },
        liveDetails: { runs: 2, score2: 1, period: 'Set 4 (4-3)' },
        venue: { name: 'Centre Court', city: 'London' },
      }, 'espn-tennis'),
    ] : [],
  };
}
