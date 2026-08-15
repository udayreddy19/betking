import { normalizeTeamKey } from '../data/cricketRosters';
import { isPlaceholderPlayerName } from './cricketPlayers';

function teamsMatch(teamA, teamB) {
  if (!teamA || !teamB) return false;
  const a = normalizeTeamKey(teamA).replace(/\s+/g, '');
  const b = normalizeTeamKey(teamB).replace(/\s+/g, '');
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 6 && b.length >= 6 && (b.includes(a) || a.includes(b))) return true;
  return false;
}

function squadsFromScorecard(match, team1Name, team2Name) {
  const innings = match?.scorecardInnings;
  if (!Array.isArray(innings) || !innings.length) return null;

  const playersFor = (teamName) => {
    const map = new Map();
    for (const inn of innings) {
      const batting = teamsMatch(inn.batTeamName, teamName);
      const rows = batting ? (inn.batters || []) : (inn.bowlers || []);
      for (const p of rows) {
        if (!p?.name || isPlaceholderPlayerName(p.name)) continue;
        const prev = map.get(p.name.toLowerCase()) || {};
        map.set(p.name.toLowerCase(), { ...prev, ...p, name: p.name });
      }
    }
    return [...map.values()];
  };

  const team1Players = playersFor(team1Name);
  const team2Players = playersFor(team2Name);
  if (!team1Players.length && !team2Players.length) return null;

  return {
    team1: { name: team1Name, players: team1Players },
    team2: { name: team2Name, players: team2Players },
    fromApi: true,
  };
}

/** Map API squads to home/away team names on the match card. */
export function resolveMatchSquads(match, team1Name, team2Name) {
  const squads = match?.squads;
  if (Array.isArray(squads) && squads.length > 0) {
    let team1Squad = squads.find((s) => teamsMatch(s.name, team1Name));
    let team2Squad = squads.find((s) => teamsMatch(s.name, team2Name) && s !== team1Squad);

    if (!team1Squad && squads[0]) team1Squad = squads[0];
    if (!team2Squad && squads[1]) team2Squad = squads[1];

    const resolved = {
      team1: sanitizeSquadPlayers(team1Squad, team1Name),
      team2: sanitizeSquadPlayers(team2Squad, team2Name),
      fromApi: true,
    };
    if (resolved.team1.players.length || resolved.team2.players.length) return resolved;
  }

  return squadsFromScorecard(match, team1Name, team2Name) || {
    team1: emptySquad(team1Name),
    team2: emptySquad(team2Name),
    fromApi: false,
  };
}

function emptySquad(teamName) {
  return { name: teamName, players: [] };
}

function sanitizeSquadPlayers(squad, teamName) {
  if (!squad?.players?.length) return emptySquad(teamName);
  const sanitizedPlayers = squad.players
    .filter((p) => p?.name && !isPlaceholderPlayerName(p.name))
    .map((p) => ({ ...p, name: p.name }));
  return { ...squad, name: teamName, players: sanitizedPlayers };
}

export function getScorecardInningsForTeam(match, teamName, preferShortName = '') {
  const innings = match?.scorecardInnings;
  if (!Array.isArray(innings) || !innings.length) return null;

  const matchInnings = innings.filter(
    (inn) => teamsMatch(inn.batTeamName, teamName)
      || (preferShortName && inn.batTeamShortName === preferShortName),
  );

  if (!matchInnings.length) return null;

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
