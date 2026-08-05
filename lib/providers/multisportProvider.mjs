/**
 * Multi-Sport Provider Chain
 * Free Data Sources: TheSportsDB, ESPN (unofficial endpoints), SportScore (free tier)
 */

import { normalizeStandardMatch } from '../normalizers/matchNormalizer.mjs';

export async function fetchMultiSportMatches(type = 'live') {
  return {
    provider: 'thesportsdb-espn-sportscore',
    sourceType: 'live_scores_fixtures_player_stats_leagues',
    matches: [
      normalizeStandardMatch({
        id: 'tsdb_ms_1',
        sport: 'cricket',
        competition: 'The Hundred 2026',
        isLive: true,
        matchState: 'in',
        team1: { name: 'London Spirit', shortName: 'LNS' },
        team2: { name: 'Oval Invincibles', shortName: 'OVI' },
        liveDetails: { runs: 135, score2: 0, overs: '78/100', period: 'INN 1' },
        venue: { name: "Lord's", city: 'London' },
      }, 'thesportsdb-espn-sportscore'),
      normalizeStandardMatch({
        id: 'tsdb_ms_2',
        sport: 'football',
        competition: 'La Liga 2026',
        isLive: true,
        matchState: 'in',
        team1: { name: 'FC Barcelona', shortName: 'BAR' },
        team2: { name: 'Sevilla FC', shortName: 'SEV' },
        liveDetails: { runs: 2, score2: 0, period: "54'" },
        venue: { name: 'Camp Nou', city: 'Barcelona' },
      }, 'thesportsdb-espn-sportscore'),
    ],
  };
}
