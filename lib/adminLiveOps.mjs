/**
 * Live operational snapshots for Admin Control Center.
 * Prefer warm aggregator cache — never invent sportsbook metrics.
 */

import {
  aggregateLiveScores,
  getCachedAggregatedLiveScores,
} from './aggregator.mjs';
import { getAdminConfigSummary } from './adminConfig.mjs';
import { buildCanonicalFromMatch } from './odds-v3/buildCanonicalFromMatch.mjs';
import { generate as generateV3 } from './odds-v3/OddsEngineV3.mjs';
import { extractMatchWinnerOdds } from './odds-v3/extractMatchWinnerOdds.mjs';

async function getLiveScoresSnapshot({ force = false } = {}) {
  const cached = getCachedAggregatedLiveScores();
  if (cached && !force) return cached;
  return aggregateLiveScores({ force: false });
}

function teamName(team) {
  if (!team) return 'Unknown';
  if (typeof team === 'string') return team;
  return team.name || team.shortName || 'Unknown';
}

function riskScoreFromOdds(odds) {
  if (!odds) return 'UNKNOWN';
  const t1 = Number(odds.team1 ?? odds.home);
  const t2 = Number(odds.team2 ?? odds.away);
  if (!(t1 > 1 && t2 > 1)) return 'UNKNOWN';
  const favorite = Math.min(t1, t2);
  if (favorite <= 1.25) return 'HIGH';
  if (favorite <= 1.55) return 'MEDIUM';
  return 'LOW';
}

export async function buildControlTowerMetrics() {
  const snapshot = await getLiveScoresSnapshot();
  const matches = snapshot?.matches || [];
  const live = matches.filter((m) => m.isLive || m.matchState === 'in');
  const withOdds = live.filter((m) => {
    const o = m.odds || {};
    return Number(o.team1 ?? o.home) > 1 && Number(o.team2 ?? o.away) > 1;
  });
  const sources = snapshot?.sources || {};
  const sourceErrors = Object.values(sources).filter((s) => s === 'error').length;

  return {
    activeUsers: null,
    openBets: null,
    liveMatches: live.length,
    matchesWithOdds: withOdds.length,
    todayTurnover: null,
    ggr: null,
    pendingWithdrawals: null,
    riskAlerts: sourceErrors,
    openTickets: null,
    systemStatus: sourceErrors > 2 ? 'DEGRADED' : (live.length > 0 ? 'HEALTHY' : 'IDLE'),
    providerSources: sources,
    cached: !!snapshot?.cached,
    stale: !!snapshot?.stale,
    timestamp: snapshot?.timestamp || new Date().toISOString(),
    note: 'Live match counts from aggregator. Financial KPIs require ledger wiring.',
  };
}

export async function buildSportsCatalog() {
  const snapshot = await getLiveScoresSnapshot();
  const matches = snapshot?.matches || [];
  const bySport = new Map();

  for (const m of matches) {
    const sport = (m.sport || 'unknown').toLowerCase();
    if (!bySport.has(sport)) {
      bySport.set(sport, {
        id: `sp-${sport}`,
        name: sport.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        competitions: new Set(),
        activeMatches: 0,
        liveMatches: 0,
        providers: new Set(),
        status: 'ACTIVE',
      });
    }
    const row = bySport.get(sport);
    if (m.league) row.competitions.add(String(m.league));
    if (m.source) row.providers.add(String(m.source));
    row.activeMatches += 1;
    if (m.isLive || m.matchState === 'in') row.liveMatches += 1;
  }

  const sports = Array.from(bySport.values()).map((row) => ({
    id: row.id,
    name: row.name,
    competitions: row.competitions.size,
    activeMatches: row.activeMatches,
    liveMatches: row.liveMatches,
    provider: row.providers.size ? Array.from(row.providers).join(' / ') : 'n/a',
    latency: 'live-cache',
    status: row.liveMatches > 0 ? 'LIVE' : 'ACTIVE',
  }));

  return { sports, totalMatches: matches.length, timestamp: new Date().toISOString() };
}

