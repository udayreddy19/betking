/**
 * OddsEngineV3 — Historical Backtest & Replay Runner
 * 
 * Replays chronological match timelines to evaluate pricing performance
 * and probability calibration without look-ahead bias.
 */

import { generate } from '../OddsEngineV3.mjs';
import { generateOtherSportsSnapshot } from '../otherSportsOdds.mjs';

export function runHistoricalBacktest({
  timeline = [], // Array of sequential { timestamp, matchState, resolvedWinner }
  sport = 'cricket',
  config = {},
} = {}) {
  if (!Array.isArray(timeline) || !timeline.length) {
    return {
      status: 'AWAITING_REAL_DATA',
      sampleSize: 0,
      brierScore: null,
      logLoss: null,
      calibrationBuckets: [],
      suspensionRatePct: 0,
      evaluatedAt: new Date().toISOString(),
    };
  }

  // Ensure chronological ordering to prevent look-ahead bias
  const sorted = [...timeline].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  let totalBrier = 0;
  let totalLogLoss = 0;
  let predictionCount = 0;
  let suspendedCount = 0;

  // 10 Calibration Buckets: [0.0-0.1, 0.1-0.2, ..., 0.9-1.0]
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    range: `${(i * 0.1).toFixed(1)}-${((i + 1) * 0.1).toFixed(1)}`,
    predictedSum: 0,
    actualWins: 0,
    count: 0,
  }));

  for (const event of sorted) {
    const isCricket = String(sport || 'cricket').toLowerCase().includes('cricket');
    const snapshot = isCricket
      ? generate(event.matchState, config)
      : generateOtherSportsSnapshot(event.matchState, config);

    if (snapshot.status === 'SUSPENDED') {
      suspendedCount++;
      continue;
    }

    const winnerMkt = (snapshot.markets || []).find(m => m.marketId?.includes('winner'));
    if (!winnerMkt || winnerMkt.status !== 'OPEN') {
      suspendedCount++;
      continue;
    }

    const sel1 = winnerMkt.selections?.[0];
    if (!sel1 || typeof sel1.probability !== 'number') continue;

    const p = Math.max(0.001, Math.min(0.999, sel1.probability));
    const won = event.resolvedWinner === sel1.selectionId || event.resolvedWinner === sel1.name;
    const y = won ? 1 : 0;

    totalBrier += Math.pow(p - y, 2);
    totalLogLoss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    predictionCount++;

    const bucketIdx = Math.min(9, Math.floor(p * 10));
    buckets[bucketIdx].count++;
    buckets[bucketIdx].predictedSum += p;
    if (won) buckets[bucketIdx].actualWins++;
  }

  if (predictionCount === 0) {
    return {
      status: 'NO_VALID_PREDICTIONS',
      sampleSize: 0,
      brierScore: null,
      logLoss: null,
      calibrationBuckets: [],
      suspensionRatePct: 100,
    };
  }

  const calibrationBuckets = buckets.map(b => ({
    range: b.range,
    count: b.count,
    avgPredicted: b.count > 0 ? Number((b.predictedSum / b.count).toFixed(4)) : null,
    actualFrequency: b.count > 0 ? Number((b.actualWins / b.count).toFixed(4)) : null,
    error: b.count > 0 ? Number(Math.abs((b.predictedSum / b.count) - (b.actualWins / b.count)).toFixed(4)) : null,
  }));

  return {
    status: 'COMPLETED',
    sampleSize: predictionCount,
    brierScore: Number((totalBrier / predictionCount).toFixed(4)),
    logLoss: Number((totalLogLoss / predictionCount).toFixed(4)),
    suspensionRatePct: Number(((suspendedCount / sorted.length) * 100).toFixed(2)),
    calibrationBuckets,
    sport,
    evaluatedAt: new Date().toISOString(),
  };
}
