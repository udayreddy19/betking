/**
 * Live Scores Service — Unified API Aggregator.
 * Merges /api/live-scores and /api/v1/multi-sport/live Gateway endpoints.
 */

import { normalizeTeamName } from '../utils/teamNames';
import { sportsGatewayClient } from './sportsGatewayClient';
import { cricketScoreWeight, cricketSourceRank, getCanonicalMatchPairKey } from '../../lib/matchPairKey.mjs';

export { normalizeTeamName };

const lastKnownLiveMatches = new Map();
const inflightByKey = new Map();

function asMatchList(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.matches)) return value.matches;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function fetchLegacyLiveScores(url) {
  const noStore = url.includes('refresh=1');
  return fetch(url, { cache: noStore ? 'no-store' : 'default' })
    .then(async (r) => {
      const data = await r.json().catch(() => ({}));
      return { httpOk: r.ok, ...data };
    })
    .catch(() => ({
      matches: [],
      httpOk: false,
      feedError: { code: 'LIVE_SCORES_UNREACHABLE', message: 'Could not reach live score API. Tap Retry.' },
    }));
}

async function fetchGatewayLiveMatches() {
  const [cricket, football, basketball, tennis, f1, hockey, americanFootball] = await Promise.all([
    sportsGatewayClient.getCricket('live'),
    sportsGatewayClient.getFootball('live'),
    sportsGatewayClient.getBasketball('live'),
    sportsGatewayClient.getTennis('live'),
    sportsGatewayClient.getFormula1('live'),
    sportsGatewayClient.getHockey('live'),
    sportsGatewayClient.getAmericanFootball('live'),
  ]);
  return [
    ...asMatchList(cricket),
    ...asMatchList(football),
    ...asMatchList(basketball),
    ...asMatchList(tennis),
    ...asMatchList(f1),
    ...asMatchList(hockey),
    ...asMatchList(americanFootball),
  ];
}

/**
 * Fetch live scores from unified OddsYra API, optionally merging Gateway sports.
 * Gateway fan-out is opt-in so first paint is one request, not eight.
 */
export async function fetchLiveScores(options = {}) {
  const includeGateway = options.includeGateway === true || (options.force === true && options.includeGateway !== false);
  const url = options.force ? '/api/live-scores?refresh=1' : '/api/live-scores';
  const inflightKey = `${url}:${includeGateway ? 'gw' : 'fast'}`;
  if (inflightByKey.has(inflightKey)) return inflightByKey.get(inflightKey);

  const pending = loadLiveScores(url, includeGateway).finally(() => {
    inflightByKey.delete(inflightKey);
  });
  inflightByKey.set(inflightKey, pending);
  return pending;
}

