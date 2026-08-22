/**
 * CanonicalMatchState integration for settlement graders.
 * Settlement and OddsEngineV3 share buildCanonicalFromMatch as authoritative source.
 */

import { buildCanonicalFromMatch } from '../odds-v3/buildCanonicalFromMatch.mjs';
import { isCricketMatchCompleted } from '../../src/utils/cricketMatchComplete.js';

export function enrichMatchWithCanonicalState(match) {
  if (!match) return match;
  try {
    const canonical = buildCanonicalFromMatch(match);
    return {
      ...match,
      canonicalState: canonical,
      stateVersion: canonical?.stateVersion ?? match.stateVersion ?? null,
      canonicalMatchId: canonical?.matchId || match.id || match.matchId,
    };
  } catch {
    return match;
  }
}

export function getCanonicalStateVersion(match) {
  return match?.canonicalState?.stateVersion
    ?? match?.stateVersion
    ?? null;
}

export function isAuthoritativeMatchFinal(match) {
  if (!match) return false;
  if (isCricketMatchCompleted(match)) return true;
  const cs = match.canonicalState || buildCanonicalFromMatch(match);
  const status = String(cs?.matchStatus || cs?.status || '').toUpperCase();
  return ['COMPLETED', 'FINAL', 'FINISHED', 'ABANDONED', 'CANCELLED', 'NO_RESULT'].includes(status);
}

/** True when provider gives final result but no ball-by-ball (e.g. 10Cric-only). */
export function hasFinalResultWithoutBallFeed(match) {
  if (!isAuthoritativeMatchFinal(match)) return false;
  const history = match?.overHistory || match?.liveDetails?.overHistory || [];
  if (Array.isArray(history) && history.length > 0) return false;
  const src = String(match?.source || match?.provider || '').toLowerCase();
  const is10Cric = src.includes('10cric') || /^oy_|^10cric_/i.test(String(match?.id || ''));
  return is10Cric || history.length === 0;
}

export function detectProviderResultConflict(matches = []) {
  const byPair = new Map();
  for (const m of matches) {
    const key = m.canonicalMatchId || m.id || m.matchId;
    if (!key) continue;
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(m);
  }

  const conflicts = [];
  for (const [key, group] of byPair.entries()) {
    if (group.length < 2) continue;
    const finals = group.filter(isAuthoritativeMatchFinal);
    if (finals.length < 2) continue;
    const winners = new Set(finals.map((m) => {
      const cs = m.canonicalState || buildCanonicalFromMatch(m);
      return cs?.winnerSide || cs?.winnerId || null;
    }).filter(Boolean));
    if (winners.size > 1) {
      conflicts.push({ matchId: key, winners: [...winners] });
    }
  }
  return conflicts;
}
