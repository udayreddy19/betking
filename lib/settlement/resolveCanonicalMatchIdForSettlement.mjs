/**
 * Resolve bet.match_id → canonical fixture identity for settlement (aliases + reconciliation).
 */

import { matchIdAliases, matchIdsEqual, stripMatchIdPrefix } from '../matchIdPublic.mjs';
import { MatchReconciliationService } from '../providers/MatchReconciliationService.mjs';

/**
 * @param {object} bet — bet row with match_id
 * @param {Map|object} matchLookup — id → enriched match
 * @returns {{ canonicalMatchId: string, match: object|null, aliases: string[] }}
 */
export function resolveCanonicalMatchIdForSettlement(bet, matchLookup = null) {
  const raw = String(bet?.match_id || '').trim();
  if (!raw) return { canonicalMatchId: '', match: null, aliases: [] };

  const aliases = matchIdAliases(raw);
  const lookup = matchLookup instanceof Map
    ? (id) => matchLookup.get(String(id)) || null
    : (id) => (matchLookup && matchLookup[String(id)]) || null;

  for (const alias of aliases) {
    const hit = lookup(alias);
    if (hit) {
      const reconciled = MatchReconciliationService.reconcileMatch(hit, hit.source || hit.provider || 'LIVE');
      const canonicalMatchId = reconciled.canonicalMatchId || hit.canonicalMatchId || alias;
      return { canonicalMatchId, match: { ...hit, ...reconciled, canonicalMatchId }, aliases };
    }
  }

  // Bare id without live row — still return aliases for hydration
  const bare = stripMatchIdPrefix(raw);
  const canonicalMatchId = bare ? `m_${bare}` : raw;
  return { canonicalMatchId, match: null, aliases };
}

export function lookupMatchForSettlement(byId, liveById, matchId) {
  for (const alias of matchIdAliases(matchId)) {
    if (byId.has(alias)) return byId.get(alias);
    if (liveById.has(alias)) return liveById.get(alias);
  }
  return null;
}

export { matchIdsEqual, matchIdAliases };
