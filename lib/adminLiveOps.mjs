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
import { getMatchState } from './matchState.mjs';
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
  const live = matches.filter((m) => getMatchState(m) === 'in');
  const withOdds = live.filter((m) => {
    const o = m.odds || {};
    return Number(o.team1 ?? o.home) > 1 && Number(o.team2 ?? o.away) > 1;
  });
  const sources = snapshot?.sources || {};
  const sourceErrors = Object.values(sources).filter((s) => s === 'error').length;

  let desk = null;
  try {
    const { buildTraderDeskMetrics } = await import('./traderDeskMetrics.mjs');
    desk = await buildTraderDeskMetrics();
  } catch {
    desk = null;
  }

  return {
    activeUsers: null,
    openBets: desk?.openBets ?? null,
    liveMatches: live.length,
    matchesWithOdds: withOdds.length,
    todayTurnover: desk?.handle ?? null,
    ggr: desk?.ggr ?? null,
    holdPct: desk?.holdPct ?? null,
    openLiability: desk?.openLiability ?? null,
    pendingWithdrawals: null,
    riskAlerts: sourceErrors,
    openTickets: null,
    systemStatus: sourceErrors > 2 ? 'DEGRADED' : (live.length > 0 ? 'HEALTHY' : 'IDLE'),
    providerSources: sources,
    cached: !!snapshot?.cached,
    stale: !!snapshot?.stale,
    timestamp: snapshot?.timestamp || new Date().toISOString(),
    ggrNote: desk ? `Hold ${desk.holdPct}% · open liability ₹${desk.openLiability}` : undefined,
    note: desk
      ? 'Live matches from aggregator; GGR/hold/liability from ledger.'
      : 'Live match counts from aggregator. Financial KPIs require ledger wiring.',
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
    if (getMatchState(m) === 'in') row.liveMatches += 1;
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

/** Match-level playing XI snapshot for Admin → Sports → Squads. */
export async function buildSportsRosters({ limit = 80 } = {}) {
  const snapshot = await getLiveScoresSnapshot();
  const matches = snapshot?.matches || [];
  const cap = Math.min(Math.max(Number(limit) || 80, 1), 200);

  const rows = [];
  for (const m of matches) {
    const state = getMatchState(m);
    const squads = Array.isArray(m.squads) ? m.squads : [];
    const scorecardInnings = Array.isArray(m.scorecardInnings) ? m.scorecardInnings : [];
    const t1 = teamName(m.team1);
    const t2 = teamName(m.team2);

    const countFor = (teamLabel) => {
      const fromSquad = squads.find((s) => {
        const sn = String(s?.name || '').toLowerCase();
        const tl = String(teamLabel || '').toLowerCase();
        return sn && tl && (sn === tl || sn.includes(tl) || tl.includes(sn));
      });
      if (fromSquad?.players?.length) return fromSquad.players.length;
      let n = 0;
      for (const inn of scorecardInnings) {
        const bat = String(inn.batTeamName || '').toLowerCase();
        const tl = String(teamLabel || '').toLowerCase();
        const base = (s) => s.replace(/\b(women'?s?|wmn|men'?s?)\b/gi, '').replace(/\s+/g, ' ').trim();
        const batting = bat && tl && (bat === tl || base(bat) === base(tl));
        if (batting) n = Math.max(n, inn.batters?.length || 0);
        else if (bat && tl) n = Math.max(n, inn.bowlers?.length || 0);
      }
      return n;
    };

    const squad1 = countFor(t1);
    const squad2 = countFor(t2);
    const isLive = state === 'in';
    if (!isLive && squad1 === 0 && squad2 === 0) continue;

    rows.push({
      id: m.id || m.matchId,
      match: `${t1} vs ${t2}`,
      team1: t1,
      team2: t2,
      league: m.league || m.competition || '—',
      sport: m.sport || 'cricket',
      source: m.source || '—',
      status: isLive ? 'LIVE' : (m.status || state || 'OPEN'),
      squad1,
      squad2,
      hasScorecard: scorecardInnings.length > 0,
      hasSquads: squads.some((s) => s?.players?.length),
    });
  }

  rows.sort((a, b) => {
    const liveA = a.status === 'LIVE' ? 1 : 0;
    const liveB = b.status === 'LIVE' ? 1 : 0;
    if (liveB !== liveA) return liveB - liveA;
    return (b.squad1 + b.squad2) - (a.squad1 + a.squad2);
  });

  return {
    matches: rows.slice(0, cap),
    totalMatches: matches.length,
    listed: Math.min(rows.length, cap),
    timestamp: new Date().toISOString(),
  };
}

export async function buildTradingExposures({ limit = 40 } = {}) {
  const snapshot = await getLiveScoresSnapshot();
  const live = (snapshot?.matches || [])
    .filter((m) => getMatchState(m) === 'in')
    .slice(0, limit);

  let openByMatchMarket = new Map();
  try {
    const { query } = await import('../db/pg.js');
    const openRes = await query(
      `SELECT match_id,
              COALESCE(market_id, 'unknown') AS market_id,
              COALESCE(SUM(stake), 0)::float AS open_stake,
              COALESCE(SUM(COALESCE(potential_payout, stake * COALESCE(accepted_odds, odds, 1))), 0)::float AS open_payout,
              COUNT(*)::int AS open_bets
       FROM bets
       WHERE status IN ('ACCEPTED', 'PENDING', 'OPEN')
       GROUP BY match_id, COALESCE(market_id, 'unknown')`,
    );
    for (const r of openRes.rows) {
      const mid = r.match_id;
      if (!openByMatchMarket.has(mid)) openByMatchMarket.set(mid, []);
      openByMatchMarket.get(mid).push(r);
    }
  } catch {
    openByMatchMarket = new Map();
  }

  const exposures = [];
  for (const m of live) {
    const odds = m.odds || {};
    const t1 = Number(odds.team1 ?? odds.home) || null;
    const t2 = Number(odds.team2 ?? odds.away) || null;
    const matchId = m.id || m.matchId;
    const markets = openByMatchMarket.get(matchId) || [];
    const matchLabel = `${teamName(m.team1)} vs ${teamName(m.team2)}`;

    if (!markets.length) {
      exposures.push({
        matchId,
        match: matchLabel,
        market: 'Match Winner',
        marketId: 'match_winner',
        oddsTeam1: t1,
        oddsTeam2: t2,
        oddsSource: m.oddsSource || null,
        exposure: null,
        liability: null,
        openBets: 0,
        riskScore: riskScoreFromOdds(odds),
        status: t1 && t2 ? 'PRICED' : 'NO_ODDS',
        source: m.source || null,
        league: m.league || null,
      });
      continue;
    }

    for (const open of markets) {
      const openStake = Number(open.open_stake);
      const openPayout = Number(open.open_payout);
      exposures.push({
        matchId,
        match: matchLabel,
        market: String(open.market_id || 'unknown'),
        marketId: String(open.market_id || 'unknown'),
        oddsTeam1: t1,
        oddsTeam2: t2,
        oddsSource: m.oddsSource || null,
        exposure: openStake,
        liability: Number(Math.max(0, openPayout - openStake).toFixed(2)),
        openBets: Number(open.open_bets || 0),
        riskScore: riskScoreFromOdds(odds),
        status: t1 && t2 ? 'PRICED' : 'NO_ODDS',
        source: m.source || null,
        league: m.league || null,
      });
    }
  }

  // Highest liability first so Overs stacking is visible
  exposures.sort((a, b) => (Number(b.liability) || 0) - (Number(a.liability) || 0));

  return {
    exposures,
    count: exposures.length,
    note: 'Open stake/liability grouped by match + market_id; sorted by liability desc.',
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
      isLive: getMatchState(match) === 'in',
      matchState: getMatchState(match),
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
    .filter((m) => getMatchState(m) === 'in')
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
