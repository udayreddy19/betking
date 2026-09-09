/**
 * ProductionObservationRecorder.mjs
 *
 * Production observation recorder & outcome linker for OddsEngineV4 and OtherSportsEngineV4.
 * Enforces Phase 4 requirements:
 *   - Captures prediction BEFORE commercial margin (fairProbability is model prediction).
 *   - Strictly forbids calibrating models with margin-adjusted published odds.
 *   - Deterministic outcome linking via providerEventId + marketId + selectionId.
 *   - Temporal Leakage Guarantee: predictionTimestamp < outcomeTimestamp.
 *   - Future-Information Leakage Prevention: rejects any observation containing future data.
 *   - Chronological dataset partitioning (Train -> Calibration -> Holdout).
 */

import fs from 'fs';
import path from 'path';

export const LEAKAGE_ERROR_CODES = {
  PREDICTION_AFTER_OUTCOME: 'TEMPORAL_LEAKAGE_PREDICTION_AFTER_OUTCOME',
  PREDICTION_EQUALS_OUTCOME: 'TEMPORAL_LEAKAGE_PREDICTION_AT_OUTCOME',
  FUTURE_SCORE_LEAKAGE: 'FUTURE_DATA_LEAKAGE_FINAL_SCORE',
  FUTURE_WICKETS_LEAKAGE: 'FUTURE_DATA_LEAKAGE_FUTURE_WICKETS',
  FUTURE_GOALS_LEAKAGE: 'FUTURE_DATA_LEAKAGE_FUTURE_GOALS',
  FUTURE_CARDS_LEAKAGE: 'FUTURE_DATA_LEAKAGE_FUTURE_CARDS',
  FUTURE_SETS_LEAKAGE: 'FUTURE_DATA_LEAKAGE_FUTURE_SETS',
  FUTURE_INNINGS_LEAKAGE: 'FUTURE_DATA_LEAKAGE_FUTURE_INNINGS',
  FUTURE_PROVIDER_PRICES: 'FUTURE_DATA_LEAKAGE_FUTURE_PROVIDER_PRICES',
  FUTURE_MATCH_STATUS: 'FUTURE_DATA_LEAKAGE_MATCH_FINISHED_AT_PREDICTION',
};

export class ProductionObservationRecorder {
  constructor(options = {}) {
    this.storagePath = options.storagePath || path.resolve(process.cwd(), 'data/calibration/production_observations.json');
    this.observations = new Map(); // observationId -> record
    this.lookupIndex = new Map(); // `${eventId}::${marketId}::${selectionId}` -> observationId
    this.dbQuery = options.dbQuery || null;
    this.loadFromFile();
  }

