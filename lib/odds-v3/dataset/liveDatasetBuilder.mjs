/**
 * OddsEngineV3 — Live Dataset Builder
 * 
 * Aggregates empirical pricing observations and joined settlement outcomes
 * into versioned, partitioned datasets for calibration and model validation.
 */

import { queryObservations } from '../telemetry/oddsObservationStore.mjs';

export const TIME_RANGES = Object.freeze({
  '1d': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
});

/**
 * Builds a clean, partitioned dataset from empirical observations.
 * 
 * @param {Object} options
 * @param {string} [options.sport] - cricket, soccer, tennis, basketball
 * @param {string} [options.league]
 * @param {string} [options.market]
 * @param {string} [options.provider]
 * @param {string} [options.modelVersion]
 * @param {'1d'|'7d'|'30d'|'90d'} [options.timeRange='30d']
 * @param {boolean} [options.onlySettled=true]
 * @returns {{ dataset: Object[], metadata: Object }}
 */
export function buildLiveDataset({
  sport = null,
  league = null,
  market = null,
  provider = null,
  modelVersion = null,
  timeRange = '30d',
  onlySettled = true,
  limit = 20000,
} = {}) {
  const timeRangeMs = TIME_RANGES[timeRange] || TIME_RANGES['30d'];
  const rawObservations = queryObservations({
    sport,
    league,
    marketId: market,
    modelVersion,
    onlySettled,
    timeRangeMs,
    limit,
  });

  const dataset = [];
  let winCount = 0;
  let lossCount = 0;
  let minTs = Infinity;
  let maxTs = 0;
  const modelVersionsSet = new Set();
  const sportsSet = new Set();
  const marketsSet = new Set();

  for (const obs of rawObservations) {
    if (provider && obs.providerUsed !== String(provider)) continue;

    const prob = obs.modelProbability ?? obs.probability ?? 0;
    const odds = obs.publishedOdds ?? obs.odds ?? 0;
    const outcome = obs.settledOutcome;

    if (outcome === true) winCount++;
    if (outcome === false) lossCount++;

    if (obs.timestamp < minTs) minTs = obs.timestamp;
    if (obs.timestamp > maxTs) maxTs = obs.timestamp;

    modelVersionsSet.add(obs.modelVersion);
    sportsSet.add(obs.sport);
    marketsSet.add(obs.market);

    dataset.push({
      observationId: obs.observationId,
      timestamp: obs.timestamp,
      matchId: obs.matchId,
      sport: obs.sport,
      league: obs.league,
      market: obs.market,
      selection: obs.selection,
      predictionProbability: prob,
      publishedOdds: odds,
      actualOutcome: outcome, // true, false, or null
      margin: obs.margin,
      providerLatency: obs.providerLatency,
      modelVersion: obs.modelVersion,
      engineVersion: obs.engineVersion,
      providerUsed: obs.providerUsed,
      isCanary: obs.isCanary,
    });
  }

  const sampleCount = dataset.length;
  const isMultiModel = modelVersionsSet.size > 1;

  const metadata = {
    sampleCount,
    settledCount: winCount + lossCount,
    winCount,
    lossCount,
    winRate: sampleCount > 0 ? Number((winCount / (winCount + lossCount || 1)).toFixed(4)) : 0,
    timeRange,
    dateRange: {
      from: minTs === Infinity ? null : new Date(minTs).toISOString(),
      to: maxTs === 0 ? null : new Date(maxTs).toISOString(),
    },
    modelVersions: Array.from(modelVersionsSet),
    isMultiModelVersion: isMultiModel,
    warning: isMultiModel ? 'Dataset contains multiple model versions. Ensure comparative grouping.' : null,
    sports: Array.from(sportsSet),
    markets: Array.from(marketsSet),
    generatedAt: new Date().toISOString(),
  };

  return { dataset, metadata };
}
