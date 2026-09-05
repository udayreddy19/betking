/**
 * OddsEngineV4 4.2 — book guardian.
 * Settlement-strict filter, min-overround enforce, and 0–100 quality score.
 */

import { MIN_DECIMAL_ODDS } from '../odds-v3/pricing/MarginCalculator.mjs';
import { validateMarketSettlementCompatibility } from '../settlement/marketSettlementContract.mjs';
import { V4_MARGIN_CONFIG } from './v4HouseProtect.mjs';
import { maxChaseTeamScore, pOverChaseTeamTotal } from './chaseTotalCaps.mjs';

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function openSels(market) {
  return (market?.selections || []).filter((s) => {
    const odds = Number(s?.odds);
    return Number.isFinite(odds) && odds >= MIN_DECIMAL_ODDS && s?.bettable !== false;
  });
}

function impliedSum(sels) {
  return sels.reduce((acc, s) => acc + 1 / Number(s.odds), 0);
}

/**
 * Drop unsound / unsettleable markets; enforce minimum book mass on 2-ways.
 */
export function guardV4Book(markets = [], state, marginConfig = V4_MARGIN_CONFIG) {
  const minMw = marginConfig.liveMatchWinnerOverround ?? V4_MARGIN_CONFIG.liveMatchWinnerOverround;
  const minTot = (marginConfig.liveTeamTotalOverround ?? 0.16)
    + (marginConfig.liveTotalsOverExtraOverround ?? 0.06);
  const issues = [];
  const out = [];

  for (const market of markets || []) {
    if (!market?.marketId) continue;
    if (market.status === 'SETTLED') {
      out.push(market);
      continue;
    }
    if (market.status && market.status !== 'OPEN') {
      out.push(market);
      continue;
    }

    const compat = validateMarketSettlementCompatibility(market);
    if (!compat.compatible) {
      issues.push(`settlement:${market.marketId}`);
      continue;
    }

    const sels = openSels(market);
    if (sels.length < 2) {
      issues.push(`thin:${market.marketId}`);
      continue;
    }

    const ids = new Set();
    let dup = false;
    for (const s of sels) {
      const sid = String(s.selectionId || s.name || '');
      if (ids.has(sid)) { dup = true; break; }
      ids.add(sid);
    }
    if (dup) {
      issues.push(`dup_sel:${market.marketId}`);
      continue;
    }

    // Chase soft-Over leak (belt + suspenders after chaseTotalCaps)
    const id = String(market.marketId);
    const line = Number(market.line);
    if (
      Number(state?.currentInnings) >= 2
      && state?.target != null
      && Number.isFinite(line)
      && (/^team_total|^i\d+_team_total|match_total/i.test(id))
    ) {
      const batting = state.battingTeamId === state.team1?.id ? state.team1 : state.team2;
      const first = Number(
        state.firstInningsRuns
        ?? (state.battingTeamId === state.team1?.id ? state.team2?.runs : state.team1?.runs),
      );
      const teamLine = /^match_total/i.test(id) && Number.isFinite(first)
        ? line - first
        : line;
      const maxTeam = maxChaseTeamScore(state.target);
      if (maxTeam != null && teamLine >= maxTeam) {
        issues.push(`chase_ceil:${market.marketId}`);
        continue;
      }
      const pOver = pOverChaseTeamTotal({
        line: teamLine,
        currentScore: Number(batting?.runs) || 0,
        runsRequired: state.runsRequired,
        target: state.target,
      });
      const overSel = sels.find((s) => String(s.name).toLowerCase().startsWith('over'));
      if (overSel && pOver < 0.2 && Number(overSel.odds) < 2.2) {
        issues.push(`soft_chase_over:${market.marketId}`);
        continue;
      }
    }

    const isTotals = /team_total|match_total|overs_0_|next_over_.*total|dismissal/i.test(id);
    const minBook = 1 + (isTotals ? minTot : minMw) * 0.85;
    let next = market;
    const mass = impliedSum(sels);
    if (sels.length === 2 && mass + 1e-6 < minBook) {
      // Scale both implied probs up to hit min book mass (shorter prices).
      const scale = minBook / mass;
      next = {
        ...market,
        selections: (market.selections || []).map((s) => {
          const odds = Number(s.odds);
          if (!Number.isFinite(odds) || odds < MIN_DECIMAL_ODDS) return s;
          const implied = Math.min(0.97, (1 / odds) * scale);
          return {
            ...s,
            odds: Number(Math.max(MIN_DECIMAL_ODDS, 1 / implied).toFixed(4)),
            finalProbability: Number(implied.toFixed(8)),
          };
        }),
        guardianScaled: true,
      };
    }

    out.push(next);
  }

  return { markets: out, issues };
}

