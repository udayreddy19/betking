/**
 * OddsEngineV3 — Data Quality Engine
 * 
 * Audits historical datasets before backtesting or calibration:
 * - Detects future leakage (predictions timestamped after resolution)
 * - Detects missing outcomes
 * - Detects time-reversals
 * - Classifies dataset readiness: DATASET_VALID | DATASET_PARTIAL | DATASET_INVALID
 */

export function auditDatasetQuality(observations = []) {
  if (!Array.isArray(observations) || observations.length === 0) {
    return {
      status: 'DATASET_INVALID',
      qualityScore: 0,
      totalCount: 0,
      validCount: 0,
      issues: ['Dataset is empty'],
      metrics: {
        missingOutcomes: 0,
        futureLeakages: 0,
        outOfOrderTimestamps: 0,
        missingProviderData: 0,
      },
    };
  }

  const issues = [];
  let missingOutcomes = 0;
  let futureLeakages = 0;
  let outOfOrderTimestamps = 0;
  let missingProviderData = 0;

  for (let i = 0; i < observations.length; i++) {
    const curr = observations[i];
    const prev = i > 0 ? observations[i - 1] : null;

    if (prev && curr.timestamp < prev.timestamp) {
      outOfOrderTimestamps++;
    }

    if (curr.resolvedOutcome === null && curr.resolvedWinner === null) {
      missingOutcomes++;
    }

    if (curr.resolutionTimestamp && curr.timestamp > curr.resolutionTimestamp) {
      futureLeakages++;
      issues.push(`Future leakage at index ${i}: prediction timestamp (${curr.timestamp}) is after resolution (${curr.resolutionTimestamp})`);
    }

    if (!curr.providerOdds && !curr.providerInputs) {
      missingProviderData++;
    }
  }

  if (outOfOrderTimestamps > 0) {
    issues.push(`Detected ${outOfOrderTimestamps} out-of-order timestamps`);
  }

  if (missingOutcomes > 0) {
    issues.push(`Detected ${missingOutcomes} unverified / missing resolved outcomes`);
  }

  const validCount = observations.length - futureLeakages - outOfOrderTimestamps;
  let status = 'DATASET_VALID';

  if (futureLeakages > 0 || validCount === 0) {
    status = 'DATASET_INVALID';
  } else if (missingOutcomes > 0 || missingProviderData > (observations.length * 0.5)) {
    status = 'DATASET_PARTIAL';
  }

  const qualityScore = Number((Math.max(0, validCount - missingOutcomes * 0.5) / observations.length * 10).toFixed(1));

  return {
    status,
    qualityScore,
    totalCount: observations.length,
    validCount,
    issues,
    metrics: {
      missingOutcomes,
      futureLeakages,
      outOfOrderTimestamps,
      missingProviderData,
    },
  };
}