async function loadLiveScores(url, includeGateway) {
  try {
    const [legacyRes, gatewayRaw] = await Promise.all([
      fetchLegacyLiveScores(url),
      includeGateway ? fetchGatewayLiveMatches() : Promise.resolve([]),
    ]);

    const legacyMatches = legacyRes.matches || [];
    const legacyIds = new Set(legacyMatches.map((m) => String(m.id)));

    // Standardize gateway matches to application & canonical format
    const gatewayMatches = gatewayRaw.map((g) => ({
      id: g.matchId || g.id || `gwy_${Date.now()}`,
      sport: typeof g.sport === 'object' ? (g.sport?.slug || g.sport?.sportName || 'cricket') : (g.sport || 'cricket'),
      league: typeof g.league === 'object' ? (g.league?.leagueName || 'International League') : (g.competition || g.league || 'International League'),
      matchState: g.status === 'LIVE' || g.liveStatus === 'IN_PROGRESS' ? 'in' : (g.status === 'FINISHED' || g.liveStatus === 'COMPLETED' ? 'post' : 'pre'),
      isLive: g.status === 'LIVE' || g.liveStatus === 'IN_PROGRESS',
      time: g.liveScore?.time || g.score?.period || (g.status === 'LIVE' ? 'Live' : 'Scheduled'),
      team1: {
        id: g.homeTeam?.teamId || g.homeTeam?.id || 'tm_1',
        name: g.homeTeam?.teamName || g.homeTeam?.name || 'Home Team',
        shortName: g.homeTeam?.shortName || 'HOM',
        logo: g.homeTeam?.logo || null,
        kit: g.homeTeam?.kit || null,
      },
      team2: {
        id: g.awayTeam?.teamId || g.awayTeam?.id || 'tm_2',
        name: g.awayTeam?.teamName || g.awayTeam?.name || 'Away Team',
        shortName: g.awayTeam?.shortName || 'AWY',
        logo: g.awayTeam?.logo || null,
        kit: g.awayTeam?.kit || null,
      },
      liveDetails: {
        runs: g.liveScore?.runs ?? g.score?.home ?? g.liveDetails?.runs,
        score2: g.liveScore?.score2 ?? g.liveScore?.chaseRuns ?? g.score?.away ?? g.liveDetails?.score2,
        wickets: g.liveScore?.wickets ?? g.score?.wickets ?? g.liveDetails?.wickets,
        wickets2: g.liveScore?.wickets2 ?? g.liveScore?.chaseWickets ?? g.liveDetails?.wickets2,
        overs: g.liveScore?.overs ?? g.score?.overs ?? g.liveDetails?.overs,
        overs2: g.liveScore?.overs2 ?? g.liveScore?.chaseOvers ?? g.liveDetails?.overs2,
        firstRuns: g.liveDetails?.firstRuns,
        firstWickets: g.liveDetails?.firstWickets,
        firstOvers: g.liveDetails?.firstOvers,
        firstTeamName: g.liveDetails?.firstTeamName,
        chaseRuns: g.liveDetails?.chaseRuns,
        chaseWickets: g.liveDetails?.chaseWickets,
        chaseOvers: g.liveDetails?.chaseOvers,
        chaseTeamName: g.liveDetails?.chaseTeamName,
        commentary: g.commentary?.textCommentary || g.liveDetails?.commentary || (g.provider ? `Provider: ${g.provider}` : ''),
        toss: g.toss || g.liveDetails?.toss || null,
        // Player fields — must be preserved for scorecard widget
        batter1: g.liveDetails?.batter1 || g.liveScore?.batter1 || null,
        batter2: g.liveDetails?.batter2 || g.liveScore?.batter2 || null,
        bowler: g.liveDetails?.bowler || g.liveScore?.bowler || null,
        currentOverBalls: g.liveDetails?.currentOverBalls || g.liveScore?.currentOverBalls || [],
        scorecardInnings: g.liveDetails?.scorecardInnings || g.scorecardInnings || [],
        overHistory: g.liveDetails?.overHistory || g.overHistory || [],
      },
      venue: g.venue || null,
      officials: g.officials || null,
      lineups: g.lineups || null,
      odds: g.odds || null,
      events: g.events || null,
      headToHead: g.headToHead || null,
      awards: g.awards || null,
      season: g.season || null,
      tournament: g.tournament || null,
      source: g.provider || 'gateway',
    }));

    const mergeLiveDetails = (preferred = {}, fallback = {}) => ({
      ...fallback,
      ...preferred,
      commentaryFeed: preferred.commentaryFeed || fallback.commentaryFeed,
      overHistory: preferred.overHistory || fallback.overHistory,
      squads: preferred.squads || fallback.squads,
      batter1: preferred.batter1 || fallback.batter1,
      batter2: preferred.batter2 || fallback.batter2,
      bowler: preferred.bowler || fallback.bowler,
    });

    const mergeLegacyOrGateway = (existing, incoming) => {
      if (!existing) return incoming;
      const existingRank = cricketSourceRank(existing);
      const incomingRank = cricketSourceRank(incoming);
      let primary = incomingRank >= existingRank ? incoming : existing;
      let secondary = incomingRank >= existingRank ? existing : incoming;
      if (cricketScoreWeight(primary) === 0 && cricketScoreWeight(secondary) > 0) {
        const scored = secondary;
        secondary = primary;
        primary = scored;
      }
      const cb = [existing, incoming].find((m) => String(m.id || '').startsWith('cb_'));
      return {
        ...secondary,
        ...primary,
        id: cb?.id || primary.id,
        source: cb ? 'cricbuzz' : primary.source,
        cricbuzzMatchId: existing.cricbuzzMatchId
          || incoming.cricbuzzMatchId
          || cb?.cricbuzzMatchId
          || (cb?.id?.startsWith('cb_') ? String(cb.id).replace(/^cb_/, '') : null),
        espnEventId: existing.espnEventId || incoming.espnEventId,
        espnPath: existing.espnPath || incoming.espnPath,
        liveDetails: mergeLiveDetails(primary.liveDetails, secondary.liveDetails),
      };
    };

    const matchMap = new Map();
    for (const m of legacyMatches) {
      const key = getCanonicalMatchPairKey(m) || String(m.id);
      matchMap.set(key, mergeLegacyOrGateway(matchMap.get(key), m));
    }

    for (const g of gatewayMatches) {
      const key = getCanonicalMatchPairKey(g) || String(g.id);
      matchMap.set(key, mergeLegacyOrGateway(matchMap.get(key), g));
    }

    // Retain live matches during short API dropouts (20s grace period)
    const now = Date.now();
    for (const [key, cached] of lastKnownLiveMatches.entries()) {
      if (!matchMap.has(key) && (now - cached.lastSeenAt < 20000)) {
        matchMap.set(key, cached.match);
      }
    }

    const mergedMatches = Array.from(matchMap.values());

    // Update last known live matches cache
    for (const m of mergedMatches) {
      const isLive = m.isLive || m.matchState === 'in';
      const key = getCanonicalMatchPairKey(m) || String(m.id);
      if (isLive) {
        lastKnownLiveMatches.set(key, { match: m, lastSeenAt: now });
      } else {
        lastKnownLiveMatches.delete(key);
      }
    }

    return {
      matches: mergedMatches,
      series: legacyRes.series || [],
      counts: {
        total: mergedMatches.length,
        live: mergedMatches.filter((m) => m.isLive || m.matchState === 'in').length,
        cricket: mergedMatches.filter((m) => m.sport === 'cricket').length,
        football: mergedMatches.filter((m) => m.sport === 'football' || m.sport === 'soccer').length,
        basketball: mergedMatches.filter((m) => m.sport === 'basketball').length,
        tennis: mergedMatches.filter((m) => m.sport === 'tennis').length,
        formula1: mergedMatches.filter((m) => m.sport === 'formula1').length,
        hockey: mergedMatches.filter((m) => m.sport === 'hockey').length,
        'american-football': mergedMatches.filter((m) => m.sport === 'american-football').length,
      },
      sources: {
        ...(legacyRes.sources || {}),
        ...(includeGateway ? { gateway: 'ok' } : {}),
      },
      feedError: legacyRes.feedError || null,
      status: legacyRes.status,
      fetchedAt: new Date().toISOString(),
      cached: false,
    };
  } catch (err) {
    console.error('[Live Scores Service] Gateway integration error:', err.message);
    const response = await fetch(url, { cache: 'no-store' });
    return response.json();
  }
}
