/**
 * OddsEngineV3 — Market-Level & Sport-State Scorecard Engine
 * 
 * Generates comprehensive scorecards segmented by market type and in-game match state.
 * Evaluates Brier, LogLoss, ECE, volatility, suspension frequency, and ranks market stability.
 */

import { calculateBrierScore, calculateLogLoss, calculateCalibrationMetrics } from './modelScorecard.mjs';

/**
 * Builds detailed scorecards for every market in the dataset.
 */
export function buildMarketScorecards(dataset = []) {
  const marketGroups = new Map();

  for (const row of dataset) {
    const market = row.market || row.marketId || 'unknown';
    if (!marketGroups.has(market)) {
      marketGroups.set(market, []);
    }
    marketGroups.get(market).push(row);
  }

  const scorecards = [];

  for (const [market, items] of marketGroups.entries()) {
    const settled = items.filter((d) => d.actualOutcome !== null && d.actualOutcome !== undefined);
    const sampleCount = settled.length;

    const brier = sampleCount > 0 ? calculateBrierScore(settled) : null;
    const logLoss = sampleCount > 0 ? calculateLogLoss(settled) : null;
    const { ece, mce } = sampleCount > 0 ? calculateCalibrationMetrics(settled) : { ece: null, mce: null };

    const avgMargin = items.length > 0 ? Number((items.reduce((s, d) => s + (Number(d.margin) || 0.05), 0) / items.length).toFixed(4)) : 0.05;
    const avgLatency = items.length > 0 ? Number((items.reduce((s, d) => s + (Number(d.providerLatency) || 0), 0) / items.length).toFixed(1)) : 0;
    const suspendedCount = items.filter((d) => d.marketStatus === 'SUSPENDED').length;
    const suspensionRate = items.length > 0 ? Number(((suspendedCount / items.length) * 100).toFixed(2)) : 0;

    scorecards.push({
      market,
      totalObservations: items.length,
      sampleCount,
      brierScore: brier,
      logLoss,
      ece,
      mce,
      avgMargin,
      avgLatencyMs: avgLatency,
      suspensionRatePercent: suspensionRate,
      status: sampleCount >= 500 ? 'STATISTICALLY_ROBUST' : (sampleCount >= 50 ? 'PRELIMINARY' : 'INSUFFICIENT_DATA'),
    });
  }

  // Rankings
  const robustScorecards = scorecards.filter((s) => s.brierScore !== null && s.sampleCount >= 20);
  const bestCalibrated = [...robustScorecards].sort((a, b) => (a.brierScore ?? 1) - (b.brierScore ?? 1))[0]?.market || 'None';
  const worstCalibrated = [...robustScorecards].sort((a, b) => (b.brierScore ?? 0) - (a.brierScore ?? 0))[0]?.market || 'None';
  const mostStable = [...scorecards].sort((a, b) => a.suspensionRatePercent - b.suspensionRatePercent)[0]?.market || 'None';
  const mostVolatile = [...scorecards].sort((a, b) => b.suspensionRatePercent - a.suspensionRatePercent)[0]?.market || 'None';

  return {
    totalMarketsEvaluated: scorecards.length,
    scorecards,
    rankings: {
      BEST_CALIBRATED: bestCalibrated,
      WORST_CALIBRATED: worstCalibrated,
      MOST_STABLE: mostStable,
      MOST_VOLATILE: mostVolatile,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Evaluates cricket match-state segmentation (Powerplay, Middle, Death overs).
 */
export function evaluateCricketStateScorecard(dataset = []) {
  const cricketData = dataset.filter((d) => (d.sport || '').toLowerCase() === 'cricket');
  const phases = {
    powerplay: [], // overs 0 - 6
    middle: [],    // overs 6 - 15
    death: [],     // overs 15 - 20
    other: [],
  };

  for (const item of cricketData) {
    const balls = Number(item.matchState?.ballsCompleted ?? item.matchState?.balls ?? 0);
    const overs = balls / 6;
    if (overs <= 6) phases.powerplay.push(item);
    else if (overs <= 15) phases.middle.push(item);
    else if (overs <= 20) phases.death.push(item);
    else phases.other.push(item);
  }

  const phaseResults = {};
  for (const [phase, items] of Object.entries(phases)) {
    const settled = items.filter((d) => d.actualOutcome !== null && d.actualOutcome !== undefined);
    phaseResults[phase] = {
      totalCount: items.length,
      settledCount: settled.length,
      brierScore: settled.length > 0 ? calculateBrierScore(settled) : null,
      logLoss: settled.length > 0 ? calculateLogLoss(settled) : null,
      ece: settled.length > 0 ? calculateCalibrationMetrics(settled).ece : null,
    };
  }

  return {
    sport: 'cricket',
    phases: phaseResults,
    evaluatedAt: new Date().toISOString(),
  };
}
