/**
 * OddsEngineV4 — house-protect margins & post-price tighten.
 * Goal: thicker book than V3 so published prices are harder to beat.
 */

import { MIN_DECIMAL_ODDS } from '../odds-v3/pricing/MarginCalculator.mjs';
import { DEFAULT_MARGIN_CONFIG } from '../odds-v3/pricing/MarginCalculator.mjs';

/** Live V4.3 defaults — firmer than V4.2 / V3. */
export const V4_MARGIN_CONFIG = Object.freeze({
  ...DEFAULT_MARGIN_CONFIG,
  liveMatchWinnerOverround: 0.145,
  liveTeamTotalOverround: 0.18,
  liveMatchTotalOverround: 0.18,
  liveTotalsOverExtraOverround: 0.065,
  maxLiveTotalOverOdds: 1.42,
  /** Hard ceiling on any published selection (longshot liability). */
  maxSelectionOdds: 5.5,
  /** Soft props / Yes sides. */
  maxYesOdds: 2.20,
  /** Pull favorite fair p up before margin (shorter fav prices). */
  favoriteShortenFactor: 1.06,
  /** Multiply resource expected runs (conservative scoring → softer Overs). */
  resourceRunsHaircut: 0.91,
  /** Multiply model Over / Yes fair probs before margin. */
  sideHouseBias: 0.86,
  /** Weight of provider odds in live MW blend (0–0.45). */
  providerBlendWeight: 0.32,
});

function isOverishName(name = '') {
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

/**
 * Post-process open markets: cap longshots + soft Over/Yes.
 * Soft-Over cap only applies when Over is still a live/favorite side —
 * never crush correctly long chase Overs (win-and-stop ceilings).
 */
export function tightenV4Markets(markets = [], marginConfig = V4_MARGIN_CONFIG) {
  const maxSel = Number(marginConfig.maxSelectionOdds) || 6.5;
  const maxOver = Number(marginConfig.maxLiveTotalOverOdds) || 1.48;
  const maxYes = Number(marginConfig.maxYesOdds) || 2.35;

  return (markets || []).map((market) => {
    if (!market || market.status !== 'OPEN') return market;
    const selections = (market.selections || []).map((sel) => {
      let next = capSelectionOdds(sel, maxSel);
      const name = sel?.name || '';
      const odds = Number(next?.odds);
      const fairP = Number(sel?.probability);
      if (
        isOverishName(name)
        && Number.isFinite(odds)
        && odds > maxOver
        && (!(fairP < 0.42))
      ) {
        next = capSelectionOdds(next, maxOver);
      }
      if (isYesishName(name)) next = capSelectionOdds(next, maxYes);
      return next;
    });
    return { ...market, selections };
  });
}