  loadFromFile() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const obs of list) {
            this.observations.set(obs.observationId, obs);
            const key = this._buildLookupKey(obs.providerEventId || obs.internalEventId, obs.market, obs.selection);
            this.lookupIndex.set(key, obs.observationId);
          }
        }
      }
    } catch {
      // Non-fatal fallback
    }
  }

  saveToFile() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const list = Array.from(this.observations.values());
      fs.writeFileSync(this.storagePath, JSON.stringify(list, null, 2), 'utf-8');
    } catch {
      // Non-fatal
    }
  }

  _buildLookupKey(eventId, market, selection) {
    return `${String(eventId || '').trim()}::${String(market || '').trim()}::${String(selection || '').trim()}`;
  }

  /**
   * Validates that the prediction matchState does not contain future knowledge.
   */
  validatePredictionStateNoLeakage(matchState = {}) {
    if (!matchState || typeof matchState !== 'object') return { valid: true };

    // 1. Cannot predict on an already completed/finished match
    const status = String(matchState.status || matchState.matchStatus || '').toLowerCase();
    if (['finished', 'completed', 'ended', 'closed', 'final'].includes(status)) {
      return { valid: false, code: LEAKAGE_ERROR_CODES.FUTURE_MATCH_STATUS, message: 'Match is already finished at prediction time.' };
    }

    // 2. Cannot have final outcome / winner populated in prediction state
    if (matchState.winner || matchState.matchWinner || matchState.winner_side) {
      return { valid: false, code: LEAKAGE_ERROR_CODES.FUTURE_MATCH_STATUS, message: 'Winner is already populated in prediction matchState.' };
    }

    // 3. Final score leakage
    if (matchState.finalScore || matchState.final_result || matchState.resultSummary) {
      return { valid: false, code: LEAKAGE_ERROR_CODES.FUTURE_SCORE_LEAKAGE, message: 'Final score is present in prediction matchState.' };
    }

    // 4. Future wickets leakage (e.g. all-out status or wickets > max in innings)
    if (matchState.futureWickets || matchState.inningsWicketsRemaining === 0 && matchState.inningsBallsRemaining > 0) {
      return { valid: false, code: LEAKAGE_ERROR_CODES.FUTURE_WICKETS_LEAKAGE, message: 'Future wickets leaked into matchState.' };
    }

    // 5. Future goals leakage
    if (matchState.futureGoals || matchState.ftScoreHome != null || matchState.ftScoreAway != null) {
      return { valid: false, code: LEAKAGE_ERROR_CODES.FUTURE_GOALS_LEAKAGE, message: 'Full time score leaked into live prediction matchState.' };
    }

    // 6. Future sets leakage (tennis)
    if (matchState.finalSetScore || matchState.completedMatchSets != null && matchState.status === 'live') {
      return { valid: false, code: LEAKAGE_ERROR_CODES.FUTURE_SETS_LEAKAGE, message: 'Future sets leaked into prediction matchState.' };
    }

    // 7. Future provider prices
    if (matchState.postMatchProviderOdds || matchState.closingProviderOdds) {
      return { valid: false, code: LEAKAGE_ERROR_CODES.FUTURE_PROVIDER_PRICES, message: 'Closing/post-match provider odds leaked into prediction state.' };
    }

    return { valid: true };
  }

  /**
   * Records an eligible model prediction BEFORE commercial margin is applied.
   */
  recordPrediction(data = {}) {
    const {
      providerEventId,
      internalEventId,
      sport,
      format,
      competition,
      market,
      selection,
      modelVersion,
      pricingVersion,
      stateVersion,
      predictionTimestamp,
      fairProbability,
      fairOdds,
      publishedOdds,
      publishedImpliedProbability,
      providerOdds,
      matchState = {},
      dataSource = 'ODDSYRA_CANONICAL_FEED',
    } = data;

    // Required fields check
    if (!providerEventId && !internalEventId) {
      throw new Error('MISSING_EVENT_IDENTIFIER: providerEventId or internalEventId required.');
    }
    if (!market || !selection) {
      throw new Error('MISSING_MARKET_IDENTIFIER: market and selection required.');
    }
    if (fairProbability == null || isNaN(fairProbability) || fairProbability <= 0 || fairProbability >= 1) {
      throw new Error(`INVALID_FAIR_PROBABILITY: Must be strictly between 0 and 1, received: ${fairProbability}`);
    }
    if (fairOdds == null || isNaN(fairOdds) || fairOdds <= 1.0) {
      throw new Error(`INVALID_FAIR_ODDS: Must be strictly greater than 1.0, received: ${fairOdds}`);
    }

    // Mathematical integrity check: fairProbability * fairOdds should be close to 1
    const impliedProd = fairProbability * fairOdds;
    if (Math.abs(impliedProd - 1.0) > 0.05) {
      throw new Error(`FAIR_ODDS_MATHEMATICAL_MISMATCH: fairProbability (${fairProbability}) and fairOdds (${fairOdds}) product is ${impliedProd}, expected ≈ 1.0`);
    }

    // Leakage check on matchState
    const leakageCheck = this.validatePredictionStateNoLeakage(matchState);
    if (!leakageCheck.valid) {
      throw new Error(`${leakageCheck.code}: ${leakageCheck.message}`);
    }

    const pTimestamp = predictionTimestamp ? new Date(predictionTimestamp).getTime() : Date.now();
    if (isNaN(pTimestamp)) {
      throw new Error('INVALID_PREDICTION_TIMESTAMP: Must be a valid ISO string or epoch millis.');
    }

    const eventKey = providerEventId || internalEventId;
    const observationId = `obs_${sport || 'gen'}_${eventKey}_${market}_${selection}_${pTimestamp}`;

    const observation = {
      observationId,
      providerEventId: String(providerEventId || ''),
      internalEventId: String(internalEventId || ''),
      sport: String(sport || 'unknown').toLowerCase(),
      format: format || null,
      competition: competition || null,
      market: String(market),
      selection: String(selection),
      modelVersion: String(modelVersion || '4.9.0'),
      pricingVersion: String(pricingVersion || 'v4_canonical_pricing'),
      stateVersion: Number(stateVersion || 1),
      predictionTimestamp: new Date(pTimestamp).toISOString(),
      fairProbability: Number(fairProbability),
      fairOdds: Number(fairOdds),
      publishedOdds: Number(publishedOdds || fairOdds),
      publishedImpliedProbability: Number(publishedImpliedProbability || (1 / (publishedOdds || fairOdds))),
      providerOdds: providerOdds ? Number(providerOdds) : null,
      matchState: Object.freeze({ ...matchState }),
      outcomeTimestamp: null,
      actualOutcome: 'PENDING',
      settlementVersion: null,
      dataSource: String(dataSource),
      status: 'PENDING_SETTLEMENT',
      createdAt: new Date().toISOString(),
    };

    this.observations.set(observationId, observation);
    const lookupKey = this._buildLookupKey(eventKey, market, selection);
    this.lookupIndex.set(lookupKey, observationId);
    this.saveToFile();

    return Object.freeze({ ...observation });
  }

  /**
   * Deterministically links authoritative settlement to the recorded observation.
   * Enforces predictionTimestamp < outcomeTimestamp.
   */
  linkAuthoritativeSettlement(settlementData = {}) {
    const {
      providerEventId,
      internalEventId,
      market,
      selection,
      actualOutcome,
      outcomeTimestamp,
      settlementVersion = 'v4_settlement_authoritative',
      dataSource = 'AUTHORITATIVE_SETTLEMENT_LEDGER',
      evidence = {},
    } = settlementData;

    const eventKey = providerEventId || internalEventId;
    if (!eventKey || !market || !selection) {
      throw new Error('MISSING_LINKING_FIELDS: eventId, market, and selection required.');
    }

    const normOutcome = String(actualOutcome || '').toUpperCase();
    if (!['WON', 'LOST', 'PUSH', 'VOID'].includes(normOutcome)) {
      throw new Error(`INVALID_SETTLEMENT_OUTCOME: Expected WON|LOST|PUSH|VOID, got ${actualOutcome}`);
    }

    const lookupKey = this._buildLookupKey(eventKey, market, selection);
    const observationId = this.lookupIndex.get(lookupKey);
    if (!observationId || !this.observations.has(observationId)) {
      return {
        linked: false,
        reason: 'OBSERVATION_NOT_FOUND',
        lookupKey,
      };
    }

    const obs = this.observations.get(observationId);

    // Enforce temporal integrity: predictionTimestamp MUST be strictly before outcomeTimestamp
    const predTime = new Date(obs.predictionTimestamp).getTime();
    const outTime = outcomeTimestamp ? new Date(outcomeTimestamp).getTime() : Date.now();

    if (isNaN(outTime)) {
      throw new Error('INVALID_OUTCOME_TIMESTAMP: Must be a valid date or timestamp.');
    }

    if (predTime >= outTime) {
      throw new Error(
        `${LEAKAGE_ERROR_CODES.PREDICTION_AFTER_OUTCOME}: predictionTimestamp (${obs.predictionTimestamp}) is not strictly before outcomeTimestamp (${new Date(outTime).toISOString()}). Data leakage rejected.`
      );
    }

    obs.actualOutcome = normOutcome;
    obs.outcomeTimestamp = new Date(outTime).toISOString();
    obs.settlementVersion = String(settlementVersion);
    obs.settlementDataSource = String(dataSource);
    obs.settlementEvidence = Object.freeze({ ...evidence });
    obs.status = 'SETTLED';
    obs.updatedAt = new Date().toISOString();

    this.saveToFile();

    return {
      linked: true,
      observationId,
      fairProbability: obs.fairProbability,
      actualOutcome: obs.actualOutcome,
      predictionTimestamp: obs.predictionTimestamp,
      outcomeTimestamp: obs.outcomeTimestamp,
    };
  }

  /**
   * Retrieves genuine, decisively settled observations (WON / LOST) using ONLY fairProbability.
   * Strictly ignores commercial margin.
   */
  getSettledObservations(filters = {}) {
    const { sport, format, market, competition, modelVersion } = filters;
    const list = Array.from(this.observations.values()).filter((o) => {
      if (o.status !== 'SETTLED') return false;
      if (o.actualOutcome !== 'WON' && o.actualOutcome !== 'LOST') return false;
      if (sport && o.sport !== sport.toLowerCase()) return false;
      if (format && o.format !== format) return false;
      if (market && o.market !== market) return false;
      if (competition && o.competition !== competition) return false;
      if (modelVersion && o.modelVersion !== modelVersion) return false;
      return true;
    });

    // Chronological ordering
    return list.sort((a, b) => new Date(a.predictionTimestamp).getTime() - new Date(b.predictionTimestamp).getTime());
  }

  /**
   * Splits dataset chronologically into Train (60%), Calibration (20%), and Holdout (20%).
   * Strictly prevents random shuffle time leakage.
   */
  splitChronologicalDataset(observations = [], options = {}) {
    const sorted = [...observations].sort(
      (a, b) => new Date(a.predictionTimestamp).getTime() - new Date(b.predictionTimestamp).getTime()
    );

    const n = sorted.length;
    if (n < 10) {
      return {
        status: 'INSUFFICIENT_DATA',
        totalCount: n,
        train: sorted,
        calibration: [],
        holdout: [],
      };
    }

    const trainEnd = Math.floor(n * 0.60);
    const calEnd = Math.floor(n * 0.80);

    const train = sorted.slice(0, trainEnd);
    const calibration = sorted.slice(trainEnd, calEnd);
    const holdout = sorted.slice(calEnd);

    return {
      status: 'SPLIT_SUCCESS',
      datasetVersion: options.datasetVersion || 'chronological_v4_split_v1',
      totalCount: n,
      train: Object.freeze(train),
      calibration: Object.freeze(calibration),
      holdout: Object.freeze(holdout),
      ranges: {
        trainRange: [train[0]?.predictionTimestamp, train[train.length - 1]?.predictionTimestamp],
        calibrationRange: [calibration[0]?.predictionTimestamp, calibration[calibration.length - 1]?.predictionTimestamp],
        holdoutRange: [holdout[0]?.predictionTimestamp, holdout[holdout.length - 1]?.predictionTimestamp],
      },
    };
  }

  countSettled(filters = {}) {
    return this.getSettledObservations(filters).length;
  }

  clear() {
    this.observations.clear();
    this.lookupIndex.clear();
    this.saveToFile();
  }
}

export const productionObservationRecorder = new ProductionObservationRecorder();
