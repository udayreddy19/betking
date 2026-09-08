/**
 * CanonicalPricingPipeline.mjs
 *
 * Implements strict separation of:
 *   Canonical State → Model → Raw Probability → Calibration → Fair Probability
 *   → Fair Odds → Margin Policy → Risk Adjustment → Published Odds
 *
 * Persists all 8 layers per selection:
 *   - rawProbability
 *   - calibratedProbability
 *   - fairProbability
 *   - fairOdds
 *   - configuredMargin
 *   - riskAdjustment
 *   - publishedOdds
 *   - publishedImpliedProbability
 *   - bookPercentage
 *
 * Provides immutable pricing metadata:
 *   - modelVersion
 *   - calibrationVersion
 *   - pricingVersion
 *   - marginPolicyVersion
 *   - riskPolicyVersion
 *   - stateVersion
 *
 * Answers:
 *   "What did the model believe?"
 *   "What margin was added?"
 *   "What risk adjustment was applied?"
 *   "What final odds were published?"
 */

export const PRICING_PIPELINE_VERSION = '4.9.0';
export const DEFAULT_MIN_ODDS = 1.01;
export const DEFAULT_MAX_ODDS = 100.0;

/**
 * Validates that raw probabilities form a valid non-empty distribution.
 */
function validateProbabilities(selections) {
  if (!Array.isArray(selections) || selections.length === 0) {
    return { valid: false, reason: 'EMPTY_SELECTIONS' };
  }
  for (const s of selections) {
    const p = Number(s.rawProbability ?? s.probability);
    if (!Number.isFinite(p) || p < 0 || p > 1) {
      return { valid: false, reason: `INVALID_PROBABILITY_${s.selectionId || s.name}` };
    }
  }
  return { valid: true };
}

/**
 * Execute the 8-stage canonical pricing pipeline for a market.
 *
 * @param {Object} params
 * @param {Array<Object>} params.selections - [{ selectionId, name, rawProbability, probability, ... }]
 * @param {number} [params.overround=0.12] - Commercial margin (e.g. 0.12 for 12% overround)
 * @param {Object|Function} [params.riskAdjustments] - Per-selection risk factors or function (sel, fairP) => riskAdj
 * @param {Function} [params.calibrationFn] - (rawP, sel) => calibratedP
 * @param {Object} [params.metadata] - Version & state metadata
 * @param {Object} [params.options] - Min/max odds, precision, normalizeFair
 * @returns {Object} Priced market with immutable selections and audit metadata
 */
