/**
 * OddsEngineV3 — MarginCalculator
 * 
 * Applies bookmaker overround (margin) to fair probabilities.
 * 
 * ═══════════════════════════════════════════════════════════════
 * MARGIN FORMULA (Proportional Method)
 * ═══════════════════════════════════════════════════════════════
 * 
 * Given:
 *   P1 = raw probability of selection 1
 *   P2 = raw probability of selection 2
 *   P1 + P2 = 1.0
 *   overround = configured margin (e.g. 0.05 for 5%)
 * 
 * Margined probabilities:
 *   P1_margined = P1 * (1 + overround)
 *   P2_margined = P2 * (1 + overround)
 * 
 * Margined odds:
 *   odds1 = 1 / P1_margined
 *   odds2 = 1 / P2_margined
 * 
 * Verification:
 *   (1/odds1) + (1/odds2) = P1_margined + P2_margined = 1 + overround
 * 
 * This is the standard "proportional" or "balanced" margin method
 * used by most sportsbooks. Each selection's implied probability
 * is inflated equally by the overround proportion.
 * ═══════════════════════════════════════════════════════════════
 */

import { calculateDynamicOverround } from './dynamicMarginEngine.mjs';

/**
 * Default margin configuration.
 * All values are overround fractions (e.g. 0.05 = 5%).
 */
export const DEFAULT_MARGIN_CONFIG = Object.freeze({
  liveMatchWinnerOverround: 0.05,
  // Higher live totals margin — soft Overs were printing for ladder bettors
  liveTeamTotalOverround: 0.10,
  liveMatchTotalOverround: 0.10,
  /** Extra overround applied only to Over side (asymmetric) */
  liveTotalsOverExtraOverround: 0.03,
  /** Cap soft live Over odds */
  maxLiveTotalOverOdds: 1.65,
});

/** Live team/match total Over must not be sold soft — was 2.2+, then 1.85. */
export const MAX_LIVE_TOTAL_OVER_ODDS = 1.65;

/** SRL / sim leagues — tighter book (not disabled). */
export const SRL_MARGIN_CONFIG = Object.freeze({
  liveMatchWinnerOverround: 0.07,
  liveTeamTotalOverround: 0.14,
  liveMatchTotalOverround: 0.14,
  liveTotalsOverExtraOverround: 0.04,
  maxLiveTotalOverOdds: 1.55,
});

/** Decimal odds must never be 1.00 — that is a lock the book would pay at even money. */
export const MIN_DECIMAL_ODDS = 1.01;
const MAX_MARGINED_PROBABILITY = 1 / MIN_DECIMAL_ODDS;

/**
 * Applies margin to a pair of fair probabilities.
 * 
 * @param {number} probability - Raw probability for this selection (0 < p < 1)
 * @param {number} overround   - Overround fraction (e.g. 0.05)
 * @param {Object} [dynamicOpts] - Optional dynamic margin inputs (isLive, volatilityScore, feedLatencyMs)
 * @returns {{ finalProbability: number, odds: number, margin: number }}
 */
export function applyMargin(probability, overround, dynamicOpts = {}) {
  if (typeof probability !== 'number' || !Number.isFinite(probability) || Number.isNaN(probability)) {
    throw new Error(`MarginCalculator: invalid probability ${probability} (non-finite or NaN)`);
  }
  if (probability <= 0 || probability >= 1) {
    throw new Error(`MarginCalculator: invalid probability ${probability} (must be in range (0, 1))`);
  }
  if (typeof overround !== 'number' || !Number.isFinite(overround) || Number.isNaN(overround) || overround < 0 || overround > 1) {
    throw new Error(`MarginCalculator: invalid overround ${overround}`);
  }

  const effectiveOverround = calculateDynamicOverround({
    baseOverround: overround,
    isLive: dynamicOpts.isLive || false,
    volatilityScore: dynamicOpts.volatilityScore || 0,
    feedLatencyMs: dynamicOpts.feedLatencyMs || 0,
  });

  // Cap so displayed odds are always >= 1.01 (never 1.00 / 1.0001 rounded to 1.00)
  const unroundedFinalP = probability * (1 + effectiveOverround);
  const finalProbability = Math.min(MAX_MARGINED_PROBABILITY, unroundedFinalP);
  const odds = 1 / finalProbability;

  if (!Number.isFinite(odds) || Number.isNaN(odds) || odds <= 1.0) {
    throw new Error(`MarginCalculator: invalid calculated odds ${odds} for probability ${probability}`);
  }

  return {
    finalProbability,
    odds: Number(odds.toFixed(4)),
    margin: effectiveOverround,
  };
}

