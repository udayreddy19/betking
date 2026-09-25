/**
 * Bridge genuine settlement outcomes into V4 calibration stores.
 * Never fabricates observations — only links / records from real settle events.
 */

import { createLogger } from '../../logger.mjs';
import { productionObservationRecorder } from './ProductionObservationRecorder.mjs';
import { defaultObservationStore } from './ObservationStore.mjs';

const log = createLogger({ engine: 'calibrationBridge' });

/**
 * Best-effort prediction capture at bet acceptance (pre-margin if fair odds known).
 */
export function recordAcceptedBetPrediction({
  betId,
  matchId,
  marketId,
  selectionId,
  acceptedOdds,
  fairProbability,
  fairOdds,
  sport,
  engineVersion,
  modelVersion,
  matchState = {},
}) {
  try {
    const odds = Number(acceptedOdds);
    if (!matchId || !marketId || !selectionId || !(odds > 1)) return { recorded: false, reason: 'INVALID_INPUT' };

    const implied = 1 / odds;
    const p = fairProbability != null && Number(fairProbability) > 0 && Number(fairProbability) < 1
      ? Number(fairProbability)
      : Math.max(0.0001, Math.min(0.9999, implied));
    const fOdds = fairOdds != null && Number(fairOdds) > 1
      ? Number(fairOdds)
      : 1 / p;

    // Skip leakage reject if match already finished at placement
    const status = String(matchState.status || matchState.matchStatus || '').toLowerCase();
    if (['finished', 'completed', 'ended', 'closed', 'final'].includes(status)) {
      return { recorded: false, reason: 'MATCH_ALREADY_FINISHED' };
    }

    const obs = productionObservationRecorder.recordPrediction({
      providerEventId: String(matchId),
      internalEventId: String(betId || matchId),
      sport: String(sport || 'cricket').toLowerCase(),
      market: String(marketId),
      selection: String(selectionId),
      modelVersion: modelVersion || engineVersion || '4.9.0',
      fairProbability: p,
      fairOdds: fOdds,
      publishedOdds: odds,
      publishedImpliedProbability: implied,
      predictionTimestamp: new Date().toISOString(),
      matchState: {
        status: matchState.status || 'live',
        // strip winner/final fields
      },
      dataSource: 'BET_ACCEPTANCE',
    });
    return { recorded: true, observationId: obs.observationId };
  } catch (err) {
    log.warn('calibration_prediction_skip', { betId, err: err?.message });
    return { recorded: false, reason: err?.message || 'RECORD_FAILED' };
  }
}

/**
 * Link settlement outcome to prior prediction + durable ObservationStore.
 */
export function recordSettledCalibrationObservation({
  betId,
  matchId,
  marketId,
  selectionId,
  outcome,
  acceptedOdds,
  sport,
  engineVersion,
  settledAt,
}) {
  try {
    const norm = String(outcome || '').toUpperCase();
    if (!['WON', 'LOST', 'PUSH', 'VOID'].includes(norm)) {
      return { linked: false, reason: 'INVALID_OUTCOME' };
    }

    const link = productionObservationRecorder.linkAuthoritativeSettlement({
      providerEventId: String(matchId),
      internalEventId: String(betId || matchId),
      market: String(marketId || ''),
      selection: String(selectionId || ''),
      actualOutcome: norm,
      outcomeTimestamp: settledAt || new Date().toISOString(),
      settlementVersion: 'live_settlement_v1',
      evidence: { betId, source: 'liveMatchSettlement' },
    });

    // Only persist to ObservationStore when we have a pre-margin fairProbability prediction.
    // Never invent calibration samples from published (margin-laden) odds alone.
    if (link.linked && (norm === 'WON' || norm === 'LOST') && link.fairProbability != null) {
      defaultObservationStore.record({
        observationId: link.observationId || `settle_${betId}_${marketId}_${selectionId}`,
        eventId: String(matchId),
        marketId: String(marketId || ''),
        selectionId: String(selectionId || ''),
        modelVersion: engineVersion || '4.9.0',
        rawProbability: Number(link.fairProbability),
        calibratedProbability: Number(link.fairProbability),
        outcome: norm,
        settledAt: settledAt || new Date().toISOString(),
        sport: String(sport || 'cricket').toLowerCase(),
        providerReference: { betId, linked: true },
      });
    }

    return { linked: link.linked === true, reason: link.reason || null, observationId: link.observationId };
  } catch (err) {
    log.warn('calibration_settle_skip', { betId, err: err?.message });
    return { linked: false, reason: err?.message || 'LINK_FAILED' };
  }
}

export function getCalibrationValidationStatus({ sport } = {}) {
  const settled = productionObservationRecorder.countSettled(sport ? { sport } : {});
  const storeCount = defaultObservationStore.count(sport ? { sport } : {});
  const n = Math.max(settled, storeCount);
  let status = 'NO_DATA';
  if (n === 0) status = 'NO_DATA';
  else if (n < 100) status = 'INSUFFICIENT_SAMPLE';
  else if (n < 1000) status = 'VALIDATING';
  else status = 'VALIDATED';

  return {
    status,
    settledObservations: settled,
    storeObservations: storeCount,
    sampleSize: n,
    minimumForValidation: 1000,
    autoPromotionAllowed: false, // never auto-promote from this helper alone
    note: n < 1000
      ? 'Genuine sample below N≥1000 gate — AUTO_PROMOTION remains disabled'
      : 'Sample gate met — operator review still required before auto-promotion',
  };
}
