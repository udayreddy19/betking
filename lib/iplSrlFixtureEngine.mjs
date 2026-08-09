/**
 * Module E: IPLSRL Fixture Engine
 * Generates round-robin league schedules and playoff matches for IPLSRL seasons.
 */

import { getAllIPLSRLTeams } from './iplSrlTeamEngine.mjs';

export function generateIPLSRLFixtures(seasonId = 'IPLSRL_2026', teamsList = null) {
  const teams = teamsList || getAllIPLSRLTeams().filter(t => t.status !== 'DISABLED');
  if (teams.length < 2) return [];

  const fixtures = [];
  let matchNum = 1;
  const startDate = new Date();
  startDate.setHours(19, 30, 0, 0);

  let currentDayOffset = 0;
  let isDoubleHeaderSlot = false;

  // Round robin: Each team plays each other home & away
  for (let i = 0; i < teams.length; i += 1) {
    for (let j = 0; j < teams.length; j += 1) {
      if (i !== j) {
        const homeTeam = teams[i];
        const awayTeam = teams[j];

        const matchDate = new Date(startDate.getTime() + currentDayOffset * 86400000);
        const dayOfWeek = matchDate.getDay(); // 0 = Sun, 6 = Sat

        const matchTime = new Date(matchDate);
        if ((dayOfWeek === 0 || dayOfWeek === 6) && !isDoubleHeaderSlot) {
          // Weekend Afternoon match: 3:30 PM IST
          matchTime.setHours(15, 30, 0, 0);
          isDoubleHeaderSlot = true;
        } else {
          // Regular Evening match: 7:30 PM IST
          matchTime.setHours(19, 30, 0, 0);
          isDoubleHeaderSlot = false;
          currentDayOffset += 1;
        }

        const dateStr = matchTime.toLocaleDateString('en-CA');
        const formattedTimeStr = matchTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

        fixtures.push({
          fixtureId: `fix_${seasonId}_m${matchNum}`,
          seasonId,
          matchNumber: matchNum,
          homeTeamId: homeTeam.teamId,
          homeTeamName: homeTeam.teamName,
          homeTeamShort: homeTeam.shortName,
          awayTeamId: awayTeam.teamId,
          awayTeamName: awayTeam.teamName,
          awayTeamShort: awayTeam.shortName,
          venue: homeTeam.homeVenue,
          date: dateStr,
          timeDisplay: `${formattedTimeStr} IST`,
          startTime: matchTime.toISOString(),
          status: 'SCHEDULED',
          stage: 'LEAGUE',
        });
        matchNum += 1;
      }
    }
  }

  return fixtures;
}

export function generateIPLSRLPlayoffFixtures(seasonId, standings) {
  if (!standings || standings.length < 4) return [];

  const top1 = standings[0];
  const top2 = standings[1];
  const top3 = standings[2];
  const top4 = standings[3];

  const now = new Date();

  return [
    {
      fixtureId: `fix_${seasonId}_q1`,
      seasonId,
      matchNumber: 'Qualifier 1',
      homeTeamId: top1.teamId,
      homeTeamName: top1.teamName,
      awayTeamId: top2.teamId,
      awayTeamName: top2.teamName,
      venue: top1.homeVenue,
      startTime: new Date(now.getTime() + 86400000).toISOString(),
      status: 'SCHEDULED',
      stage: 'PLAYOFF',
    },
    {
      fixtureId: `fix_${seasonId}_elim`,
      seasonId,
      matchNumber: 'Eliminator',
      homeTeamId: top3.teamId,
      homeTeamName: top3.teamName,
      awayTeamId: top4.teamId,
      awayTeamName: top4.teamName,
      venue: top3.homeVenue,
      startTime: new Date(now.getTime() + 172800000).toISOString(),
      status: 'SCHEDULED',
      stage: 'PLAYOFF',
    },
    {
      fixtureId: `fix_${seasonId}_q2`,
      seasonId,
      matchNumber: 'Qualifier 2',
      homeTeamId: 'TBD',
      homeTeamName: 'Loser Q1 / Winner Elim',
      awayTeamId: 'TBD',
      awayTeamName: 'TBD',
      venue: 'Neutral Venue',
      startTime: new Date(now.getTime() + 259200000).toISOString(),
      status: 'SCHEDULED',
      stage: 'PLAYOFF',
    },
    {
      fixtureId: `fix_${seasonId}_final`,
      seasonId,
      matchNumber: 'Final',
      homeTeamId: 'TBD',
      homeTeamName: 'Winner Q1',
      awayTeamId: 'TBD',
      awayTeamName: 'Winner Q2',
      venue: 'Narendra Modi Stadium, Ahmedabad',
      startTime: new Date(now.getTime() + 345600000).toISOString(),
      status: 'SCHEDULED',
      stage: 'FINAL',
    },
  ];
}
