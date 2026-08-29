/**
 * Robust Settlement Event Lookup Engine
 * 
 * Implements strict hierarchy:
 * 1. Exact stored provider event ID.
 * 2. Exact internal event record (Cache / DB).
 * 3. Provider direct event lookup by ID.
 * 4. Completed/historical fixture lookup.
 * 5. Authoritative settlement evidence.
 */

import { matchIdAliases, matchIdsEqual } from '../matchIdPublic.mjs';
import { getCachedCanonicalMatchState } from '../matchStateCache.mjs';
import { queryRead } from '../../db/pg.js';
import { fetchMatchDetail } from '../matchDetailFetcher.mjs';

export const LOOKUP_RESULT_CODES = {
  EVENT_FOUND_LIVE: 'EVENT_FOUND_LIVE',
  EVENT_FOUND_COMPLETED: 'EVENT_FOUND_COMPLETED',
  EVENT_FOUND_HISTORICAL: 'EVENT_FOUND_HISTORICAL',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_RATE_LIMITED: 'PROVIDER_RATE_LIMITED',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  EVENT_NOT_FOUND: 'EVENT_NOT_FOUND',
  EVENT_ID_MISMATCH: 'EVENT_ID_MISMATCH',
  STALE_CACHE: 'STALE_CACHE',
  PROVIDER_CONFLICT: 'PROVIDER_CONFLICT',
  UNKNOWN: 'UNKNOWN',
};

export const RETRYABLE_LOOKUP_CODES = new Set([
  LOOKUP_RESULT_CODES.PROVIDER_TIMEOUT,
  LOOKUP_RESULT_CODES.PROVIDER_RATE_LIMITED,
  LOOKUP_RESULT_CODES.PROVIDER_UNAVAILABLE,
  LOOKUP_RESULT_CODES.STALE_CACHE,
  LOOKUP_RESULT_CODES.UNKNOWN,
]);

/**
 * Perform multi-tier lookup for a bet's event
 * 
 * @param {object} params
 * @param {object} params.bet - Bet row
 * @param {Map} [params.liveById] - Map of live fixtures from aggregator
 * @param {Map} [params.byId] - Map of hydrated fixtures
 * @param {function} [params.matchLookup] - Fallback lookup function
 * @returns {Promise<{
 *   success: boolean,
 *   match: object|null,
 *   lookupSource: string,
 *   lookupResult: string,
 *   eventStatus: string,
 *   errorCode: string|null,
 *   errorMessage: string|null,
 *   retryable: boolean
 * }>}
 */
