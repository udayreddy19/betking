import { normalizeTeamKey, getRosterForTeam, isWomensOrVirtualSide } from '../data/cricketRosters';
import { isPlaceholderPlayerName } from './cricketPlayers';

function genderToken(name) {
  const s = String(name || '');
  if (/\b(women'?s?|wmn)\b/i.test(s) || /\(\s*w\s*\)/i.test(s)) return 'W';
  if (/\b(men'?s?)\b/i.test(s) || /\(\s*m\s*\)/i.test(s)) return 'M';
  return '';
}

/** Strip gender / virtual markers so "England" can match scorecard "England Women". */
function baseTeamKey(name) {
  return normalizeTeamKey(name)
    .replace(/\b(women'?s?|wmn|men'?s?)\b/gi, ' ')
    .replace(/\(\s*[wmv]\s*\)/gi, ' ')
    .replace(/\bvirtual\b/gi, ' ')
    .replace(/\s+/g, '')
    .trim();
}

/**
 * Match team labels across feed variants.
 * Allows England ↔ England Women (admin bet titles often drop "Women"),
 * but never Women's ↔ Men's when both genders are explicit,
 * and never fuzzy-matches women franchises onto men's club names (Gujarat Women ↛ Gujarat Titans).
 */
export function teamsMatch(teamA, teamB) {
  if (!teamA || !teamB) return false;
  const ga = genderToken(teamA);
  const gb = genderToken(teamB);
  if (ga && gb && ga !== gb) return false;

  const a = normalizeTeamKey(teamA).replace(/\s+/g, '');
  const b = normalizeTeamKey(teamB).replace(/\s+/g, '');
  if (!a || !b) return false;
  if (a === b) return true;

  const womenA = isWomensOrVirtualSide(teamA);
  const womenB = isWomensOrVirtualSide(teamB);

  // Same gender class — allow fuzzy includes (ENG Women ≈ England Women)
  if (womenA === womenB) {
    if (a.length >= 6 && b.length >= 6 && (b.includes(a) || a.includes(b))) return true;
    return false;
  }

  // One side unmarked (e.g. bet title "England") vs feed "England Women":
  // exact base-key only — no fuzzy includes (avoids Gujarat Women → Gujarat Titans).
  const sa = baseTeamKey(teamA);
  const sb = baseTeamKey(teamB);
  return !!(sa && sb && sa === sb);
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

/** Last-resort XI from live crease when feeds omit squads/scorecard. */
function squadsFromLiveDetails(match, team1Name, team2Name) {
  const ld = match?.liveDetails || {};
  const map = new Map();
  const push = (p, role) => {
    if (!p?.name || isPlaceholderPlayerName(p.name)) return;
    const key = p.name.toLowerCase();
    const prev = map.get(key) || {};
    map.set(key, { ...prev, ...p, name: p.name, role: prev.role || role || p.role || 'Player' });
  };
  push(ld.batter1, 'Batter');
  push(ld.batter2, 'Batter');
  push(ld.bowler, 'Bowler');
  for (const p of ld.battingOrder || ld.batters || []) push(p, 'Batter');
  for (const p of ld.bowlingOrder || ld.bowlers || []) push(p, 'Bowler');

  const players = [...map.values()];
  if (!players.length) return null;

  const batName = ld.chaseTeamName || ld.firstTeamName || ld.battingTeam || null;
  const battingIsTeam1 = batName ? teamsMatch(batName, team1Name) : true;
  const batters = players.filter((p) => !/bowl/i.test(String(p.role || '')));
  const bowlers = players.filter((p) => /bowl/i.test(String(p.role || '')));

  return {
    team1: {
      name: team1Name,
      players: battingIsTeam1 ? batters : bowlers,
    },
    team2: {
      name: team2Name,
      players: battingIsTeam1 ? bowlers : batters,
    },
    fromApi: true,
    partial: true,
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

  const fromScorecard = squadsFromScorecard(match, team1Name, team2Name);
  if (fromScorecard && (fromScorecard.team1.players.length || fromScorecard.team2.players.length)) {
    return fromScorecard;
  }

  const fromLive = squadsFromLiveDetails(match, team1Name, team2Name);
  if (fromLive && (fromLive.team1.players.length || fromLive.team2.players.length)) {
    return fromLive;
  }

  // Fallback to rich roster dataset lookup
  const t1Label = typeof team1Name === 'object' && team1Name ? (team1Name.name || 'Team 1') : String(team1Name || 'Team 1');
  const t2Label = typeof team2Name === 'object' && team2Name ? (team2Name.name || 'Team 2') : String(team2Name || 'Team 2');
  const r1 = getRosterForTeam(t1Label) || { batters: [], bowlers: [] };
  const r2 = getRosterForTeam(t2Label) || { batters: [], bowlers: [] };

  const t1Players = [
    ...((r1?.batters) || []).map((name, i) => ({ name: String(name), role: i < 2 ? 'Opening Batter' : (i === 4 ? 'All-Rounder' : 'Batter'), isCaptain: i === 0 })),
    ...((r1?.bowlers) || []).map((name) => ({ name: String(name), role: 'Bowler' })),
  ];
  const t2Players = [
    ...((r2?.batters) || []).map((name, i) => ({ name: String(name), role: i < 2 ? 'Opening Batter' : (i === 4 ? 'All-Rounder' : 'Batter'), isCaptain: i === 0 })),
    ...((r2?.bowlers) || []).map((name) => ({ name: String(name), role: 'Bowler' })),
  ];

  return {
    team1: { name: t1Label, players: t1Players },
    team2: { name: t2Label, players: t2Players },
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
