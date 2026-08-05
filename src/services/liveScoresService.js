/**
 * Live Scores Service — Unified API Aggregator.
 * Merges /api/live-scores and /api/v1/multi-sport/live Gateway endpoints.
 */

import { normalizeTeamName } from '../utils/teamNames';
import { sportsGatewayClient } from './sportsGatewayClient';

export { normalizeTeamName };

/**
 * Fetch live scores from unified BetKing API & Gateway.
 */
export async function fetchLiveScores(options = {}) {
  const url = options.force ? '/api/live-scores?refresh=1' : '/api/live-scores';

  try {
    const [legacyRes, gatewayCricket, gatewayFootball, gatewayBasketball, gatewayTennis, gatewayF1, gatewayHockey, gatewayAmericanFootball] = await Promise.all([
      fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { matches: [] })).catch(() => ({ matches: [] })),
      sportsGatewayClient.getCricket('live'),
      sportsGatewayClient.getFootball('live'),
      sportsGatewayClient.getBasketball('live'),
      sportsGatewayClient.getTennis('live'),
      sportsGatewayClient.getFormula1('live'),
      sportsGatewayClient.getHockey('live'),
      sportsGatewayClient.getAmericanFootball('live'),
    ]);

    const legacyMatches = legacyRes.matches || [];
    const legacyIds = new Set(legacyMatches.map((m) => String(m.id)));

    // Standardize gateway matches to application & canonical format
    const gatewayMatches = [
      ...(Array.isArray(gatewayCricket) ? gatewayCricket : []),
      ...(Array.isArray(gatewayFootball) ? gatewayFootball : []),
      ...(Array.isArray(gatewayBasketball) ? gatewayBasketball : []),
      ...(Array.isArray(gatewayTennis) ? gatewayTennis : []),
      ...(Array.isArray(gatewayF1) ? gatewayF1 : []),
      ...(Array.isArray(gatewayHockey) ? gatewayHockey : []),
      ...(Array.isArray(gatewayAmericanFootball) ? gatewayAmericanFootball : []),
    ].map((g) => ({
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
        runs: g.liveScore?.runs ?? g.score?.home ?? 0,
        score2: g.liveScore?.runs ?? g.score?.away ?? 0,
        wickets: g.liveScore?.wickets ?? g.score?.wickets ?? 0,
        overs: g.liveScore?.overs ?? g.score?.overs ?? '0.0',
        commentary: g.commentary?.textCommentary || (g.provider ? `Provider: ${g.provider}` : ''),
        toss: g.toss || null,
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

    // Dedup gateway matches with legacy matches
    const newGateway = gatewayMatches.filter((g) => !legacyIds.has(String(g.id)));
    const mergedMatches = [...legacyMatches, ...newGateway];

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
        gateway: 'ok',
      },
      fetchedAt: new Date().toISOString(),
      cached: false,
    };
  } catch (err) {
    console.error('[Live Scores Service] Gateway integration error:', err.message);
    const response = await fetch(url, { cache: 'no-store' });
    return response.json();
  }
}
