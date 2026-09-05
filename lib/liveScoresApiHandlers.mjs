import { aggregateLiveScores, getCachedAggregatedLiveScores } from './aggregator.mjs';
import { fetchMatchDetail } from './matchDetailFetcher.mjs';
import { LIVE_SCORES_POLL_MS } from './livePolling.mjs';
import { isCricketSport } from './odds-v3/otherSportsOdds.mjs';
import { getIplSrlMatchById, getIplSrlMatches } from './iplSrlSimulator.mjs';
import { applyLiveOddsOverlay, matchOddsStateKey } from './matchOddsStateKey.mjs';
import { matchIdAliases, matchIdsEqual } from './matchIdPublic.mjs';
import { isMatchSRL } from './cricketSnapshot.mjs';
import { SRL_MARGIN_CONFIG } from './odds-v3/pricing/MarginCalculator.mjs';
import { generatePublicMatchOddsSnapshot } from './odds-v4/engineDispatch.mjs';

function flag(value) {
  return value === '1' || value === 'true';
}

const matchOddsCache = new Map();
const matchOddsInFlight = new Map();
const MATCH_ODDS_TTL_MS = 2_000;

export function clearMatchOddsCache() {
  matchOddsCache.clear();
  matchOddsInFlight.clear();
}

function findMatchInList(matches, matchId) {
  if (!matchId || !Array.isArray(matches)) return null;
  const aliases = new Set(matchIdAliases(matchId));
  return matches.find((m) => {
    const id = String(m.id || m.matchId || '');
    return aliases.has(id) || matchIdsEqual(id, matchId);
  }) || null;
}

function resolveMatchObject(matchId) {
  const fromCache = findMatchInList(getCachedAggregatedLiveScores()?.matches, matchId);
  if (fromCache) return fromCache;

  if (String(matchId).startsWith('srl_') || String(matchId).includes('srl')) {
    const srl = findMatchInList(getIplSrlMatches() || [], matchId)
      || getIplSrlMatchById(matchId);
    if (srl) return srl;
  }

  return null;
}

export function matchFromQuery(get) {
  const isLive = flag(get('isLive'));
  return {
    id: get('matchId') || get('id'),
    sport: get('sport') || 'cricket',
    source: get('source') || '',
    league: get('league') || '',
    isLive: isLive || undefined,
    matchState: get('matchState') || (isLive ? 'in' : undefined),
    cricbuzzMatchId: get('cricbuzzMatchId') ? Number(get('cricbuzzMatchId')) : undefined,
    espnEventId: get('espnEventId') || undefined,
    espnPath: get('espnPath') || undefined,
    fancodeMatchId: get('fancodeMatchId') || undefined,
    team1: { name: get('team1') || '' },
    team2: { name: get('team2') || '' },
  };
}

export async function buildLiveScoresPayload({ force = false } = {}) {
  const payload = await aggregateLiveScores({ force });
  return { ...payload, pollIntervalMs: LIVE_SCORES_POLL_MS };
}

export async function buildMatchDetailPayload(get, { fast = false } = {}) {
  const match = matchFromQuery(get);
  if (!match.id) {
    const err = new Error('matchId query param required');
    err.statusCode = 400;
    throw err;
  }
  return fetchMatchDetail(match, { fast });
}

/**
 * Fast authoritative odds snapshot.
 * Uses the warm live-scores aggregator cache — does NOT wait on match-detail scrapes.
 */