/**
 * Price mutually exclusive outcomes with proportional margin, re-normalizing after
 * the MIN_DECIMAL_ODDS floor so book overround cannot invert below target.
 *
 * @param {Array<{ selectionId: string, name: string, probability: number }>} outcomes
 * @param {number} overround
 * @returns {{ suspended: boolean, reason?: string, selections: object[] }}
 */
export function priceExclusiveOutcomes(outcomes, overround) {
  if (!Array.isArray(outcomes) || outcomes.length < 2) {
    throw new Error('MarginCalculator: priceExclusiveOutcomes requires at least 2 outcomes');
  }
  if (typeof overround !== 'number' || !Number.isFinite(overround) || overround < 0 || overround > 1) {
    throw new Error(`MarginCalculator: invalid overround ${overround}`);
  }

  for (const o of outcomes) {
    const p = o?.probability;
    if (typeof p !== 'number' || !Number.isFinite(p) || p <= 0) {
      return { suspended: true, reason: 'invalid_probability', selections: [] };
    }
  }

  const fairSum = outcomes.reduce((acc, o) => acc + o.probability, 0);
  if (fairSum <= 0 || !Number.isFinite(fairSum)) {
    return { suspended: true, reason: 'invalid_sum', selections: [] };
  }

  const normalized = outcomes.map((o) => ({
    ...o,
    fairP: o.probability / fairSum,
  }));
  const targetTotal = 1 + overround;

  let margined = normalized.map((o) => o.fairP * (1 + overround));

  for (let iter = 0; iter < outcomes.length + 3; iter += 1) {
    const capped = margined.map((p) => Math.min(MAX_MARGINED_PROBABILITY, p));
    let total = capped.reduce((acc, p) => acc + p, 0);

    if (total >= targetTotal - 0.0001) {
      margined = capped;
      break;
    }

    const deficit = targetTotal - total;
    const flexible = capped
      .map((p, idx) => ({ idx, headroom: MAX_MARGINED_PROBABILITY - p }))
      .filter((entry) => entry.headroom > 0.00001);

    if (flexible.length === 0) {
      return { suspended: true, reason: 'overround_inverted', selections: [] };
    }

    const headroomSum = flexible.reduce((acc, entry) => acc + entry.headroom, 0);
    const next = [...capped];
    for (const entry of flexible) {
      const add = Math.min(entry.headroom, deficit * (entry.headroom / headroomSum));
      next[entry.idx] += add;
    }
    margined = next;
  }

  const finalTotal = margined.reduce((acc, p) => acc + p, 0);
  if (finalTotal <= 1.0 + 0.0001) {
    return { suspended: true, reason: 'overround_inverted', selections: [] };
  }

  const selections = normalized.map((o, i) => {
    const finalP = margined[i];
    const odds = 1 / finalP;
    if (!Number.isFinite(odds) || odds < MIN_DECIMAL_ODDS) {
      return null;
    }
    return {
      selectionId: o.selectionId,
      name: o.name,
      probability: o.fairP,
      margin: overround,
      finalProbability: finalP,
      odds: Number(odds.toFixed(4)),
    };
  });

  if (selections.some((s) => !s)) {
    return { suspended: true, reason: 'lock_price', selections: [] };
  }

  return { suspended: false, selections };
}
