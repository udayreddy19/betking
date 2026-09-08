/**
 * OtherSportsEngineV4 — 0–100 quality scorecard (v4.9).
 * Drives stability fallback: score < 70 → core-only (match_winner).
 */

import { OSV4_MARGIN_CONFIG, minBookMassForKind } from '../pricing/MarginPolicy.mjs';

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function openSels(market) {
  return (market?.selections || []).filter((s) => {
    const odds = Number(s?.odds);
    return Number.isFinite(odds) && odds >= (OSV4_MARGIN_CONFIG.minDecimalOdds || 1.01);
  });
}

function impliedSum(sels) {
  return sels.reduce((acc, s) => acc + 1 / Number(s.odds), 0);
}

/**
 * Score the other-sports V4 book 0–100 against production rubric.
 *
 * Rubric:
 *   matchWinner  (20)  — book mass, selection count, spread
 *   houseEdge    (20)  — Over caps, favorite caps, min-mass compliance
 *   marketDepth  (15)  — open market count, category diversity
 *   settlement   (10)  — settlement compat issues
 *   stability    (10)  — engine version, issue count, guardian pass rate
 *   latency       (5)  — live bump applied, provider blend active
 *   ops           (5)  — mode toggle, shadow metrics available
 *   models       (15)  — model confidence, blended flag, sport-specific
 */
export function scoreOsV4Book({
  markets = [],
  issues = [],
  sport,
  blended = false,
  modelConfidence = 0.8,
  liveMarginBump = 0,
  engineVersion = '4.9.0',
} = {}) {
  const open = (markets || []).filter((m) => m?.status === 'OPEN');
  const mw = open.find((m) => m.marketId === 'match_winner');

  // 1. Match Winner (20)
  let mwScore = 0;
  if (mw?.selections?.length >= 2) {
    const mass = impliedSum(openSels(mw));
    mwScore = mass >= 1.19 ? 20 : mass >= 1.14 ? 17 : mass >= 1.10 ? 14 : 10;
  }

  // 2. House Edge (20)
  let house = 10;
  if (mw) {
    const mass = impliedSum(openSels(mw));
    if (mass >= 1.19) house += 4;
    if (mass >= 1.22) house += 2;
  }
  const overs = open.flatMap((m) => m.selections || [])
    .filter((s) => String(s.name || '').toLowerCase().startsWith('over'));
  if (overs.length && Math.max(...overs.map((s) => Number(s.odds) || 0)) <= OSV4_MARGIN_CONFIG.maxOverOdds + 0.01) {
    house += 2;
  }
  const favs = open.flatMap((m) => m.selections || [])
    .filter((s) => Number(s.probability) >= 0.48);
  if (favs.length && Math.max(...favs.map((s) => Number(s.odds) || 0)) <= OSV4_MARGIN_CONFIG.maxFavoriteOdds + 0.01) {
    house += 2;
  }
  house = clamp(house, 0, 20);

  // 3. Market Depth (15)
  let depth = 4;
  if (open.length >= 3) depth += 2;
  if (open.length >= 5) depth += 2;
  if (open.length >= 7) depth += 2;
  const categories = new Set(open.map((m) => m.category).filter(Boolean));
  if (categories.size >= 2) depth += 2;
  if (categories.size >= 3) depth += 1;
  if (categories.size >= 4) depth += 2;
  depth = clamp(depth, 0, 15);

  // 4. Settlement (10)
  const settlementIssues = issues.filter((i) => String(i).includes('settlement')).length;
  const settlement = clamp(10 - Math.min(6, settlementIssues), 0, 10);

  // 5. Stability (10)
  let stability = 5;
  if (String(engineVersion).startsWith('4.9')) stability += 3;
  else if (String(engineVersion).startsWith('4.8')) stability += 2;
  else if (String(engineVersion).startsWith('4.')) stability += 1;
  if (issues.length === 0) stability += 2;
  if (mw?.status === 'OPEN') stability += 1;
  stability = clamp(stability, 0, 10);

  // 6. Latency (5)
  let latency = 3;
  if (liveMarginBump > 0) latency += 1;
  if (blended) latency += 1;
  latency = clamp(latency, 0, 5);

  // 7. Ops (5)
  const ops = 5;

  // 8. Models (15)
  let models = 6;
  const conf = Number(modelConfidence) || 0;
  if (conf >= 0.85) models += 3;
  else if (conf >= 0.7) models += 2;
  if (blended) models += 3;
  if (sport === 'soccer' || sport === 'esoccer') models += 2; // Dixon-Coles is strongest
  else if (sport === 'basketball' || sport === 'american-football') models += 1;
  else if (sport === 'tennis') models += 1;
  models = clamp(models, 0, 15);

  const total = mwScore + house + depth + settlement + stability + latency + ops + models;
  return {
    qualityScore: clamp(total, 0, 100),
    breakdown: {
      matchWinner: mwScore,
      houseEdge: house,
      marketDepth: depth,
      settlement,
      stability,
      latency,
      ops,
      models,
    },
    openMarkets: open.length,
    issueCount: issues.length,
  };
}

/**
 * Score-driven stability fallback: quality < 70 → core-only.
 */
export function applyScoreDrivenFallback(markets = [], score) {
  if (!score || score.qualityScore >= 70) return markets;
  const keep = new Set(['match_winner']);
  return (markets || []).map((m) => {
    if (!m || m.status !== 'OPEN') return m;
    if (keep.has(m.marketId)) return m;
    return {
      ...m,
      status: 'SUSPENDED',
      selections: [],
      suspensionReason: 'osv4_quality_fallback',
    };
  });
}
