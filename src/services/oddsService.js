/**
 * Frontend Authoritative Odds Service (src/services/oddsService.js)
 * Connects React UI components to backend OddsEngineV3 API endpoints.
 * NO fallback to local hardcoded markets / invented prices.
 */

import { liveOddsOverlayFromMatch, matchOddsStateKey } from '../../lib/matchOddsStateKey.mjs';

const oddsCacheMap = new Map();
const oddsInFlight = new Map();
const CLIENT_CACHE_TTL_MS = 3_000;

function cacheRecord(matchId) {
  return oddsCacheMap.get(matchId) || null;
}

export function getCachedMatchOdds(matchId, stateKey = '') {
  if (!matchId) return null;
  const cached = cacheRecord(matchId);
  if (!cached) return null;
  if (stateKey && cached.stateKey && cached.stateKey !== stateKey) return null;
  if (Date.now() - cached.timestamp >= CLIENT_CACHE_TTL_MS) return null;
  return cached.data;
}

export { matchOddsStateKey };

/**
 * Instant UI seed from list-card odds already on the match object.
 * Prefer engineCardMarkets (SRL card book) so Totals/Toss appear before the full snapshot.
 * Only used when a full snapshot is not cached yet — never invents prices.
 */
function adaptProvisionalMarket(market) {
  if (!market?.marketId) return null;
  const selections = (market.selections || market.options || [])
    .filter((s) => Number(s?.odds) >= 1.01)
    .map((s) => ({
      ...s,
      selectionId: s.selectionId || s.selection,
      selection: s.selection || s.selectionId,
      status: s.status || 'ACTIVE',
      bettable: s.bettable !== false,
    }));
  if (selections.length < 2) return null;
  const rawCat = String(market.category || '').toLowerCase();
  const category = rawCat === 'match' || rawCat === 'main' || market.marketId === 'match_winner'
    ? 'main'
    : (rawCat === 'overs' ? 'over'
      : (rawCat === 'deliveries' ? 'delivery'
        : (rawCat === 'player_props' || rawCat === 'h2h' ? 'props'
          : (rawCat || (market.marketId === 'match_total' || market.marketId === 'team_total' ? 'totals' : 'main')))));
  return {
    marketId: market.marketId,
    key: market.marketId === 'match_winner' ? 'winner' : market.marketId,
    marketType: market.marketType,
    name: market.name || market.title || market.marketId,
    title: market.title || market.name || market.marketId,
    category,
    categoryGroup: category,
    status: market.status || 'OPEN',
    line: market.line,
    selections,
    options: selections,
    provisional: true,
  };
}

export function provisionalWinnerMarketsFromMatch(match) {
  if (!match) return [];

  const cardOpen = (Array.isArray(match.engineCardMarkets) ? match.engineCardMarkets : [])
    .filter((m) => String(m?.status || 'OPEN').toUpperCase() === 'OPEN')
    .map(adaptProvisionalMarket)
    .filter(Boolean);
  if (cardOpen.length > 0) return cardOpen;

  const t1Odds = Number(match.odds?.team1 ?? match.odds?.home);
  const t2Odds = Number(match.odds?.team2 ?? match.odds?.away);
  if (!(t1Odds > 1 && t2Odds > 1)) return [];

  const team1Name = match.team1?.name || match.team1 || 'Team 1';
  const team2Name = match.team2?.name || match.team2 || 'Team 2';
  const drawOdds = Number(match.odds?.draw);
  const selections = [
    {
      selectionId: '1',
      selection: '1',
      name: team1Name,
      odds: t1Odds,
      status: 'ACTIVE',
      bettable: true,
    },
    ...(drawOdds > 1 ? [{
      selectionId: 'X',
      selection: 'X',
      name: 'Draw',
      odds: drawOdds,
      status: 'ACTIVE',
      bettable: true,
    }] : []),
    {
      selectionId: '2',
      selection: '2',
      name: team2Name,
      odds: t2Odds,
      status: 'ACTIVE',
      bettable: true,
    },
  ];

  return [{
    marketId: 'match_winner',
    key: 'winner',
    marketType: 'MATCH_WINNER',
    name: 'Match Winner',
    title: 'Match Winner',
    category: 'main',
    categoryGroup: 'main',
    status: 'OPEN',
    selections,
    options: selections,
    provisional: true,
  }];
}

/** @deprecated alias — use provisionalWinnerMarketsFromMatch (now may include card totals/toss). */
export const provisionalMarketsFromMatch = provisionalWinnerMarketsFromMatch;

export async function fetchAuthoritativeMatchOdds(matchId, team1Name, team2Name, options = {}) {
  if (!matchId) return null;
  const match = options.match || null;
  const stateKey = options.stateKey || matchOddsStateKey(match);
  const overlay = options.overlay || (match ? liveOddsOverlayFromMatch(match) : {});
  const force = options.force === true;
  const flightKey = `${matchId}|${stateKey}`;

  if (!force) {
    const cached = getCachedMatchOdds(matchId, stateKey);
    if (cached) return cached;
  }

  if (oddsInFlight.has(flightKey)) {
    return oddsInFlight.get(flightKey);
  }

  const request = (async () => {
    try {
      let url = `/api/public/sports/matches/${encodeURIComponent(matchId)}/odds`;
      const params = new URLSearchParams();
      if (team1Name && typeof team1Name === 'string' && !team1Name.includes('undefined')) {
        params.append('team1', team1Name);
      }
      if (team2Name && typeof team2Name === 'string' && !team2Name.includes('undefined')) {
        params.append('team2', team2Name);
      }
      if (stateKey) params.append('stateKey', stateKey);
      if (force) params.append('refresh', '1');
      for (const [key, value] of Object.entries(overlay)) {
        if (value != null && value !== '') params.append(key, String(value));
      }
      const qStr = params.toString();
      if (qStr) url += `?${qStr}`;

      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });
      if (res.status === 429) {
        // Don't poison cache with rate-limit failures — keep provisional / prior book.
        throw new Error('HTTP 429');
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data && (data.success || data.status === 'OK' || Array.isArray(data.markets))) {
        // Never cache empty closed books under a live stateKey — causes sticky Match Winner.
        const markets = Array.isArray(data.markets) ? data.markets : [];
        const status = String(data.status || '').toUpperCase();
        const emptyClosed = markets.length === 0 && (
          status === 'NO_LONGER_LIVE' || status === 'SUSPENDED' || status === 'NOT_AVAILABLE'
        );
        if (!emptyClosed) {
          oddsCacheMap.set(matchId, { data, timestamp: Date.now(), stateKey });
        }
        return data;
      }
      return null;
    } catch (err) {
      console.error(`[OddsService] Failed to fetch odds for match ${matchId}:`, err.message);
      const stale = cacheRecord(matchId);
      return stale?.data || null;
    } finally {
      oddsInFlight.delete(flightKey);
    }
  })();

  oddsInFlight.set(flightKey, request);
  return request;
}
