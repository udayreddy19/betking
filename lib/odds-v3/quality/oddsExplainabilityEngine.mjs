/**
 * OddsEngineV3 — Deterministic Odds Explainability & Audit Engine
 * 
 * Generates transparent, human-readable root-cause explanations for every
 * odds movement and market transition across the engine.
 * 
 * INTERNAL TRADER / AUDIT LOGS ONLY.
 */

export const EXPLANATION_CAUSES = Object.freeze({
  EVENT: 'EVENT',
  PROVIDER_UPDATE: 'PROVIDER_UPDATE',
  MODEL_UPDATE: 'MODEL_UPDATE',
  CALIBRATION: 'CALIBRATION',
  REGIME_CHANGE: 'REGIME_CHANGE',
  MARGIN_CHANGE: 'MARGIN_CHANGE',
  NOISE_FILTER: 'NOISE_FILTER',
  STALE_PROVIDER: 'STALE_PROVIDER',
  MARKET_REBALANCE: 'MARKET_REBALANCE',
});

/**
 * Generates a structured explanation for an odds change.
 */
export function explainOddsMovement({
  matchId,
  marketId,
  selectionId,
  previousOdds,
  newOdds,
  previousProbability,
  newProbability,
  matchStateEvent = null,
  regimeChanged = false,
  newRegime = null,
  providerDivergence = 0.02,
  noiseFiltered = false,
} = {}) {
  let primaryCause = EXPLANATION_CAUSES.MODEL_UPDATE;
  const secondaryCauses = [];
  let summary = 'Standard model transition based on live match state.';

  if (matchStateEvent) {
    primaryCause = EXPLANATION_CAUSES.EVENT;
    summary = `Odds updated immediately due to verified match event: ${matchStateEvent}.`;
  } else if (noiseFiltered) {
    primaryCause = EXPLANATION_CAUSES.NOISE_FILTER;
    summary = 'Odds smoothed by noise filter to dampen spurious provider divergence.';
    secondaryCauses.push(`Provider divergence: ${(providerDivergence * 100).toFixed(1)}%`);
  } else if (regimeChanged) {
    primaryCause = EXPLANATION_CAUSES.REGIME_CHANGE;
    summary = `Operational regime shifted to ${newRegime}. Dynamic weights adjusted.`;
  } else if (Math.abs(newOdds - previousOdds) > 0.10 && providerDivergence > 0.05) {
    primaryCause = EXPLANATION_CAUSES.PROVIDER_UPDATE;
    summary = 'Odds adjusted following consensus movement across external feeds.';
  }

  return {
    matchId,
    marketId,
    selectionId,
    primaryCause,
    secondaryCauses,
    summary,
    transition: {
      probabilityBefore: previousProbability,
      probabilityAfter: newProbability,
      oddsBefore: previousOdds,
      oddsAfter: newOdds,
      deltaOdds: Number((newOdds - previousOdds).toFixed(4)),
    },
    explainedAt: new Date().toISOString(),
  };
}
