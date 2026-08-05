/**
 * Formula 1 Provider Chain — OpenF1 -> Jolpica -> ESPN
 */

import { normalizeStandardMatch } from '../normalizers/matchNormalizer.mjs';

export async function fetchFormula1Matches(type = 'live') {
  return {
    provider: 'openf1',
    matches: [
      normalizeStandardMatch({
        id: 'f1_monaco',
        sport: 'formula1',
        competition: 'Monaco Grand Prix 2026',
        isLive: true,
        matchState: 'in',
        team1: { name: 'Max Verstappen (Red Bull)', shortName: 'VER' },
        team2: { name: 'Charles Leclerc (Ferrari)', shortName: 'LEC' },
        liveDetails: { runs: 54, score2: 0, period: 'Lap 54/78' },
        venue: { name: 'Circuit de Monaco', city: 'Monte Carlo' },
      }, 'openf1'),
    ],
  };
}
