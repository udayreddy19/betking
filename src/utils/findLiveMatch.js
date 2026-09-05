import { matchIdsEqual, matchIdAliases } from '../../lib/matchIdPublic.mjs';
import { cricketScoreWeight, normalizeTeamNameForPair } from '../../lib/matchPairKey.mjs';

function collectMatchIds(match) {
  if (!match) return [];
  const ids = [
    match.id,
    match.matchId,
    match.cricbuzzMatchId != null ? `cb_${match.cricbuzzMatchId}` : null,
    match.cricbuzzMatchId,
    match.fancodeMatchId != null ? `fc_${match.fancodeMatchId}` : null,
    match.fancodeMatchId != null ? `fancode_${match.fancodeMatchId}` : null,
    match.espnEventId != null ? `espn_${match.espnEventId}` : null,
    match.espnEventId,
    match.tencricEventId != null ? `oy_${match.tencricEventId}` : null,
    match.tencricEventId != null ? `10cric_${match.tencricEventId}` : null,
    match.flashscoreEventId != null ? `fs_${match.flashscoreEventId}` : null,
    match.flashscoreEventId,
    match.crexEventId != null ? `crex_${match.crexEventId}` : null,
    match.crexEventId,
    match.guruMatchId != null ? `guru_${match.guruMatchId}` : null,
    match.guruMatchId,
    match.crixMatchId != null ? `crix_${match.crixMatchId}` : null,
    match.crixMatchId,
  ].filter(Boolean).map(String);

  const expanded = new Set();
  for (const id of ids) {
    for (const alias of matchIdAliases(id)) expanded.add(alias);
  }
  return [...expanded];
}

export function matchIdsReferToSame(match, targetId) {
  if (!match || !targetId) return false;
  const target = String(targetId);
  if (matchIdsEqual(match.id || match.matchId, target)) return true;
  return collectMatchIds(match).some((id) => matchIdsEqual(id, target));
}

function parseVsTeams(nameHint = '') {
  const raw = String(nameHint || '').trim();
  if (!raw) return null;
  const parts = raw.split(/\s+vs\.?\s+/i);
  if (parts.length !== 2) return null;
  const a = normalizeTeamNameForPair(parts[0]);
  const b = normalizeTeamNameForPair(parts[1]);
  if (!a || !b) return null;
  return [a, b];
}

export function matchMatchesNameHint(match, nameHint) {
  const teams = parseVsTeams(nameHint);
  if (!teams) return false;
  const t1 = normalizeTeamNameForPair(match?.team1?.name || match?.team1 || '');
  const t2 = normalizeTeamNameForPair(match?.team2?.name || match?.team2 || '');
  if (!t1 || !t2) return false;
  const [a, b] = teams;
  return (t1 === a && t2 === b) || (t1 === b && t2 === a);
}

/**
 * Resolve a live-feed match for a bet leg / deep-link.
 * Prefer exact/aliased ids, then "Team A vs Team B" name hints.
 */
function liveFeedRank(match) {
  let rank = 0;
  if (match?.isLive === true || match?.matchState === 'in' || match?.status === 'LIVE') rank += 100;
  rank += cricketScoreWeight(match);
  return rank;
}

/**
 * Resolve a live-feed match for a bet leg / deep-link.
 * Prefer exact/aliased ids, then "Team A vs Team B" name hints.
 * When both exist, keep the live scored listing — not a stale upcoming twin.
 */
export function findLiveMatch(matches, { matchId, matchName } = {}) {
  const list = matches || [];
  const byId = matchId ? list.filter((m) => matchIdsReferToSame(m, matchId)) : [];
  const byName = matchName ? list.filter((m) => matchMatchesNameHint(m, matchName)) : [];
  const seen = new Set();
  const candidates = [];
  for (const m of [...byId, ...byName]) {
    const id = m?.id || m?.matchId;
    const key = id || JSON.stringify([m?.team1?.name, m?.team2?.name]);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(m);
  }
  if (!candidates.length) return null;
  return candidates.sort((a, b) => liveFeedRank(b) - liveFeedRank(a))[0];
}
