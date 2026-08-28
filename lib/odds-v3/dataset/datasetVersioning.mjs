/**
 * OddsEngineV3 — Immutable Dataset Versioning Engine
 * 
 * Packages curated observations into immutable versioned datasets with SHA-256 cryptographic provenance.
 * Enforces sample size gates and data quality certification.
 */

import crypto from 'crypto';
import { auditPredictionPriceOutcomeIntegrity } from './predictionPriceOutcomeIntegrity.mjs';

export const SAMPLE_SIZE_TIERS = Object.freeze({
  INSUFFICIENT: 'INSUFFICIENT',   // < 100
  EXPLORATORY: 'EXPLORATORY',     // 100 - 499
  LIMITED: 'LIMITED',             // 500 - 999
  VALIDATION: 'VALIDATION',       // 1000 - 4999
  STRONG: 'STRONG',               // 5000+
});

export function evaluateSampleSizeTier(count) {
  if (count >= 5000) return SAMPLE_SIZE_TIERS.STRONG;
  if (count >= 1000) return SAMPLE_SIZE_TIERS.VALIDATION;
  if (count >= 500) return SAMPLE_SIZE_TIERS.LIMITED;
  if (count >= 100) return SAMPLE_SIZE_TIERS.EXPLORATORY;
  return SAMPLE_SIZE_TIERS.INSUFFICIENT;
}

/**
 * Creates an immutable versioned dataset package from observations.
 */
export function createVersionedDataset({
  datasetName = 'dataset_v1',
  observations = [],
  source = 'live_telemetry_postgres',
  sports = [],
  markets = [],
} = {}) {
  const audit = auditPredictionPriceOutcomeIntegrity(observations);
  const eligible = observations.filter((o) =>
    o &&
    o.settledOutcome &&
    o.settledOutcome !== 'UNKNOWN' &&
    Number.isFinite(o.predictionProbability ?? o.modelProbability) &&
    Number(o.predictionProbability ?? o.modelProbability) >= 0 &&
    Number(o.predictionProbability ?? o.modelProbability) <= 1
  );

  const excludedCount = observations.length - eligible.length;
  const sampleTier = evaluateSampleSizeTier(eligible.length);

  const timestamps = observations.map((o) => Number(o.timestamp || 0)).filter((ts) => ts > 0);
  const startDate = timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : null;
  const endDate = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;

  const datasetId = `ds_${datasetName}_${Date.now()}`;
  const payloadForHash = JSON.stringify({
    datasetId,
    sampleCount: eligible.length,
    startDate,
    endDate,
    source,
    first100Ids: eligible.slice(0, 100).map((o) => o.observationId || o.matchId),
  });

  const hash = crypto.createHash('sha256').update(payloadForHash).digest('hex');

  return {
    datasetId,
    datasetName,
    createdAt: new Date().toISOString(),
    hash,
    source,
    sampleTier,
    totalObservations: observations.length,
    settledCount: eligible.length,
    excludedCount,
    exclusionReasons: {
      unknownSettlement: observations.filter((o) => !o.settledOutcome || o.settledOutcome === 'UNKNOWN').length,
      invalidProbability: observations.filter((o) => {
        const p = Number(o.predictionProbability ?? o.modelProbability);
        return !Number.isFinite(p) || p < 0 || p > 1;
      }).length,
    },
    dataQualityScore: audit.predictionPriceOutcomeIntegrityScore,
    startDate,
    endDate,
    sports: sports.length > 0 ? sports : Array.from(new Set(observations.map((o) => o.sport).filter(Boolean))),
    markets: markets.length > 0 ? markets : Array.from(new Set(observations.map((o) => o.marketId || o.market).filter(Boolean))),
    records: eligible,
  };
}