/**
 * Score the live V4 book 0–100 against production readiness rubric.
 */
export function scoreV4Book({
  markets = [],
  state,
  momentum,
  issues = [],
  engineVersion = '4.2.0',
} = {}) {
  const open = (markets || []).filter((m) => m?.status === 'OPEN');
  const ids = new Set(open.map((m) => m.marketId));
  const mw = open.find((m) => m.marketId === 'match_winner');
  const hasChaseCaps = Number(state?.currentInnings) < 2 || state?.target == null
    || open.some((m) => m.marketId === 'team_total' || m.marketId === 'match_total');

  let mwScore = 0;
  if (mw?.selections?.length >= 2) {
    const mass = impliedSum(openSels(mw));
    mwScore = mass >= 1.10 ? 20 : mass >= 1.06 ? 16 : 12;
    if (momentum?.factor) mwScore = Math.min(20, mwScore + 1);
  }

  let house = 12;
  if (mw) {
    const mass = impliedSum(openSels(mw));
    if (mass >= 1.11) house += 4;
    if (mass >= 1.14) house += 2;
  }
  const overs = open.flatMap((m) => m.selections || []).filter((s) => String(s.name).toLowerCase() === 'over');
  if (overs.length && Math.max(...overs.map((s) => Number(s.odds) || 0)) <= 6.5) house += 2;
  house = clamp(house, 0, 20);

  let chase = Number(state?.currentInnings) >= 2 && state?.target != null ? 12 : 13;
  if (hasChaseCaps) chase = Math.min(15, chase + 2);
  if (!issues.some((i) => String(i).startsWith('soft_chase') || String(i).startsWith('chase_ceil'))) {
    chase = Math.min(15, chase + 1);
  }

  let depth = 6;
  if (open.length >= 20) depth += 3;
  if (open.length >= 40) depth += 3;
  if (ids.has('match_winner') && (ids.has('team_total') || ids.has('match_total'))) depth += 2;
  if ([...ids].some((id) => /next_delivery_|player_|overs_0_|team_score_at_/i.test(id))) depth += 1;
  depth = clamp(depth, 0, 15);

  let settlement = 10 - Math.min(6, issues.filter((i) => String(i).startsWith('settlement')).length);
  settlement = clamp(settlement, 0, 10);

  let stability = 7;
  if (engineVersion >= '4.2.0') stability += 1;
  if (issues.length === 0) stability += 2;
  if (mw?.status === 'OPEN') stability += 1;
  stability = clamp(stability, 0, 10);

  let latency = 4;
  if (momentum) latency += 1;
  latency = clamp(latency, 0, 5);

  const ops = 5; // mode toggle + shadow + v4Meta

  const total = mwScore + house + chase + depth + settlement + stability + latency + ops;
  return {
    qualityScore: clamp(total, 0, 100),
    breakdown: {
      matchWinner: mwScore,
      houseEdge: house,
      chaseTotals: chase,
      marketDepth: depth,
      settlement: settlement,
      stability,
      latency,
      ops,
    },
    openMarkets: open.length,
    issueCount: issues.length,
  };
}

/**
 * If book is unhealthy, keep only core markets (MW + main totals).
 */
export function applyStabilityFallback(markets = [], score) {
  if (!score || score.qualityScore >= 70) return markets;
  const keep = new Set(['match_winner', 'match_winner_super_over', 'team_total', 'match_total']);
  return (markets || []).map((m) => {
    if (!m || m.status !== 'OPEN') return m;
    if (keep.has(m.marketId)) return m;
    return {
      ...m,
      status: 'SUSPENDED',
      suspensionReason: 'v4_stability_fallback',
      selections: (m.selections || []).map((s) => ({ ...s, bettable: false, status: 'SUSPENDED' })),
    };
  });
}