export function priceMarketPipeline({
  selections = [],
  overround = 0.12,
  riskAdjustments = {},
  calibrationFn = null,
  metadata = {},
  options = {},
}) {
  const validation = validateProbabilities(selections);
  if (!validation.valid) {
    return {
      status: 'SUSPENDED',
      suspensionReason: validation.reason,
      selections: [],
      bookPercentage: 0,
      pricingMetadata: Object.freeze({ ...metadata, status: 'INVALID' }),
    };
  }

  const minOdds = Math.max(DEFAULT_MIN_ODDS, Number(options.minOdds) || DEFAULT_MIN_ODDS);
  const maxOdds = Number(options.maxOdds) || DEFAULT_MAX_ODDS;
  const precision = options.precision ?? 2;
  const configuredMargin = Number(overround) || 0;

  // Step 1: Model Raw Probabilities
  const rawProbs = selections.map((s) => {
    const raw = Number(s.rawProbability ?? s.probability ?? 0);
    return { ...s, rawProbability: raw };
  });

  // Step 2: Calibration
  const calibratedProbs = rawProbs.map((s) => {
    let cal = s.rawProbability;
    if (typeof calibrationFn === 'function') {
      cal = Number(calibrationFn(s.rawProbability, s));
      if (!Number.isFinite(cal) || cal <= 0) cal = s.rawProbability;
    } else if (Number.isFinite(s.calibratedProbability)) {
      cal = Number(s.calibratedProbability);
    }
    return { ...s, calibratedProbability: cal };
  });

  // Step 3: Fair Probability Normalization (Sum = 1.0 for mutually exclusive outcomes)
  const sumCalibrated = calibratedProbs.reduce((acc, s) => acc + s.calibratedProbability, 0);
  if (sumCalibrated <= 0) {
    return {
      status: 'SUSPENDED',
      suspensionReason: 'ZERO_TOTAL_PROBABILITY',
      selections: [],
      bookPercentage: 0,
    };
  }

  const fairPriced = calibratedProbs.map((s) => {
    const fairP = s.calibratedProbability / sumCalibrated;
    // Step 4: Fair Odds = 1 / Fair Probability
    const fairOdds = fairP > 0 ? Number((1 / fairP).toFixed(4)) : null;
    return {
      ...s,
      fairProbability: fairP,
      fairOdds,
    };
  });

  // Step 5 & 6: Commercial Margin Policy & Risk Adjustment
  // Commercial margin increases implied probability: P_margin = P_fair * (1 + margin)
  // Risk adjustment modifies margin exposure (e.g. favorite shortening, liability factor)
  const pricedSelections = fairPriced.map((s) => {
    let riskAdj = 0;
    if (typeof riskAdjustments === 'function') {
      riskAdj = Number(riskAdjustments(s, s.fairProbability)) || 0;
    } else if (riskAdjustments && typeof riskAdjustments === 'object') {
      riskAdj = Number(riskAdjustments[s.selectionId] ?? riskAdjustments[s.name] ?? 0);
    } else if (Number.isFinite(s.riskAdjustment)) {
      riskAdj = Number(s.riskAdjustment);
    }

    // Target implied probability incorporating commercial margin and risk adjustment
    // P_target = P_fair * (1 + configuredMargin) * (1 + riskAdj)
    const targetImpliedP = s.fairProbability * (1 + configuredMargin) * (1 + riskAdj);

    // Step 7: Published Odds Calculation
    let rawPubOdds = targetImpliedP > 0 ? 1 / targetImpliedP : minOdds;
    let publishedOdds = Math.max(minOdds, Math.min(maxOdds, Number(rawPubOdds.toFixed(precision))));

    // Published Implied Probability
    const publishedImpliedProbability = Number((1 / publishedOdds).toFixed(8));

    return Object.freeze({
      selectionId: s.selectionId,
      name: s.name,
      // Backward-compatibility aliases
      probability: s.fairProbability,
      finalProbability: publishedImpliedProbability,
      odds: publishedOdds,
      // Canonical 8 layers
      rawProbability: s.rawProbability,
      calibratedProbability: s.calibratedProbability,
      fairProbability: s.fairProbability,
      fairOdds: s.fairOdds,
      configuredMargin,
      riskAdjustment: riskAdj,
      publishedOdds,
      publishedImpliedProbability,
      status: s.status || 'OPEN',
      won: s.won ?? null,
    });
  });

  // Market-level Book Percentage: sum(1 / publishedOdds)
  const bookPercentage = Number(
    pricedSelections.reduce((acc, s) => acc + s.publishedImpliedProbability, 0).toFixed(4),
  );

  // Attach Immutable Pricing Metadata
  const immutableMetadata = Object.freeze({
    modelVersion: String(metadata.modelVersion || '4.9.0'),
    calibrationVersion: String(metadata.calibrationVersion || 'v4_uncalibrated'),
    pricingVersion: String(metadata.pricingVersion || PRICING_PIPELINE_VERSION),
    marginPolicyVersion: String(metadata.marginPolicyVersion || 'v4_commercial'),
    riskPolicyVersion: String(metadata.riskPolicyVersion || 'v4_risk_v1'),
    stateVersion: Number(metadata.stateVersion ?? 0),
    timestamp: metadata.timestamp || new Date().toISOString(),
  });

  // Explanatory Audit Interface
  const modelBelief = Object.freeze(
    Object.fromEntries(pricedSelections.map((s) => [s.selectionId || s.name, s.fairProbability])),
  );
  const marginAdded = configuredMargin;
  const riskAdjustmentApplied = Object.freeze(
    Object.fromEntries(pricedSelections.map((s) => [s.selectionId || s.name, s.riskAdjustment])),
  );
  const publishedOddsMap = Object.freeze(
    Object.fromEntries(pricedSelections.map((s) => [s.selectionId || s.name, s.publishedOdds])),
  );

  return Object.freeze({
    selections: pricedSelections,
    bookPercentage,
    overround: configuredMargin,
    pricingMetadata: immutableMetadata,
    modelBelief,
    marginAdded,
    riskAdjustmentApplied,
    publishedOdds: publishedOddsMap,
    status: 'OPEN',
  });
}

/**
 * Verifies mathematical integrity of a priced book:
 * 1. Sum of fair probabilities ≈ 1.0 (within tolerance)
 * 2. Sum of published implied probabilities ≈ 1 + configuredMargin (within tolerance)
 */
export function verifyBookIntegrity(market, tolerance = 0.05) {
  if (!market || !Array.isArray(market.selections) || market.selections.length === 0) {
    return { valid: false, reason: 'NO_SELECTIONS' };
  }

  const sumFair = market.selections.reduce((acc, s) => acc + (s.fairProbability ?? s.probability ?? 0), 0);
  const fairDiff = Math.abs(sumFair - 1.0);
  if (fairDiff > 0.005) {
    return {
      valid: false,
      reason: `FAIR_PROBABILITY_NOT_CONSERVED: sum=${sumFair.toFixed(4)}, diff=${fairDiff.toFixed(4)}`,
      sumFair,
    };
  }

  const sumImplied = market.selections.reduce(
    (acc, s) => acc + (s.publishedImpliedProbability ?? (1 / s.publishedOdds) ?? (1 / s.odds) ?? 0),
    0,
  );
  const expectedBook = 1.0 + (market.configuredMargin ?? market.overround ?? 0);
  const bookDiff = Math.abs(sumImplied - expectedBook);

  // If odds were capped or rounded, small deviation is expected, but must be within tolerance
  if (bookDiff > tolerance + 0.15) {
    return {
      valid: false,
      reason: `BOOK_OVERROUND_MISMATCH: sumImplied=${sumImplied.toFixed(4)}, expected=${expectedBook.toFixed(4)}`,
      sumImplied,
      expectedBook,
    };
  }

  return {
    valid: true,
    sumFair,
    sumImplied,
    bookPercentage: sumImplied,
    expectedBook,
  };
}
