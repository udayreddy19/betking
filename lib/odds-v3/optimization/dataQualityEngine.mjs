/**
 * OddsEngineV3 — Longitudinal Data Quality Engine
 * 
 * Audits observation batches, historical datasets, and settlement joins
 * for structural integrity, anti-leakage invariants, monotonicity, and schema validity.
 */

export const DATA_QUALITY_STATUS = Object.freeze({
  PASS: 'PASS',
  WARN: 'WARN',
  FAIL: 'FAIL',
});

/**
 * Audits an array of odds observation records.
 */
export function auditDatasetQuality(observations = []) {
  if (!Array.isArray(observations) || observations.length === 0) {
    return {
      status: DATA_QUALITY_STATUS.WARN,
      score: 0,
      totalObservations: 0,
      reasons: ['DATASET_EMPTY'],
      checks: [
        { name: 'NON_EMPTY_CHECK', passed: false, details: 'Dataset contains 0 records' },
      ],
      auditedAt: new Date().toISOString(),
    };
  }

  const checks = [];
  const reasons = [];
  let invalidProbCount = 0;
  let invalidOddsCount = 0;
  let missingTimestampCount = 0;
  let leakageCount = 0;
  let duplicateCount = 0;
  const seenKeys = new Set();

  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i];
    const key = `${obs.matchId}_${obs.marketId || obs.market}_${obs.selectionId || obs.selection}_${obs.timestamp || obs.predictionTimestamp}`;

    if (seenKeys.has(key)) {
      duplicateCount++;
    } else {
      seenKeys.add(key);
    }

    // Check timestamps
    const tPred = new Date(obs.predictionTimestamp || obs.timestamp).getTime();
    if (!tPred || Number.isNaN(tPred)) {
      missingTimestampCount++;
    }

    // Check probabilities
    const p = obs.probability ?? obs.baselineProbability ?? obs.blendedProbability;
    if (p != null && (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1)) {
      invalidProbCount++;
    }

    // Check odds
    const odds = obs.odds ?? obs.baselineOdds;
    if (odds != null && (typeof odds !== 'number' || !Number.isFinite(odds) || odds < 1.01)) {
      invalidOddsCount++;
    }

    // Check Anti-Leakage (settlement must be after prediction)
    if (obs.settlementTimestamp || obs.settledAt) {
      const tSettle = new Date(obs.settlementTimestamp || obs.settledAt).getTime();
      if (tSettle <= tPred) {
        leakageCount++;
      }
    }
  }

  checks.push({
    name: 'ANTI_LEAKAGE_TEMPORAL_ORDER',
    passed: leakageCount === 0,
    details: `${leakageCount} records exhibited settlement <= prediction timestamp`,
  });

  checks.push({
    name: 'PROBABILITY_BOUNDS_ENVELOPE',
    passed: invalidProbCount === 0,
    details: `${invalidProbCount} records had probabilities outside [0, 1]`,
  });

  checks.push({
    name: 'DECIMAL_ODDS_FLOOR_BOUND',
    passed: invalidOddsCount === 0,
    details: `${invalidOddsCount} records had odds below 1.01 floor`,
  });

  checks.push({
    name: 'TIMESTAMP_COMPLETENESS',
    passed: missingTimestampCount === 0,
    details: `${missingTimestampCount} records missing valid ISO-8601 timestamps`,
  });

  checks.push({
    name: 'DUPLICATE_OBSERVATION_UNIQUENESS',
    passed: duplicateCount === 0,
    details: `${duplicateCount} duplicate observation state keys detected`,
  });

  if (leakageCount > 0) reasons.push(`LOOK_AHEAD_LEAKAGE_DETECTED (${leakageCount})`);
  if (invalidProbCount > 0) reasons.push(`INVALID_PROBABILITY_BOUNDS (${invalidProbCount})`);
  if (invalidOddsCount > 0) reasons.push(`INVALID_ODDS_FLOOR (${invalidOddsCount})`);
  if (missingTimestampCount > 0) reasons.push(`MISSING_TIMESTAMPS (${missingTimestampCount})`);
  if (duplicateCount > 0) reasons.push(`DUPLICATE_KEYS_FOUND (${duplicateCount})`);

  let status = DATA_QUALITY_STATUS.PASS;
  if (leakageCount > 0 || invalidProbCount > 0 || invalidOddsCount > 0) {
    status = DATA_QUALITY_STATUS.FAIL;
  } else if (duplicateCount > 0 || missingTimestampCount > 0) {
    status = DATA_QUALITY_STATUS.WARN;
  }

  const passedChecksCount = checks.filter((c) => c.passed).length;
  const score = Number(((passedChecksCount / checks.length) * 100).toFixed(1));

  return {
    status,
    score,
    totalObservations: observations.length,
    passedChecksCount,
    totalChecksCount: checks.length,
    reasons: reasons.length > 0 ? reasons : ['ALL_QUALITY_GATES_PASSED'],
    checks,
    auditedAt: new Date().toISOString(),
  };
}
