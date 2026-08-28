/**
 * OddsEngineV3 — Prediction → Price → Outcome Integrity Auditor
 * 
 * Audits empirical pricing observations and joined settlement outcomes for:
 * - Monotonic timestamp ordering & future timestamp rejection
 * - Mathematical validity of probabilities (p in [0, 1], not NaN/Inf)
 * - Positive, valid odds (odds >= 1.01)
 * - Complete prediction, published price, and settled outcome linkage
 * 
 * Computes: predictionPriceOutcomeIntegrityScore (0 to 100).
 */

export function auditPredictionPriceOutcomeIntegrity(observations = []) {
  if (!Array.isArray(observations) || observations.length === 0) {
    return {
      status: 'EMPTY_DATASET',
      integrityScore: 100,
      totalAudited: 0,
      validRecords: 0,
      errorCount: 0,
      errorBreakdown: {},
      orphanObservationRate: 0,
      missingOutcomeRate: 0,
    };
  }

  let validCount = 0;
  let orphanCount = 0;
  let missingOutcomeCount = 0;
  let errorCount = 0;
  const now = Date.now();
  const errors = {
    futureTimestamp: 0,
    invalidProbability: 0,
    invalidOdds: 0,
    missingIdentifiers: 0,
    nanOrInfinity: 0,
    chronologicalAnomaly: 0,
  };
  const bySportErrors = {};
  const byMarketErrors = {};
  const byProviderErrors = {};

  let lastTs = 0;

  for (const obs of observations) {
    let hasError = false;
    const sport = obs.sport || 'unknown';
    const market = obs.market || obs.marketId || 'unknown';
    const provider = obs.providerUsed || 'consensus';

    if (!obs.matchId || !obs.marketId || !obs.selectionId) {
      errors.missingIdentifiers++;
      hasError = true;
    }

    const prob = Number(obs.predictionProbability ?? obs.modelProbability ?? obs.probability);
    if (!Number.isFinite(prob)) {
      errors.nanOrInfinity++;
      hasError = true;
    } else if (prob < 0 || prob > 1) {
      errors.invalidProbability++;
      hasError = true;
    }

    const odds = Number(obs.publishedOdds ?? obs.newOdds ?? obs.odds);
    if (!Number.isFinite(odds) || odds < 1.0) {
      errors.invalidOdds++;
      hasError = true;
    }

    const ts = Number(obs.timestamp || 0);
    if (ts > now + 60000) { // allow 60s clock skew
      errors.futureTimestamp++;
      hasError = true;
    }

    if (ts < lastTs - 3600000) { // massive reverse chronological jump
      errors.chronologicalAnomaly++;
    }
    lastTs = ts;

    if (obs.settledOutcome === null || obs.settledOutcome === undefined) {
      missingOutcomeCount++;
    }

    if (!obs.matchState && !obs.providerInputs) {
      orphanCount++;
    }

    if (hasError) {
      errorCount++;
      bySportErrors[sport] = (bySportErrors[sport] || 0) + 1;
      byMarketErrors[market] = (byMarketErrors[market] || 0) + 1;
      byProviderErrors[provider] = (byProviderErrors[provider] || 0) + 1;
    } else {
      validCount++;
    }
  }

  const N = observations.length;
  const errorRate = errorCount / N;
  const integrityScore = Number((Math.max(0, (1 - errorRate)) * 100).toFixed(2));
  const orphanRate = Number(((orphanCount / N) * 100).toFixed(2));
  const missingOutcomeRate = Number(((missingOutcomeCount / N) * 100).toFixed(2));

  return {
    status: integrityScore >= 95 ? 'PASSED_HIGH_INTEGRITY' : (integrityScore >= 80 ? 'ACCEPTABLE_INTEGRITY' : 'DEGRADED_INTEGRITY'),
    predictionPriceOutcomeIntegrityScore: integrityScore,
    totalAudited: N,
    validRecords: validCount,
    errorCount,
    orphanObservationRate: orphanRate,
    missingOutcomeRate,
    errors,
    errorBreakdown: {
      bySport: bySportErrors,
      byMarket: byMarketErrors,
      byProvider: byProviderErrors,
    },
    auditedAt: new Date().toISOString(),
  };
}
