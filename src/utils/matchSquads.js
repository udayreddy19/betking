import { normalizeTeamKey, getRosterForTeam } from '../data/cricketRosters';

function teamsMatch(teamA, teamB) {
  if (!teamA || !teamB) return false;
  const a = normalizeTeamKey(teamA);
  const b = normalizeTeamKey(teamB);
  if (a === b) return true;
  if (a.length >= 4 && b.includes(a.slice(0, 4))) return true;
  if (b.length >= 4 && a.includes(b.slice(0, 4))) return true;
  return a.split(' ')[0] === b.split(' ')[0];
}

function generateFullSquad(teamName) {
  const roster = getRosterForTeam(teamName);
  const batters = roster?.batters || ['Player 1', 'Player 2'];
  const bowlers = roster?.bowlers || ['Bowler 1', 'Bowler 2'];

  const players = [
    { id: 1, name: batters[0] || 'Opener 1', role: 'Batter', isCaptain: true },
    { id: 2, name: batters[1] || 'Opener 2', role: 'Batter' },
    { id: 3, name: batters[2] || 'Keeper', role: 'Batter', isKeeper: true },
    { id: 4, name: batters[3] || 'Middle Order 1', role: 'Batter' },
    { id: 5, name: batters[4] || 'Middle Order 2', role: 'Batter' },
    { id: 6, name: batters[5] || 'All-Rounder 1', role: 'All-Rounder' },
    { id: 7, name: batters[6] || 'All-Rounder 2', role: 'All-Rounder' },
    { id: 8, name: bowlers[0] || 'Spinner 1', role: 'Bowler' },
    { id: 9, name: bowlers[1] || 'Pacer 1', role: 'Bowler' },
    { id: 10, name: bowlers[2] || 'Pacer 2', role: 'Bowler' },
    { id: 11, name: bowlers[3] || 'Pacer 3', role: 'Bowler' },
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
      team1: (team1Squad?.players?.length ? team1Squad : generateFullSquad(team1Name)),
      team2: (team2Squad?.players?.length ? team2Squad : generateFullSquad(team2Name)),
      fromApi: true,
    };
  }

  return {
    team1: generateFullSquad(team1Name),
    team2: generateFullSquad(team2Name),
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

export function squadToRoster(squad, opponentSquad) {
  const batters = (squad?.players || [])
    .filter((p) => p.role !== 'Bowler' && !String(p.role || '').toLowerCase().includes('bowl'))
    .map((p) => p.name)
    .filter(Boolean);
  const bowlers = (opponentSquad?.players || [])
    .filter((p) => p.role === 'Bowler' || String(p.role || '').toLowerCase().includes('bowl'))
    .map((p) => p.name)
    .filter(Boolean);
  return { batters, bowlers };
}
