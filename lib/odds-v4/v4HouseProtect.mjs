/**
 * OddsEngineV4 — house-protect margins & post-price tighten.
 * Goal: thicker book than V3 so published prices are harder to beat.
 */

import { MIN_DECIMAL_ODDS } from '../odds-v3/pricing/MarginCalculator.mjs';
import { DEFAULT_MARGIN_CONFIG } from '../odds-v3/pricing/MarginCalculator.mjs';

/** Live V4.9 defaults — production-grade house book (operator mark 10/10). */
export const V4_MARGIN_CONFIG = Object.freeze({
  ...DEFAULT_MARGIN_CONFIG,
  liveMatchWinnerOverround: 0.17,
  liveTeamTotalOverround: 0.205,
  liveMatchTotalOverround: 0.205,
  liveTotalsOverExtraOverround: 0.08,
  maxLiveTotalOverOdds: 1.34,
  /** Hard ceiling on any published selection (longshot liability). */
  maxSelectionOdds: 3.9,
  /** Soft props / Yes sides. */
  maxYesOdds: 1.90,
  /** Soft favorite ceiling when fair p ≥ 0.48 */
  maxFavoriteOdds: 1.55,
  /** Pull favorite fair p up before margin (shorter fav prices). */
  favoriteShortenFactor: 1.10,
  /** Multiply resource expected runs (conservative scoring → softer Overs). */
  resourceRunsHaircut: 0.885,
  /** Multiply model Over / Yes fair probs before margin. */
  sideHouseBias: 0.78,
  /** Weight of provider odds in live MW blend (0–0.45). */
  providerBlendWeight: 0.22,
  /** Exclusive 2-way markets must clear this implied mass after tighten. */
  minExclusiveBookMass: 1.145,
});

export function isOverishName(name = '') {
  const n = String(name).toLowerCase();
  return n === 'over' || n.startsWith('over ') || /\bover\b/.test(n);
}

function isYesishName(name = '') {
  const n = String(name).toLowerCase();
  return n === 'yes' || n.startsWith('yes ');
}

function capSelectionOdds(sel, cap) {
  const odds = Number(sel?.odds);
  if (!Number.isFinite(odds) || odds <= cap) return sel;
  const next = Number(Math.max(MIN_DECIMAL_ODDS, cap).toFixed(2));
  return {
    ...sel,
    odds: next,
    finalProbability: Number((1 / next).toFixed(8)),
  };
}

/**
 * SRL callers may pass legacy SRL_MARGIN_CONFIG, but must never soften V4.8 house ceilings.
 * Overrounds take the thicker of V4 vs requested; caps take the tighter of V4 vs requested.
 */
export function resolveSrlV4Margins(extra = {}) {
  const req = extra && typeof extra === 'object' ? extra : {};
  return {
    ...V4_MARGIN_CONFIG,
    ...req,
    maxLiveTotalOverOdds: Math.min(
      V4_MARGIN_CONFIG.maxLiveTotalOverOdds,
      Number(req.maxLiveTotalOverOdds) > 0
        ? Number(req.maxLiveTotalOverOdds)
        : V4_MARGIN_CONFIG.maxLiveTotalOverOdds,
    ),
    maxFavoriteOdds: V4_MARGIN_CONFIG.maxFavoriteOdds,
    maxSelectionOdds: V4_MARGIN_CONFIG.maxSelectionOdds,
    maxYesOdds: V4_MARGIN_CONFIG.maxYesOdds,
    minExclusiveBookMass: V4_MARGIN_CONFIG.minExclusiveBookMass,
    liveMatchWinnerOverround: Math.max(
      V4_MARGIN_CONFIG.liveMatchWinnerOverround,
      Number(req.liveMatchWinnerOverround) || 0,
    ),
    liveTeamTotalOverround: Math.max(
      V4_MARGIN_CONFIG.liveTeamTotalOverround,
      Number(req.liveTeamTotalOverround) || 0,
    ),
    liveMatchTotalOverround: Math.max(
      V4_MARGIN_CONFIG.liveMatchTotalOverround,
      Number(req.liveMatchTotalOverround) || 0,
    ),
    liveTotalsOverExtraOverround: Math.max(
      V4_MARGIN_CONFIG.liveTotalsOverExtraOverround,
      Number(req.liveTotalsOverExtraOverround) || 0,
    ),
  };
}

