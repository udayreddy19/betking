import { getRosterForTeam, normalizeTeamKey } from '../data/cricketRosters';

function teamsMatch(teamA, teamB) {
  if (!teamA || !teamB) return false;
  const a = normalizeTeamKey(teamA);
  const b = normalizeTeamKey(teamB);
  if (a === b) return true;
  if (a.length >= 4 && b.includes(a.slice(0, 4))) return true;
  if (b.length >= 4 && a.includes(b.slice(0, 4))) return true;
  return a.split(' ')[0] === b.split(' ')[0];
}

function rosterToSquad(teamName) {
  const roster = getRosterForTeam(teamName);
  const players = [
    ...roster.batters.map((name) => ({ name, role: 'Batter' })),
    ...roster.bowlers.map((name) => ({ name, role: 'Bowler' })),
  ];
  return { name: teamName, players };
}

/** Map API squads to home/away team names on the match card. */
export function resolveMatchSquads(match, team1Name, team2Name) {
  const squads = match?.squads;
  if (Array.isArray(squads) && squads.length > 0) {
    let team1Squad = squads.find((s) => teamsMatch(s.name, team1Name));
    let team2Squad = squads.find((s) => teamsMatch(s.name, team2Name) && s !== team1Squad);

    if (!team1Squad && squads[0]) team1Squad = squads[0];
    if (!team2Squad && squads[1]) team2Squad = squads[1];

    return {
      team1: team1Squad || rosterToSquad(team1Name),
      team2: team2Squad || rosterToSquad(team2Name),
      fromApi: true,
    };
  }

  return {
    team1: rosterToSquad(team1Name),
    team2: rosterToSquad(team2Name),
    fromApi: false,
  };
}

export function getScorecardInningsForTeam(match, teamName, preferShortName = '') {
  const innings = match?.scorecardInnings;
  if (!Array.isArray(innings) || !innings.length) return null;

  const matchInnings = innings.filter(
    (inn) => teamsMatch(inn.batTeamName, teamName)
      || (preferShortName && inn.batTeamShortName === preferShortName),
  );

  if (!matchInnings.length) return null;

  // Prefer latest innings for this team (e.g. 2nd innings in tests)
  return matchInnings[matchInnings.length - 1];
}

export function formatPlayerRole(player) {
  if (player.isCaptain && player.isKeeper) return 'C & WK';
  if (player.isCaptain) return 'Captain';
  if (player.isKeeper) return 'WK';
  return player.role || 'Player';
}
