import { normalizeTeamKey, getRosterForTeam } from '../data/cricketRosters';
import { isPlaceholderPlayerName } from './cricketPlayers';

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
  const cleanTeam = String(teamName || 'Team').replace(/\s+srl$/i, '').trim();

  const batters = roster?.batters?.length
    ? roster.batters
    : [`${cleanTeam} Opener 1`, `${cleanTeam} Opener 2`, `${cleanTeam} Batter 3`, `${cleanTeam} Batter 4`, `${cleanTeam} Batter 5`, `${cleanTeam} All-Rounder 1`, `${cleanTeam} All-Rounder 2`];

  const bowlers = roster?.bowlers?.length
    ? roster.bowlers
    : [`${cleanTeam} Pacer 1`, `${cleanTeam} Pacer 2`, `${cleanTeam} Spinner 1`, `${cleanTeam} Pacer 3`];

  const players = [
    { id: 1, name: batters[0] || `${cleanTeam} Opener 1`, role: 'Batter', isCaptain: true },
    { id: 2, name: batters[1] || `${cleanTeam} Opener 2`, role: 'Batter' },
    { id: 3, name: batters[2] || `${cleanTeam} Batter 3`, role: 'Batter', isKeeper: true },
    { id: 4, name: batters[3] || `${cleanTeam} Batter 4`, role: 'Batter' },
    { id: 5, name: batters[4] || `${cleanTeam} Batter 5`, role: 'Batter' },
    { id: 6, name: batters[5] || `${cleanTeam} All-Rounder 1`, role: 'All-Rounder' },
    { id: 7, name: batters[6] || `${cleanTeam} All-Rounder 2`, role: 'All-Rounder' },
    { id: 8, name: bowlers[0] || `${cleanTeam} Pacer 1`, role: 'Bowler' },
    { id: 9, name: bowlers[1] || `${cleanTeam} Pacer 2`, role: 'Bowler' },
    { id: 10, name: bowlers[2] || `${cleanTeam} Spinner 1`, role: 'Bowler' },
    { id: 11, name: bowlers[3] || `${cleanTeam} Pacer 3`, role: 'Bowler' },
  ];

  return { name: teamName, players };
}

function sanitizeSquadPlayers(squad, teamName) {
  const full = generateFullSquad(teamName);
  if (!squad?.players?.length) return full;

  const sanitizedPlayers = squad.players.map((p, idx) => {
    let name = p.name;
    if (isPlaceholderPlayerName(name)) {
      name = full.players[idx]?.name || `${teamName} Player ${idx + 1}`;
    }
    return { ...p, name };
  });
  return { ...squad, name: teamName, players: sanitizedPlayers };
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
      team1: sanitizeSquadPlayers(team1Squad, team1Name),
      team2: sanitizeSquadPlayers(team2Squad, team2Name),
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
