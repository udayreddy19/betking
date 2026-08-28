/**
 * OddsEngineV3 — Settlement Labeling & Ground Truth Engine
 * 
 * Assigns immutable ground truth labels (WIN, LOSE, PUSH, VOID, CANCELLED) to historical pricing observations.
 * Strictly verifies anti-leakage invariants:
 * 1. Prediction timestamp MUST be strictly less than settlement outcome timestamp.
 * 2. Unresolved / UNKNOWN records are excluded from training datasets.
 */

export const SETTLEMENT_LABELS = Object.freeze({
  WIN: 'WIN',
  LOSE: 'LOSE',
  PUSH: 'PUSH',
  VOID: 'VOID',
  CANCELLED: 'CANCELLED',
  UNKNOWN: 'UNKNOWN',
});

/**
 * Labels an observation with authoritative settlement results.
 * 
 * @param {Object} observation - The historical observation record
 * @param {Object} outcomeEvent - The settlement event with ground truth
 * @returns {Object} Labeled observation with verification status
 */
export function labelObservationWithSettlement(observation, outcomeEvent) {
  if (!observation || !outcomeEvent) {
    return {
      ...observation,
      settledOutcome: SETTLEMENT_LABELS.UNKNOWN,
      labelingStatus: 'MISSING_DATA',
      leakageDetected: false,
    };
  }

  const predTs = Number(observation.timestamp || 0);
  const outcomeTs = Number(outcomeEvent.settledAt || outcomeEvent.timestamp || Date.now());

  // Strict anti-leakage check
  if (predTs >= outcomeTs) {
    return {
      ...observation,
      settledOutcome: SETTLEMENT_LABELS.UNKNOWN,
      labelingStatus: 'REJECTED_FUTURE_LEAKAGE',
      leakageDetected: true,
      error: `Observation timestamp (${predTs}) is >= outcome timestamp (${outcomeTs})`,
    };
  }

  let label = SETTLEMENT_LABELS.UNKNOWN;
  if (outcomeEvent.status === 'VOID' || outcomeEvent.outcome === 'VOID') {
    label = SETTLEMENT_LABELS.VOID;
  } else if (outcomeEvent.status === 'CANCELLED' || outcomeEvent.outcome === 'CANCELLED') {
    label = SETTLEMENT_LABELS.CANCELLED;
  } else if (outcomeEvent.winningSelectionId) {
    const isWinner = String(observation.selectionId || observation.selection) === String(outcomeEvent.winningSelectionId);
    label = isWinner ? SETTLEMENT_LABELS.WIN : SETTLEMENT_LABELS.LOSE;
  } else if (outcomeEvent.won !== undefined) {
    label = outcomeEvent.won ? SETTLEMENT_LABELS.WIN : SETTLEMENT_LABELS.LOSE;
  }

  return {
    ...observation,
    settledOutcome: label,
    settledAt: outcomeTs,
    labelingStatus: 'VALID_LABEL',
    leakageDetected: false,
  };
}

/**
 * Batch labels a collection of observations.
 */
export function batchLabelObservations(observations = [], settlementEvents = new Map()) {
  const labeled = [];
  let validCount = 0;
  let leakageCount = 0;
  let unknownCount = 0;

  for (const obs of observations) {
    const key = `${obs.matchId}:${obs.marketId || obs.market}`;
    const event = settlementEvents.get(key) || settlementEvents.get(obs.matchId);
    const res = labelObservationWithSettlement(obs, event);
    labeled.push(res);

    if (res.leakageDetected) leakageCount++;
    else if (res.settledOutcome === SETTLEMENT_LABELS.UNKNOWN) unknownCount++;
    else validCount++;
  }

  return {
    totalProcessed: observations.length,
    validLabeledCount: validCount,
    leakageRejectedCount: leakageCount,
    unknownCount,
    labeledObservations: labeled,
    labelQualityScore: observations.length > 0
      ? Number((((validCount) / observations.length) * 100).toFixed(2))
      : 100,
  };
}
