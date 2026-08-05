import { normalizeTeamKey } from '../data/cricketRosters';

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
  const short = (teamName || 'Team').replace(/\s+W$/i, '').trim();
  const prefix = short.split(' ')[0] || 'Player';

  const defaultPlayers = [
    { id: 1, name: `${prefix} Opener 1`, role: 'Batter', isCaptain: true },
    { id: 2, name: `${prefix} Opener 2`, role: 'Batter' },
    { id: 3, name: `${prefix} Keeper`, role: 'Batter', isKeeper: true },
    { id: 4, name: `${prefix} Batter 3`, role: 'Batter' },
    { id: 5, name: `${prefix} Batter 4`, role: 'Batter' },
    { id: 6, name: `${prefix} All-Rounder 1`, role: 'All-Rounder' },
    { id: 7, name: `${prefix} All-Rounder 2`, role: 'All-Rounder' },
    { id: 8, name: `${prefix} Spinner 1`, role: 'Bowler' },
    { id: 9, name: `${prefix} Pacer 1`, role: 'Bowler' },
    { id: 10, name: `${prefix} Pacer 2`, role: 'Bowler' },
    { id: 11, name: `${prefix} Pacer 3`, role: 'Bowler' },
  ];

  return { name: teamName, players: defaultPlayers };
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
