/**
 * OtherSportsEngineV4 — aggressive house protect (pre + post price).
 */

import { OSV4_MARGIN_CONFIG } from '../pricing/MarginPolicy.mjs';
import { isLiveMatch, readLiveScoreState } from '../state/readMatchState.mjs';
import { normalizeSportKey } from '../../odds-v3/sports/normalizeSportKey.mjs';

export function shortenFavoritePair(p1, p2, factor = OSV4_MARGIN_CONFIG.favoriteShortenFactor) {
  let a = Number(p1);
  let b = Number(p2);
  if (!(a > 0 && b > 0)) return [a, b];
  const f = Number(factor) > 1 ? Number(factor) : 1.08;
  if (a >= b) a *= f;
  else b *= f;
  const sum = a + b;
  return [a / sum, b / sum];
}

export function shortenFavoriteOutcomes(probs, factor = OSV4_MARGIN_CONFIG.favoriteShortenFactor) {
  const raw = (probs || []).map((p) => Math.max(0.001, Number(p) || 0));
  if (raw.length < 2) return raw;
  const f = Number(factor) > 1 ? Number(factor) : 1.08;
  let maxIdx = 0;
  for (let i = 1; i < raw.length; i += 1) {
    if (raw[i] > raw[maxIdx]) maxIdx = i;
  }
  raw[maxIdx] *= f;
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((p) => p / sum);
}

export function applySideHouseBias(p, bias = OSV4_MARGIN_CONFIG.sideHouseBias) {
  const b = Number(bias);
  const factor = Number.isFinite(b) && b > 0 && b <= 1 ? b : 0.75;
  return Math.max(0.03, Math.min(0.88, Number(p) * factor));
}

export function isOverishName(name = '') {
  const n = String(name).toLowerCase();
  return n === 'over' || n.startsWith('over ') || /\bover\b/.test(n);
}

export function isYesishName(name = '') {
  const n = String(name).toLowerCase();
  return n === 'yes' || n.startsWith('yes ') || /\bor draw\b/.test(n) || /\bor\b/.test(n);
}

function capSel(sel, cap) {
  const odds = Number(sel?.odds);
  const floor = OSV4_MARGIN_CONFIG.minDecimalOdds;
  if (!Number.isFinite(odds) || odds <= cap) return sel;
  const next = Number(Math.max(floor, cap).toFixed(2));
  return {
    ...sel,
    odds: next,
    finalProbability: Number((1 / next).toFixed(8)),
  };
}

/**
 * Live overround bump — starts earlier, ramps harder into the end.
 */
export function liveMarginBump(match, margins = OSV4_MARGIN_CONFIG) {
  if (!isLiveMatch(match)) return 0;
  const sport = normalizeSportKey(match?.sport);
  const { minute, score1, score2 } = readLiveScoreState(match);
  const maxBump = Number(margins.liveMarginBumpMax) || 0.08;
  const start = Number(margins.liveBumpStartProgress) || 0.30;
  let progress = 0;
  if (sport === 'soccer' || sport === 'esoccer') {
    progress = Math.min(1, Math.max(0, minute / 90));
  } else if (sport === 'basketball') {
    progress = Math.min(1, Math.max(0, minute / 48));
  } else if (sport === 'american-football') {
    progress = Math.min(1, Math.max(0, minute / 60));
  } else if (sport === 'tennis') {
    progress = 0.40;
  } else {
    progress = 0.35;
  }
  const late = Math.max(0, progress - start) / Math.max(0.01, 1 - start);
  let bump = maxBump * late;
  // One-goal / tight score soccer: extra risk
  if ((sport === 'soccer' || sport === 'esoccer') && Math.abs(score1 - score2) <= 1 && minute >= 60) {
    bump += 0.02;
  }
  return Number(Math.min(maxBump + 0.03, bump).toFixed(4));
}

export function withLiveBump(baseOverround, match, margins = OSV4_MARGIN_CONFIG) {
  return Number(baseOverround) + liveMarginBump(match, margins);
}

/**
 * V4.8 late lock — keep moneyline only deep into live matches.
 */
export function applyOsV4LateLock(markets = [], match, margins = OSV4_MARGIN_CONFIG) {
  if (!isLiveMatch(match)) return markets;
  const sport = normalizeSportKey(match?.sport);
  const { minute } = readLiveScoreState(match);
  let threshold = null;
  if (sport === 'soccer' || sport === 'esoccer') {
    threshold = Number(margins.soccerLateLockMinute) || 80;
  } else if (sport === 'basketball') {
    threshold = Number(margins.basketballLateLockMinute) || 42;
  } else if (sport === 'american-football') {
    threshold = Number(margins.americanFootballLateLockMinute) || 50;
  } else if (sport === 'tennis') {
    // No clock — skip time lock (set markets already guarded separately).
    return markets;
  }
  if (threshold == null || !(minute >= threshold)) return markets;

  return (markets || []).map((m) => {
    if (!m || m.status !== 'OPEN') return m;
    if (m.marketId === 'match_winner') return m;
    return {
      ...m,
      status: 'SUSPENDED',
      selections: [],
      suspensionReason: 'v48_late_lock',
    };
  });
}

/**
 * Post-price harden: longshots, Overs, Yes, soft favorites.
 */
export function tightenOsV4Markets(markets = [], marginConfig = OSV4_MARGIN_CONFIG) {
  const maxSel = Number(marginConfig.maxSelectionOdds) || 2.75;
  const maxOver = Number(marginConfig.maxOverOdds) || 1.25;
  const maxYes = Number(marginConfig.maxYesOdds) || 1.62;
  const maxFav = Number(marginConfig.maxFavoriteOdds) || 1.40;

  return (markets || []).map((market) => {
    if (!market || market.status !== 'OPEN') return market;
    const selections = (market.selections || []).map((sel) => {
      let next = capSel(sel, maxSel);
      const name = sel?.name || '';
      const fairP = Number(sel?.probability);

      if (isOverishName(name)) {
        next = capSel(next, maxOver);
      }
      if (isYesishName(name) && !isOverishName(name)) {
        next = capSel(next, maxYes);
      }
      // Soft favorite leak — never pay a near-even when model says favorite
      if (Number.isFinite(fairP) && fairP >= 0.48) {
        next = capSel(next, maxFav);
      }
      return next;
    });
    return { ...market, selections };
  });
}
