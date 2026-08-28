/**
 * OddsEngineV3 — Match Settlement Ingestion Pipeline
 * 
 * Ingests official settlement outcomes from verified game results and joins
 * them to archived prediction observations to generate empirical accuracy truth.
 * 
 * APPEND-ONLY: Never alters original prediction timestamps, states, or probabilities.
 */

/**
 * Ingests settlement result for a match/market and joins across all matching observations.
 */
export function ingestMarketSettlement({
  matchId,
  marketType = 'match_winner',
  winningSelection,
  settledAt = new Date().toISOString(),
  closingProbability = null,
  closingOdds = null,
  observations = [],
} = {}) {
  const matched = observations.filter(
    (obs) => obs.matchId === matchId && obs.marketType === marketType
  );

  const settledRecords = [];

  for (const obs of matched) {
    const isWin = obs.selection === winningSelection;
    const y = isWin ? 1 : 0;
    const p = Math.min(Math.max(obs.probability, 0.001), 0.999);

    // Brier Score contribution = (p - y)^2
    const brierContribution = Number(Math.pow(p - y, 2).toFixed(4));

    // LogLoss contribution = -(y*ln(p) + (1-y)*ln(1-p))
    const logLossContribution = Number(
      (-(y * Math.log(p) + (1 - y) * Math.log(1 - p))).toFixed(4)
    );

    // Calibration Bucket (10 buckets: [0.0-0.1] to [0.9-1.0])
    const bucketMin = Math.min(0.9, Math.floor(p * 10) / 10);
    const calibrationBucket = `[${bucketMin.toFixed(1)}-${(bucketMin + 0.1).toFixed(1)}]`;

    const updated = {
      ...obs,
      settlement: {
        settledAt,
        winningSelection,
        outcome: y,
        correct: isWin,
        brierContribution,
        logLossContribution,
        calibrationBucket,
        closingProbability: closingProbability ?? obs.probability,
        closingOdds: closingOdds ?? obs.decimalOdds,
      },
    };

    settledRecords.push(updated);
  }

  return {
    matchId,
    marketType,
    winningSelection,
    settledAt,
    settledCount: settledRecords.length,
    settledRecords,
    ingestedAt: new Date().toISOString(),
  };
}