/**
 * Shorten the favorite on a two-way exclusive market before pricing.
 * @returns {[number, number]} remormalized [p1, p2]
 */
export function shortenFavoritePair(p1, p2, factor = V4_MARGIN_CONFIG.favoriteShortenFactor) {
  let a = Number(p1);
  let b = Number(p2);
  if (!(a > 0 && b > 0)) return [a, b];
  const f = Number(factor) > 1 ? Number(factor) : 1.045;
  if (a >= b) a *= f;
  else b *= f;
  const sum = a + b;
  return [a / sum, b / sum];
}

/**
 * Bias a one-sided fair prob down (Over / Yes) for house edge.
 */
export function applySideHouseBias(p, bias = V4_MARGIN_CONFIG.sideHouseBias) {
  const b = Number(bias);
  const factor = Number.isFinite(b) && b > 0 && b <= 1 ? b : 0.90;
  return Math.max(0.03, Math.min(0.95, Number(p) * factor));
}

function enforceExclusiveMinMass(market, minMass) {
  const sels = (market.selections || []).filter((s) => Number(s?.odds) >= MIN_DECIMAL_ODDS);
  if (sels.length !== 2) return market;
  const mass = sels.reduce((acc, s) => acc + 1 / Number(s.odds), 0);
  if (!(mass > 0) || mass + 1e-6 >= minMass) return market;
  const scale = minMass / mass;
  return {
    ...market,
    selections: (market.selections || []).map((s) => {
      const odds = Number(s.odds);
      if (!Number.isFinite(odds) || odds < MIN_DECIMAL_ODDS) return s;
      const implied = Math.min(0.985, (1 / odds) * scale);
      return {
        ...s,
        odds: Number(Math.max(MIN_DECIMAL_ODDS, 1 / implied).toFixed(4)),
        finalProbability: Number(implied.toFixed(8)),
      };
    }),
    minMassEnforced: true,
  };
}

/**
 * Post-process open markets: cap longshots + soft Over/Yes + exclusive min mass.
 * Soft-Over cap only applies when Over is still a live/favorite side —
 * never crush correctly long chase Overs (win-and-stop ceilings).
 */
export function tightenV4Markets(markets = [], marginConfig = V4_MARGIN_CONFIG) {
  const maxSel = Number(marginConfig.maxSelectionOdds) || 3.9;
  const maxOver = Number(marginConfig.maxLiveTotalOverOdds) || 1.34;
  const maxYes = Number(marginConfig.maxYesOdds) || 1.90;
  const maxFav = Number(marginConfig.maxFavoriteOdds) || 1.55;
  const minMass = Number(marginConfig.minExclusiveBookMass) || 1.145;

  return (markets || []).map((market) => {
    if (!market || market.status !== 'OPEN') return market;
    let nextMarket = {
      ...market,
      selections: (market.selections || []).map((sel) => {
        let next = capSelectionOdds(sel, maxSel);
        const name = sel?.name || '';
        const odds = Number(next?.odds);
        const fairP = Number(sel?.probability);
        // Require finite fairP — NaN/missing used to force soft-Over crush via !(NaN < 0.42).
        if (
          isOverishName(name)
          && Number.isFinite(odds)
          && odds > maxOver
          && Number.isFinite(fairP)
          && fairP >= 0.42
        ) {
          next = capSelectionOdds(next, maxOver);
        }
        if (isYesishName(name)) next = capSelectionOdds(next, maxYes);
        if (Number.isFinite(fairP) && fairP >= 0.48) {
          next = capSelectionOdds(next, maxFav);
        }
        return next;
      }),
    };
    nextMarket = enforceExclusiveMinMass(nextMarket, minMass);
    return nextMarket;
  });
}
