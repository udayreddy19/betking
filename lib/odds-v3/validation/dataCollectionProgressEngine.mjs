/**
 * OddsEngineV3 — Longitudinal Data Collection Progress Engine
 * 
 * Tracks real-time accumulation of shadow predictions and settled ground-truth observations
 * against the mandatory Phase 26 sample-size gate (N >= 1,000).
 */

const TARGET_SAMPLE_GATE = 1000;

/**
 * Computes live data collection progress statistics.
 */
export function calculateCollectionProgress({
  observations = [],
  targetSampleGate = TARGET_SAMPLE_GATE,
} = {}) {
  const totalObservations = observations.length;
  const settledObservations = observations.filter((o) => o.settlement != null).length;
  const pendingSettlement = totalObservations - settledObservations;

  const settlementPct = totalObservations > 0 ? Number(((settledObservations / totalObservations) * 100).toFixed(1)) : 0;
  const sampleRemaining = Math.max(0, targetSampleGate - settledObservations);

  // Group by Sport
  const bySport = {};
  // Group by Market
  const byMarket = {};
  // Group by Model
  const byModel = {};

  for (const obs of observations) {
    const s = obs.sport || 'cricket';
    const m = obs.marketType || obs.market || 'match_winner';
    const mod = obs.modelVersion || 'v3.1-prod';

    bySport[s] = (bySport[s] || 0) + 1;
    byMarket[m] = (byMarket[m] || 0) + 1;
    byModel[mod] = (byModel[mod] || 0) + 1;
  }

  let status = 'COLLECTING';
  if (totalObservations === 0) {
    status = 'NOT_STARTED';
  } else if (settledObservations < targetSampleGate) {
    status = 'INSUFFICIENT_DATA';
  } else {
    status = 'VALIDATION_READY';
  }

  return {
    status,
    totalObservations,
    settledObservations,
    pendingSettlement,
    settlementPercentage: settlementPct,
    targetSampleGate,
    sampleRemaining,
    progressFraction: Number((settledObservations / targetSampleGate).toFixed(3)),
    bySport,
    byMarket,
    byModel,
    evaluatedAt: new Date().toISOString(),
  };
}