export async function buildTradingExposures({ limit = 40 } = {}) {
  const snapshot = await getLiveScoresSnapshot();
  const live = (snapshot?.matches || [])
    .filter((m) => m.isLive || m.matchState === 'in')
    .slice(0, limit);

  const exposures = live.map((m) => {
    const odds = m.odds || {};
    const t1 = Number(odds.team1 ?? odds.home) || null;
    const t2 = Number(odds.team2 ?? odds.away) || null;
    return {
      matchId: m.id || m.matchId,
      match: `${teamName(m.team1)} vs ${teamName(m.team2)}`,
      market: 'Match Winner',
      oddsTeam1: t1,
      oddsTeam2: t2,
      oddsSource: m.oddsSource || null,
      exposure: null,
      liability: null,
      riskScore: riskScoreFromOdds(odds),
      status: t1 && t2 ? 'PRICED' : 'NO_ODDS',
      source: m.source || null,
      league: m.league || null,
    };
  });

  return {
    exposures,
    count: exposures.length,
    note: 'Stake exposure/liability require open-bets ledger. Odds and risk band are live.',
    timestamp: new Date().toISOString(),
  };
}

export async function buildOddsDebugForMatch(matchId, { team1, team2 } = {}) {
  if (!matchId) {
    const err = new Error('matchId required');
    err.statusCode = 400;
    throw err;
  }

  const snapshot = await getLiveScoresSnapshot();
  let match = (snapshot?.matches || []).find(
    (m) => m.id === matchId || m.matchId === matchId,
  );

  if (!match) {
    match = {
      id: matchId,
      matchId,
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      team1: { name: team1 || 'Team 1' },
      team2: { name: team2 || 'Team 2' },
      liveDetails: {},
    };
  } else {
    match = { ...match };
    if (team1) match.team1 = { ...(typeof match.team1 === 'object' ? match.team1 : {}), name: team1 };
    if (team2) match.team2 = { ...(typeof match.team2 === 'object' ? match.team2 : {}), name: team2 };
  }

  const canonical = buildCanonicalFromMatch(match);
  const oddsSnapshot = generateV3(canonical, { debug: true });
  const winner = extractMatchWinnerOdds(oddsSnapshot, match);

  return {
    success: true,
    matchId: match.id || matchId,
    match: {
      id: match.id || matchId,
      team1: teamName(match.team1),
      team2: teamName(match.team2),
      isLive: !!match.isLive,
      matchState: match.matchState,
      source: match.source,
      league: match.league,
      listOdds: match.odds || null,
      oddsSource: match.oddsSource || null,
    },
    adminConfig: {
      globalMarginPct: getAdminConfigSummary().globalMarginPct,
      providerPriority: getAdminConfigSummary().providerPriority,
    },
    canonical: {
      currentInnings: canonical.currentInnings,
      target: canonical.target,
      runsRequired: canonical.runsRequired,
      ballsRemaining: canonical.ballsRemaining,
      battingTeamId: canonical.battingTeamId,
      team1: canonical.team1,
      team2: canonical.team2,
      stateVersion: canonical.stateVersion,
    },
    winnerOdds: winner,
    oddsVersion: oddsSnapshot.oddsVersion,
    stateVersion: oddsSnapshot.stateVersion,
    status: oddsSnapshot.status,
    generatedAt: oddsSnapshot.generatedAt,
    pricingSource: 'ODDS_ENGINE_V3',
    marketsCount: (oddsSnapshot.markets || []).length,
    markets: (oddsSnapshot.markets || []).map((m) => ({
      marketId: m.marketId,
      name: m.name,
      status: m.status,
      category: m.category,
      line: m.line,
      selections: (m.selections || []).map((s) => ({
        selectionId: s.selectionId,
        name: s.name,
        probability: s.probability,
        fairOdds: s.fairOdds,
        margin: s.margin,
        odds: s.odds,
        status: s.status,
      })),
    })),
    timestamp: new Date().toISOString(),
  };
}

export async function listLiveMatchesForAdmin({ limit = 50 } = {}) {
  const snapshot = await getLiveScoresSnapshot();
  const live = (snapshot?.matches || [])
    .filter((m) => m.isLive || m.matchState === 'in')
    .slice(0, limit)
    .map((m) => ({
      id: m.id || m.matchId,
      team1: teamName(m.team1),
      team2: teamName(m.team2),
      league: m.league || '',
      source: m.source || '',
      odds: m.odds || null,
      oddsSource: m.oddsSource || null,
      matchState: m.matchState,
    }));

  return { matches: live, count: live.length, timestamp: new Date().toISOString() };
}
