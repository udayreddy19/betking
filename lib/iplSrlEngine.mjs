/**
 * Module A: IPLSRL Competition Engine
 * Manages competition lifecycle (DRAFT, SCHEDULED, ACTIVE, COMPLETED, ARCHIVED),
 * standings, playoff brackets, and seasons.
 */

import { getAllIPLSRLTeams } from './iplSrlTeamEngine.mjs';
import { generateIPLSRLFixtures, generateIPLSRLPlayoffFixtures } from './iplSrlFixtureEngine.mjs';

export const COMPETITION_STATUS = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED',
};

const seasonsStore = [
  {
    seasonId: 'IPLSRL_2026',
    name: 'IPLSRL Season 2026',
    edition: 5,
    year: 2026,
    status: COMPETITION_STATUS.ACTIVE,
    startDate: '2026-03-20',
    endDate: '2026-05-25',
    teams: ['csk_srl', 'mi_srl', 'rcb_srl', 'kkr_srl', 'gt_srl', 'srh_srl'],
    fixtures: [],
    standings: [],
    playoffs: [],
    winner: null,
  },
];

export function createIPLSRLSeason(seasonData = {}) {
  const teams = getAllIPLSRLTeams().filter(t => t.status !== 'DISABLED');
  const seasonId = seasonData.seasonId || `IPLSRL_${Date.now()}`;
  const fixtures = generateIPLSRLFixtures(seasonId, teams);

  const newSeason = {
    seasonId,
    name: seasonData.name || `IPLSRL Season ${new Date().getFullYear()}`,
    edition: seasonData.edition || seasonsStore.length + 1,
    year: seasonData.year || new Date().getFullYear(),
    status: COMPETITION_STATUS.SCHEDULED,
    startDate: seasonData.startDate || new Date().toISOString().split('T')[0],
    endDate: seasonData.endDate || new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0],
    teams: teams.map(t => t.teamId),
    fixtures,
    standings: getIPLSRLStandings(seasonId),
    playoffs: [],
    winner: null,
  };

  seasonsStore.push(newSeason);
  return newSeason;
}

export function getIPLSRLSeason(seasonId = 'IPLSRL_2026') {
  let s = seasonsStore.find(sec => sec.seasonId === seasonId);
  if (!s) {
    s = seasonsStore[0];
  }
  if (!s.fixtures || s.fixtures.length === 0) {
    s.fixtures = generateIPLSRLFixtures(s.seasonId);
  }
  return s;
}

export function getIPLSRLStandings(seasonId = 'IPLSRL_2026') {
  const teams = getAllIPLSRLTeams();
  return teams.map((team, idx) => ({
    rank: idx + 1,
    teamId: team.teamId,
    teamName: team.teamName,
    shortName: team.shortName,
    matches: 10,
    won: 7 - (idx % 3),
    lost: 3 + (idx % 3),
    noResult: 0,
    points: (7 - (idx % 3)) * 2,
    nrr: (+((0.85 - idx * 0.25)).toFixed(3)),
    runsFor: 1850 - idx * 40,
    oversFor: 200.0,
    runsAgainst: 1720 + idx * 30,
    oversAgainst: 200.0,
  })).sort((a, b) => b.points - a.points || b.nrr - a.nrr);
}

export function getIPLSRLFixtures(seasonId = 'IPLSRL_2026') {
  const season = getIPLSRLSeason(seasonId);
  return season ? season.fixtures : [];
}

export function getIPLSRLPlayoffs(seasonId = 'IPLSRL_2026') {
  const standings = getIPLSRLStandings(seasonId);
  return generateIPLSRLPlayoffFixtures(seasonId, standings);
}
