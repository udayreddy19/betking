/**
 * Canonical selection resolution — never guess identity from array position.
 */

import { teamNameMatches } from '../../src/utils/cricketScores.js';

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

export function canonicalTeamsFromSnapshot(snapshot = {}) {
  const t1 = snapshot.team1 || snapshot.homeTeam || {};
  const t2 = snapshot.team2 || snapshot.awayTeam || {};
  const homeName = typeof t1 === 'string' ? t1 : (t1.name || t1.shortName || '');
  const awayName = typeof t2 === 'string' ? t2 : (t2.name || t2.shortName || '');
  const homeShort = typeof t1 === 'object' ? (t1.shortName || t1.code || '') : '';
  const awayShort = typeof t2 === 'object' ? (t2.shortName || t2.code || '') : '';
  return {
    home: { name: homeName, shortName: homeShort, id: typeof t1 === 'object' ? t1.id : 'team1' },
    away: { name: awayName, shortName: awayShort, id: typeof t2 === 'object' ? t2.id : 'team2' },
  };
}

function selectionNameMatchesTeam(sel, team) {
  if (!team?.name && !team?.shortName) return false;
  const name = String(sel?.name || '');
  const id = String(sel?.selectionId || sel?.selection || '');
  if (teamNameMatches(name, team.name) || teamNameMatches(name, team.shortName)) return true;
  if (team.shortName && norm(id) === norm(team.shortName)) return true;
  if (team.name && norm(id) === norm(team.name)) return true;
  if (sel?.canonicalSide === 'HOME' && team?.id === 'team1') return true;
  if (sel?.canonicalSide === 'AWAY' && team?.id === 'team2') return true;
  return false;
}

function isDrawToken(token) {
  return token === 'x' || token === 'draw' || token === 'tie';
}

function isHomeToken(token) {
  return token === '1' || token === 'home' || token === 'h';
}

function isAwayToken(token) {
  return token === '2' || token === 'away' || token === 'a';
}

function isPositionalSideToken(token) {
  return isHomeToken(token) || isAwayToken(token) || isDrawToken(token);
}

/** Resolve 1/2/home/away/X using canonical team identity from the snapshot. */
export function resolveSideSelection(pool, wantedSel, teams) {
  const token = norm(wantedSel);
  if (isDrawToken(token)) {
    return pool.find((s) => /draw|tie|x/i.test(String(s.name || ''))
      || norm(s.selectionId) === 'x') || null;
  }
  if (isHomeToken(token)) {
    const byTeam = pool.filter((s) => selectionNameMatchesTeam(s, teams.home));
    if (byTeam.length === 1) return byTeam[0];
    const byId = pool.filter((s) => norm(s.selectionId) === '1' && selectionNameMatchesTeam(s, teams.home));
    if (byId.length === 1) return byId[0];
    return null;
  }
  if (isAwayToken(token)) {
    const byTeam = pool.filter((s) => selectionNameMatchesTeam(s, teams.away));
    if (byTeam.length === 1) return byTeam[0];
    const byId = pool.filter((s) => norm(s.selectionId) === '2' && selectionNameMatchesTeam(s, teams.away));
    if (byId.length === 1) return byId[0];
    return null;
  }
  return null;
}

/**
 * @returns {object|null} selection or null if unresolved
 */
export function resolveSelectionInPool(pool, wantedSel, opts = {}) {
  if (!pool?.length) return null;
  const wanted = String(wantedSel || '');
  const wantedNorm = norm(wanted);
  const selectionName = opts.selectionName || '';
  const teams = opts.teams || { home: {}, away: {} };

  let matches = pool.filter((s) => (
    String(s.selectionId) === wanted
    || String(s.selection) === wanted
    || String(s.name) === wanted
  ));
  if (matches.length === 1) return matches[0];

  if (selectionName) {
    const wantedName = norm(selectionName);
    matches = pool.filter((s) => norm(s.name) === wantedName);
    if (matches.length === 1) return matches[0];
    matches = pool.filter((s) => teamNameMatches(s.name, selectionName));
    if (matches.length === 1) return matches[0];
  }

  if (isPositionalSideToken(wantedNorm)) {
    return resolveSideSelection(pool, wantedNorm, teams);
  }

  if (wantedNorm && teams) {
    if (teamNameMatches(teams.home?.name, wanted) || teamNameMatches(teams.home?.shortName, wanted)) {
      return resolveSideSelection(pool, 'home', teams);
    }
    if (teamNameMatches(teams.away?.name, wanted) || teamNameMatches(teams.away?.shortName, wanted)) {
      return resolveSideSelection(pool, 'away', teams);
    }
  }

  if (wantedNorm) {
    matches = pool.filter((s) => teamNameMatches(s.name, wanted) || teamNameMatches(wanted, s.name));
    if (matches.length === 1) return matches[0];
  }

  return null;
}

export function createSelectionUnresolvedError(selectionId, marketId) {
  const err = new Error(
    `SELECTION_UNRESOLVED: Cannot map selection '${selectionId}' in market '${marketId}' to a canonical outcome`,
  );
  err.code = 'SELECTION_UNRESOLVED';
  return err;
}