export async function lookupEventForSettlement({
  bet,
  liveById = null,
  byId = null,
  matchLookup = null,
}) {
  const betId = bet?.bet_id || bet?.id;
  const matchId = String(bet?.match_id || bet?.matchId || '').trim();
  const placementSnapshot = typeof bet?.placement_snapshot === 'string'
    ? (() => { try { return JSON.parse(bet.placement_snapshot); } catch { return null; } })()
    : bet?.placement_snapshot;
  
  const snapLeg = Array.isArray(placementSnapshot?.legs) ? placementSnapshot.legs[0] : null;
  const providerEventId = bet?.provider_event_id || snapLeg?.providerEventId || snapLeg?.scoreboardEventId || null;
  const expectedTeam1 = snapLeg?.team1Name || bet?.team1_name || null;
  const expectedTeam2 = snapLeg?.team2Name || bet?.team2_name || null;

  if (!matchId) {
    return {
      success: false,
      match: null,
      lookupSource: 'VALIDATION',
      lookupResult: LOOKUP_RESULT_CODES.EVENT_NOT_FOUND,
      eventStatus: 'UNKNOWN',
      errorCode: 'MISSING_MATCH_ID',
      errorMessage: 'Bet does not contain a valid match_id',
      retryable: false,
    };
  }

  const aliases = matchIdAliases(matchId);

  // Helper to test if match identity matches expected teams (prevents accidental misbinds)
  const validateMatchIdentity = (candidate) => {
    if (!candidate) return true;
    if (expectedTeam1 && expectedTeam2 && candidate.team1?.name && candidate.team2?.name) {
      const c1 = candidate.team1.name.toLowerCase();
      const c2 = candidate.team2.name.toLowerCase();
      const e1 = expectedTeam1.toLowerCase();
      const e2 = expectedTeam2.toLowerCase();
      const matchDirect = (c1.includes(e1) || e1.includes(c1)) && (c2.includes(e2) || e2.includes(c2));
      const matchReversed = (c1.includes(e2) || e2.includes(c1)) && (c2.includes(e1) || e1.includes(c2));
      if (!matchDirect && !matchReversed) {
        return false;
      }
    }
    return true;
  };

  // Tier 1: Aggregated Live Feed Cache
  if (liveById instanceof Map) {
    for (const alias of aliases) {
      if (liveById.has(alias)) {
        const liveMatch = liveById.get(alias);
        if (!validateMatchIdentity(liveMatch)) {
          return {
            success: false,
            match: null,
            lookupSource: 'LIVE_FEED_MAP',
            lookupResult: LOOKUP_RESULT_CODES.EVENT_ID_MISMATCH,
            eventStatus: liveMatch.status || 'LIVE',
            errorCode: 'IDENTITY_MISMATCH',
            errorMessage: `Match ID ${matchId} resolved to ${liveMatch.team1?.name} vs ${liveMatch.team2?.name}, expected ${expectedTeam1} vs ${expectedTeam2}`,
            retryable: false,
          };
        }
        return {
          success: true,
          match: liveMatch,
          lookupSource: 'LIVE_FEED_MAP',
          lookupResult: LOOKUP_RESULT_CODES.EVENT_FOUND_LIVE,
          eventStatus: liveMatch.status || 'LIVE',
          errorCode: null,
          errorMessage: null,
          retryable: false,
        };
      }
    }
  }

  // Tier 2: Already Hydrated In-Memory Map
  if (byId instanceof Map) {
    for (const alias of aliases) {
      if (byId.has(alias)) {
        const hydrated = byId.get(alias);
        if (validateMatchIdentity(hydrated)) {
          const isFinal = ['COMPLETED', 'FINISHED', 'FINAL', 'CLOSED'].includes(String(hydrated.status).toUpperCase())
            || String(hydrated.matchState).toLowerCase() === 'post';
          return {
            success: true,
            match: hydrated,
            lookupSource: 'HYDRATED_MEMORY_MAP',
            lookupResult: isFinal ? LOOKUP_RESULT_CODES.EVENT_FOUND_COMPLETED : LOOKUP_RESULT_CODES.EVENT_FOUND_LIVE,
            eventStatus: hydrated.status || (isFinal ? 'COMPLETED' : 'LIVE'),
            errorCode: null,
            errorMessage: null,
            retryable: false,
          };
        }
      }
    }
  }

  // Tier 3: Redis Canonical Match State Cache
  try {
    const cachedState = await getCachedCanonicalMatchState(matchId);
    if (cachedState && validateMatchIdentity(cachedState)) {
      const isFinal = ['COMPLETED', 'FINISHED', 'FINAL', 'CLOSED'].includes(String(cachedState.status).toUpperCase())
        || String(cachedState.matchState).toLowerCase() === 'post';
      return {
        success: true,
        match: cachedState,
        lookupSource: 'REDIS_CANONICAL_CACHE',
        lookupResult: isFinal ? LOOKUP_RESULT_CODES.EVENT_FOUND_COMPLETED : LOOKUP_RESULT_CODES.EVENT_FOUND_LIVE,
        eventStatus: cachedState.status || (isFinal ? 'COMPLETED' : 'LIVE'),
        errorCode: null,
        errorMessage: null,
        retryable: false,
      };
    }
  } catch (err) {
    // Non-fatal cache read error; fall through to DB/provider
  }

  // Tier 4: PostgreSQL `matches` Table & Persistent Reconstructor
  try {
    const { reconstructMatchFromDb } = await import('../eventPersistence.mjs');
    const dbMatch = await reconstructMatchFromDb(matchId);
    if (dbMatch && validateMatchIdentity(dbMatch)) {
      const isFinal = ['COMPLETED', 'FINISHED', 'FINAL', 'CLOSED', 'HISTORICAL', 'SETTLED'].includes(String(dbMatch.status).toUpperCase())
        || String(dbMatch.matchState).toLowerCase() === 'post' || dbMatch.isCompleted;
      return {
        success: true,
        match: dbMatch,
        lookupSource: 'POSTGRESQL_PERSISTENT_DB',
        lookupResult: isFinal ? LOOKUP_RESULT_CODES.EVENT_FOUND_COMPLETED : LOOKUP_RESULT_CODES.EVENT_FOUND_LIVE,
        eventStatus: dbMatch.status || (isFinal ? 'COMPLETED' : 'LIVE'),
        errorCode: null,
        errorMessage: null,
        retryable: false,
      };
    }
  } catch (err) {
    // Non-fatal DB read error
  }

  // Tier 5: Direct Provider Fetch via Exact Stored Provider ID or Match ID
  try {
    const detail = await fetchMatchDetail({
      id: matchId,
      matchId,
      sport: snapLeg?.sport || bet?.sport || 'cricket',
      scoreboardEventId: providerEventId,
      providerEventId,
    }, { fast: false });

    if (detail && (detail.team1?.name || detail.team2?.name || detail.matchName)) {
      if (!validateMatchIdentity(detail)) {
        return {
          success: false,
          match: null,
          lookupSource: 'PROVIDER_DIRECT_FETCH',
          lookupResult: LOOKUP_RESULT_CODES.EVENT_ID_MISMATCH,
          eventStatus: detail.status || 'UNKNOWN',
          errorCode: 'IDENTITY_MISMATCH',
          errorMessage: `Direct provider fetch for ${matchId} returned mismatching teams`,
          retryable: false,
        };
      }

      const isFinal = ['COMPLETED', 'FINISHED', 'FINAL', 'CLOSED'].includes(String(detail.status).toUpperCase())
        || String(detail.matchState).toLowerCase() === 'post';

      return {
        success: true,
        match: detail,
        lookupSource: 'PROVIDER_DIRECT_FETCH',
        lookupResult: isFinal ? LOOKUP_RESULT_CODES.EVENT_FOUND_COMPLETED : LOOKUP_RESULT_CODES.EVENT_FOUND_LIVE,
        eventStatus: detail.status || (isFinal ? 'COMPLETED' : 'LIVE'),
        errorCode: null,
        errorMessage: null,
        retryable: false,
      };
    }
  } catch (err) {
    const msg = String(err.message || '').toLowerCase();
    if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('econnaborted')) {
      return {
        success: false,
        match: null,
        lookupSource: 'PROVIDER_DIRECT_FETCH',
        lookupResult: LOOKUP_RESULT_CODES.PROVIDER_TIMEOUT,
        eventStatus: 'UNKNOWN',
        errorCode: 'PROVIDER_TIMEOUT',
        errorMessage: err.message,
        retryable: true,
      };
    }
    if (msg.includes('429') || msg.includes('rate limit')) {
      return {
        success: false,
        match: null,
        lookupSource: 'PROVIDER_DIRECT_FETCH',
        lookupResult: LOOKUP_RESULT_CODES.PROVIDER_RATE_LIMITED,
        eventStatus: 'UNKNOWN',
        errorCode: 'PROVIDER_RATE_LIMITED',
        errorMessage: err.message,
        retryable: true,
      };
    }
    return {
      success: false,
      match: null,
      lookupSource: 'PROVIDER_DIRECT_FETCH',
      lookupResult: LOOKUP_RESULT_CODES.PROVIDER_UNAVAILABLE,
      eventStatus: 'UNKNOWN',
      errorCode: 'PROVIDER_UNAVAILABLE',
      errorMessage: err.message,
      retryable: true,
    };
  }

  // Tier 6: Event not found anywhere across active, cached, database, or provider APIs
  return {
    success: false,
    match: null,
    lookupSource: 'ALL_SOURCES_EXHAUSTED',
    lookupResult: LOOKUP_RESULT_CODES.EVENT_NOT_FOUND,
    eventStatus: 'UNKNOWN',
    errorCode: 'EVENT_NOT_FOUND',
    errorMessage: `Event ${matchId} could not be resolved from live, cache, database, or direct provider endpoints`,
    retryable: true, // Keep retryable so temporary provider dropouts do not permanently freeze the bet
  };
}

/**
 * Structured logger for settlement event lookup (Part 11)
 */
export function logSettlementEventLookup({
  betId,
  eventId,
  providerEventId = null,
  provider = 'canonical',
  lookupSource,
  lookupResult,
  eventStatus = 'UNKNOWN',
  settlementAttempt = 1,
  retryCount = 0,
  errorCode = null,
  errorMessage = null,
}) {
  const logPayload = {
    event: 'SETTLEMENT_EVENT_LOOKUP',
    ts: new Date().toISOString(),
    betId,
    eventId,
    providerEventId,
    provider,
    lookupSource,
    lookupResult,
    eventStatus,
    settlementAttempt,
    retryCount,
    errorCode,
    errorMessage,
  };
  console.log(JSON.stringify(logPayload));
  return logPayload;
}
