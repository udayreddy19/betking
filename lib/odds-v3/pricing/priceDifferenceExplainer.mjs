/**
 * OddsEngineV3 — Price Difference Explainer (Internal Diagnostic Tool)
 * 
 * Explains step-by-step why published market odds changed between two observation timestamps:
 * Decomposes delta into:
 * - Match state progression (runs, wickets, balls, time remaining)
 * - Provider input shifts
 * - Probability model delta
 * - Margin & liability adjustments
 * - Latency & circuit breaker buffers
 */

export function explainPriceDifference(obs1, obs2) {
  if (!obs1 || !obs2) {
    return {
      status: 'INVALID_INPUT',
      error: 'Two valid observation snapshots required for comparison.',
    };
  }

  const prob1 = Number(obs1.predictionProbability ?? obs1.modelProbability ?? (1 / obs1.publishedOdds));
  const prob2 = Number(obs2.predictionProbability ?? obs2.modelProbability ?? (1 / obs2.publishedOdds));
  const probDelta = Number((prob2 - prob1).toFixed(4));

  const odds1 = Number(obs1.publishedOdds ?? obs1.newOdds ?? 2.0);
  const odds2 = Number(obs2.publishedOdds ?? obs2.newOdds ?? 2.0);
  const oddsDelta = Number((odds2 - odds1).toFixed(4));
  const oddsPctChange = odds1 > 0 ? Number((((odds2 - odds1) / odds1) * 100).toFixed(2)) : 0;

  const margin1 = Number(obs1.margin ?? 0.05);
  const margin2 = Number(obs2.margin ?? 0.05);
  const marginDelta = Number((margin2 - margin1).toFixed(4));

  const latency1 = Number(obs1.providerLatency ?? 0);
  const latency2 = Number(obs2.providerLatency ?? 0);
  const latencyDelta = latency2 - latency1;

  // Match state comparison
  const state1 = obs1.matchState || {};
  const state2 = obs2.matchState || {};
  const stateChanges = {};
  for (const key of ['runs', 'wickets', 'balls', 'ballsCompleted', 'score1', 'score2', 'currentInnings']) {
    if (state1[key] !== state2[key]) {
      stateChanges[key] = { from: state1[key], to: state2[key] };
    }
  }

  // Primary driver detection
  let primaryDriver = 'MODERATE_MODEL_DRIFT';
  if (Object.keys(stateChanges).length > 0) {
    primaryDriver = 'MATCH_STATE_EVENT'; // e.g. wicket fell, boundary scored
  } else if (Math.abs(marginDelta) > 0.02) {
    primaryDriver = 'MARGIN_RISK_SHADING';
  } else if (Math.abs(probDelta) > 0.10) {
    primaryDriver = 'PROVIDER_FEED_UPDATE';
  }

  return {
    status: 'EXPLAINED',
    matchId: obs1.matchId,
    market: obs1.marketId || obs1.market,
    selection: obs1.selectionId || obs1.selection,
    t1: obs1.timestamp ? new Date(obs1.timestamp).toISOString() : null,
    t2: obs2.timestamp ? new Date(obs2.timestamp).toISOString() : null,
    primaryDriver,
    decomposition: {
      initialOdds: odds1,
      finalOdds: odds2,
      oddsDelta,
      oddsPctChange,
      initialProbability: Number(prob1.toFixed(4)),
      finalProbability: Number(prob2.toFixed(4)),
      probabilityDelta: probDelta,
      initialMargin: margin1,
      finalMargin: margin2,
      marginDelta,
      latencyDeltaMs: latencyDelta,
      matchStateChanges: stateChanges,
    },
    modelVersionComparison: {
      initial: obs1.modelVersion || 'v3.1-prod',
      final: obs2.modelVersion || 'v3.1-prod',
      changed: obs1.modelVersion !== obs2.modelVersion,
    },
  };
}
