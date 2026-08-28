/**
 * OddsEngineV3 — Price Explainability Engine (Admin / Internal Only)
 * 
 * Generates transparent mathematical lineage records for any published selection price:
 * Base Probability + Provider Consensus + Model Blend + Margin + Risk/Latency Adjustments = Final Odds.
 * 
 * SECURITY INVARIANT:
 * This record is strictly for internal auditing, compliance, and trading desk diagnostics.
 * Sensitive model internals are NEVER exposed to client-facing endpoints.
 */

export function buildPriceExplainabilityRecord({
  matchId,
  sport = 'cricket',
  market = 'match_winner',
  selection = '1',
  baseProbability = 0.5,
  providerConsensus = 0.5,
  modelBlend = 0.5,
  margin = 0.05,
  liabilityAdjustment = 0.0,
  latencyAdjustment = 0.0,
  finalOdds = 1.90,
  engineVersion = '3.0.0',
  modelVersion = 'v3.1-prod',
  parameterVersion = 'params_v1.0_prod',
  timestamp = Date.now(),
} = {}) {
  const prob = Number(modelBlend || baseProbability || 0.5);
  const fairOdds = prob > 0 ? Number((1 / prob).toFixed(4)) : 2.0;
  const effectiveMargin = Number((margin + liabilityAdjustment + latencyAdjustment).toFixed(4));
  const expectedOdds = Number((1 / (prob * (1 + effectiveMargin))).toFixed(2));

  return {
    explainabilityId: `expl_${matchId}_${market}_${selection}_${timestamp}`,
    timestamp: new Date(timestamp).toISOString(),
    matchId: String(matchId),
    sport: String(sport).toLowerCase(),
    market: String(market),
    selection: String(selection),
    lineage: {
      rawSportModelProbability: Number(baseProbability.toFixed(4)),
      providerImpliedProbability: Number(providerConsensus.toFixed(4)),
      blendedModelProbability: Number(prob.toFixed(4)),
      fairUnmarginedOdds: fairOdds,
      baselineMargin: Number(margin.toFixed(4)),
      liabilityRiskAdjustment: Number(liabilityAdjustment.toFixed(4)),
      latencyCircuitAdjustment: Number(latencyAdjustment.toFixed(4)),
      effectiveTotalMargin: effectiveMargin,
      publishedFinalOdds: Number(finalOdds),
      reconstructedOdds: expectedOdds,
      pricingDeviation: Number(Math.abs(finalOdds - expectedOdds).toFixed(4)),
    },
    provenance: {
      engineVersion: String(engineVersion),
      modelVersion: String(modelVersion),
      parameterVersion: String(parameterVersion),
    },
  };
}