export async function buildMatchOddsPayload({
  matchId,
  team1,
  team2,
  force = false,
  stateKey = '',
  overlay = {},
} = {}) {
  if (!matchId) {
    const err = new Error('matchId required');
    err.statusCode = 400;
    throw err;
  }

  const flightKey = `${matchId}|${stateKey || matchOddsStateKey({ liveDetails: overlay })}`;
  if (!force && matchOddsInFlight.has(flightKey)) {
    return matchOddsInFlight.get(flightKey);
  }

  const run = (async () => {
    let matchObj = resolveMatchObject(matchId);

    if (!matchObj) {
      const aggregated = await aggregateLiveScores({ force: false });
      matchObj = findMatchInList(aggregated?.matches, matchId);
    }

    if (!matchObj) {
      const { getCachedCanonicalMatchState } = await import('./matchStateCache.mjs');
      matchObj = await getCachedCanonicalMatchState(matchId).catch(() => null);
    }

    if (!matchObj) {
      const { reconstructMatchFromDb } = await import('./eventPersistence.mjs');
      matchObj = await reconstructMatchFromDb(matchId).catch(() => null);
    }

    if (!matchObj) {
      const err = new Error('Match not found or not available');
      err.statusCode = 404;
      err.code = 'NOT_AVAILABLE';
      throw err;
    }

    const isNonLive = Boolean(
      matchObj.isCompleted
      || matchObj.matchState === 'post'
      || ['COMPLETED', 'FINISHED', 'FINAL', 'CLOSED', 'HISTORICAL'].includes(String(matchObj.status).toUpperCase())
      || (matchObj.isLive === false && matchObj.matchState !== 'in')
    );

    if (isNonLive) {
      return {
        success: true,
        status: 'NO_LONGER_LIVE',
        isLive: false,
        eventStatus: matchObj.status === 'HISTORICAL' ? 'HISTORICAL' : 'COMPLETED',
        match: matchObj,
        markets: [],
        message: 'Live odds are closed for this fixture',
        cached: false,
      };
    }

    if (team1 && matchObj.team1) {
      matchObj = {
        ...matchObj,
        team1: { ...(typeof matchObj.team1 === 'object' ? matchObj.team1 : {}), name: String(team1) },
      };
    }
    if (team2 && matchObj.team2) {
      matchObj = {
        ...matchObj,
        team2: { ...(typeof matchObj.team2 === 'object' ? matchObj.team2 : {}), name: String(team2) },
      };
    }

    matchObj = applyLiveOddsOverlay(matchObj, overlay);
    const liveKey = `${matchId}|${matchOddsStateKey(matchObj)}`;

    if (!force) {
      const cached = matchOddsCache.get(liveKey);
      if (cached && (Date.now() - cached.at < MATCH_ODDS_TTL_MS)) {
        return cached.data;
      }
    }

    // Attach ball-by-ball after cache miss so we don't hit Cricbuzz on every poll.
    if (isCricketSport(matchObj.sport) && (matchObj.isLive || matchObj.matchState === 'in')) {
      try {
        const { enrichMatchWithBallFeed, matchHasBallFeed } = await import('./cricbuzzBallFeed.mjs');
        if (!matchHasBallFeed(matchObj)) {
          matchObj = await enrichMatchWithBallFeed(matchObj);
        }
      } catch {
        // Scorecard-only feeds stay without delivery markets.
      }
    }

    const v3Config = {
      debug: false,
      ...(isMatchSRL(matchObj) ? { margins: { ...SRL_MARGIN_CONFIG } } : {}),
    };
    const { publicSnapshot } = generatePublicMatchOddsSnapshot(matchObj, v3Config);
    try {
      const { marketSuspensionEngine } = await import('./marketSuspensionEngine.mjs');
      const matchCauses = await marketSuspensionEngine.getActiveCauses(`match:${matchId}`);
      if (matchCauses.length) {
        publicSnapshot.status = 'SUSPENDED';
        publicSnapshot.markets = [];
        publicSnapshot.message = 'Trading halted';
      } else {
        let srlControls = {};
        try {
          if (isMatchSRL(matchObj)) {
            const { getSrlMarketControls } = await import('./iplSrlOperatorState.mjs');
            srlControls = getSrlMarketControls(matchId) || {};
          }
        } catch {
          srlControls = {};
        }
        const overlayed = [];
        for (const market of publicSnapshot.markets || []) {
          const causes = await marketSuspensionEngine.getActiveCauses(market.marketId);
          const control = srlControls[market.marketId];
          const controlStatus = String(control?.status || '').toUpperCase();
          if (controlStatus === 'DECLARED' || controlStatus === 'VOIDED') {
            const winning = control?.winningSelectionId || null;
            overlayed.push({
              ...market,
              status: controlStatus === 'VOIDED' ? 'VOID' : 'DETERMINED',
              selections: (market.selections || []).map((s) => ({
                ...s,
                odds: null,
                bettable: false,
                status: controlStatus === 'VOIDED'
                  ? 'VOID'
                  : (winning && String(s.selectionId || s.selection) === String(winning) ? 'WON' : 'LOST'),
                won: !!(winning && String(s.selectionId || s.selection) === String(winning)),
              })),
              options: (market.options || market.selections || []).map((s) => ({
                ...s,
                odds: null,
                bettable: false,
                status: controlStatus === 'VOIDED' ? 'VOID' : 'DETERMINED',
              })),
            });
            continue;
          }
          if (causes.length || controlStatus === 'SUSPENDED') {
            overlayed.push({
              ...market,
              status: 'SUSPENDED',
              selections: (market.selections || []).map((s) => ({ ...s, odds: null, bettable: false, status: 'SUSPENDED' })),
              options: (market.options || market.selections || []).map((s) => ({ ...s, odds: null, bettable: false, status: 'SUSPENDED' })),
            });
            continue;
          }
          overlayed.push(market);
        }
        // Keep suspended/determined visible as locked lines; hide only fully empty.
        publicSnapshot.markets = overlayed.filter((m) => m.status === 'OPEN'
          || m.status === 'SUSPENDED'
          || m.status === 'DETERMINED'
          || m.status === 'VOID');
      }
    } catch {
      // Suspension overlay is best-effort
    }
    const payload = {
      success: true,
      ...publicSnapshot,
      cached: false,
    };

    matchOddsCache.set(liveKey, { at: Date.now(), data: { ...payload, cached: true } });
    try {
      const { broadcastOddsSnapshot } = await import('./websocketEngine.mjs');
      broadcastOddsSnapshot(matchId, payload);
    } catch {
      // WS is optional in vite-plugin / test environments
    }
    return payload;
  })();

  matchOddsInFlight.set(flightKey, run);
  try {
    return await run;
  } finally {
    matchOddsInFlight.delete(flightKey);
  }
}
