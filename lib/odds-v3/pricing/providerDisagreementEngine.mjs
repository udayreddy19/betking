/**
 * OddsEngineV3 — Provider Disagreement & Consensus Spread Engine
 * 
 * Analyzes multi-provider odds and implied probability divergence across live feeds.
 * Classifies divergence level (LOW, MEDIUM, HIGH, EXTREME) and triggers safety actions:
 * - LOW (prob diff < 0.05): Normal baseline pricing
 * - MEDIUM (prob diff 0.05 - 0.10): Shading / confidence penalty
 * - HIGH (prob diff 0.10 - 0.18): Defensive margin widening
 * - EXTREME (prob diff > 0.18): Circuit-breaker suspension / delay
 */

export const DISAGREEMENT_LEVELS = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  EXTREME: 'EXTREME',
});

export const DISAGREEMENT_ACTIONS = Object.freeze({
  CONTINUE_BASELINE: 'CONTINUE_BASELINE',
  SHADE_CONFIDENCE: 'SHADE_CONFIDENCE',
  REDUCE_CONFIDENCE: 'REDUCE_CONFIDENCE',
  SUSPEND_OR_DELAY: 'SUSPEND_OR_DELAY',
});

/**
 * Evaluates provider disagreement for a selection across multiple provider quotes.
 * 
 * @param {Array<{ provider: string, odds: number, probability?: number }>} providerQuotes
 * @param {Object} [options]
 * @returns {Object} Disagreement analysis and recommended action
 */
export function evaluateProviderDisagreement(providerQuotes = [], options = {}) {
  if (!Array.isArray(providerQuotes) || providerQuotes.length < 2) {
    return {
      level: DISAGREEMENT_LEVELS.LOW,
      action: DISAGREEMENT_ACTIONS.CONTINUE_BASELINE,
      maxProbDiff: 0,
      maxOddsDiff: 0,
      consensusSpread: 0,
      quoteCount: providerQuotes.length,
      marginAdjustment: 0,
      reason: 'Single provider or empty quotes; standard baseline applied.',
    };
  }

  const validQuotes = providerQuotes
    .filter((q) => Number.isFinite(q.odds) && q.odds > 1.0)
    .map((q) => ({
      provider: q.provider || 'unknown',
      odds: Number(q.odds),
      prob: Number(q.probability ?? (1 / q.odds)),
    }));

  if (validQuotes.length < 2) {
    return {
      level: DISAGREEMENT_LEVELS.LOW,
      action: DISAGREEMENT_ACTIONS.CONTINUE_BASELINE,
      maxProbDiff: 0,
      maxOddsDiff: 0,
      consensusSpread: 0,
      quoteCount: validQuotes.length,
      marginAdjustment: 0,
      reason: 'Insufficient valid quotes for multi-provider comparison.',
    };
  }

  const probs = validQuotes.map((q) => q.prob);
  const oddsList = validQuotes.map((q) => q.odds);

  const minProb = Math.min(...probs);
  const maxProb = Math.max(...probs);
  const maxProbDiff = Number((maxProb - minProb).toFixed(4));

  const minOdds = Math.min(...oddsList);
  const maxOdds = Math.max(...oddsList);
  const maxOddsDiff = Number((maxOdds - minOdds).toFixed(4));
  const consensusSpread = Number(((maxOddsDiff / minOdds) * 100).toFixed(2));

  let level = DISAGREEMENT_LEVELS.LOW;
  let action = DISAGREEMENT_ACTIONS.CONTINUE_BASELINE;
  let marginAdjustment = 0;
  let reason = 'Provider quotes are in close alignment.';

  if (maxProbDiff > 0.18 || consensusSpread > 35) {
    level = DISAGREEMENT_LEVELS.EXTREME;
    action = DISAGREEMENT_ACTIONS.SUSPEND_OR_DELAY;
    marginAdjustment = 0.05;
    reason = `Extreme provider divergence (prob diff ${maxProbDiff}, spread ${consensusSpread}%). Market should be suspended or delayed.`;
  } else if (maxProbDiff > 0.10 || consensusSpread > 20) {
    level = DISAGREEMENT_LEVELS.HIGH;
    action = DISAGREEMENT_ACTIONS.REDUCE_CONFIDENCE;
    marginAdjustment = 0.03;
    reason = `High provider divergence (prob diff ${maxProbDiff}). Defensive margin expansion recommended.`;
  } else if (maxProbDiff > 0.05 || consensusSpread > 10) {
    level = DISAGREEMENT_LEVELS.MEDIUM;
    action = DISAGREEMENT_ACTIONS.SHADE_CONFIDENCE;
    marginAdjustment = 0.015;
    reason = `Moderate provider spread (prob diff ${maxProbDiff}). Slight margin buffer applied.`;
  }

  return {
    level,
    action,
    maxProbDiff,
    maxOddsDiff,
    consensusSpreadPercent: consensusSpread,
    quoteCount: validQuotes.length,
    marginAdjustment,
    quotes: validQuotes,
    reason,
    evaluatedAt: new Date().toISOString(),
  };
}
