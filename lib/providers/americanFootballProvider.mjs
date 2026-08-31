/**
 * American Football Provider Chain
 * Free Data Sources: CollegeFootballData, CFL API, ESPN
 */

import { normalizeStandardMatch } from '../normalizers/matchNormalizer.mjs';

export async function fetchAmericanFootballMatches(type = 'live') {
  const allowSample = process.env.ENABLE_MOCK_SPORTS === 'true' && process.env.NODE_ENV !== 'production';
  return {
    provider: 'collegefootball-cfl-api',
    sourceType: 'teams_schedules_scores',
    matches: allowSample ? [
      normalizeStandardMatch({
        id: 'cfb_2026_1',
        sport: 'american-football',
        competition: 'NCAA College Football',
        isLive: true,
        matchState: 'in',
        team1: { name: 'Alabama Crimson Tide', shortName: 'ALA' },
        team2: { name: 'Georgia Bulldogs', shortName: 'UGA' },
        liveDetails: { runs: 24, score2: 21, period: 'Q3 04:15' },
        venue: { name: 'Bryant-Denny Stadium', city: 'Tuscaloosa' },
      }, 'collegefootball-cfl-api'),
    ] : [],
  };
}
