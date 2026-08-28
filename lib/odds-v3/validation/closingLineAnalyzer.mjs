/**
 * OddsEngineV3 — Closing Line & Price Movement Efficiency Analyzer
 * 
 * Compares opening, intermediate, and closing pricing snapshots against settled outcomes.
 * Evaluates closing line value (CLV), price trajectory efficiency, and flicker instability.
 */

import { calculateBrierScore, calculateLogLoss, calculateCalibrationMetrics } from './modelScorecard.mjs';

/**
 * Analyzes a sequence of historical odds observations for a single match market selection.
 * 
 * @param {Array<{ timestamp: number, odds: number, probability: number, settledOutcome?: boolean }>} timeline
 * @returns {Object} Closing line and movement efficiency metrics
 */
export function analyzeClosingLineEfficiency(timeline = []) {
  if (!Array.isArray(timeline) || timeline.length < 2) {
    return {
      status: 'INSUFFICIENT_TIMELINE',
      sampleCount: timeline.length,
      openingOdds: timeline[0]?.odds ?? null,
      closingOdds: timeline[0]?.odds ?? null,
      movementEfficiency: null,
      movementClassification: 'NORMAL',
    };
  }

  const sorted = [...timeline].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const opening = sorted[0];
  const closing = sorted[sorted.length - 1];

  const openingProb = Number(opening.modelProbability ?? opening.probability ?? (1 / opening.odds));
  const closingProb = Number(closing.modelProbability ?? closing.probability ?? (1 / closing.odds));
  const outcome = closing.settledOutcome ?? opening.settledOutcome ?? null;

  const totalMovementAbs = Math.abs(closing.odds - opening.odds);
  const totalMovementPct = opening.odds > 0 ? Number((((closing.odds - opening.odds) / opening.odds) * 100).toFixed(2)) : 0;

  // Count reversals / flicker oscillations
  let reversalCount = 0;
  let maxJumpPct = 0;

  for (let i = 1; i < sorted.length - 1; i++) {
    const delta1 = sorted[i].odds - sorted[i - 1].odds;
    const delta2 = sorted[i + 1].odds - sorted[i].odds;
    if ((delta1 > 0 && delta2 < 0) || (delta1 < 0 && delta2 > 0)) {
      reversalCount++;
    }
    const jump = sorted[i - 1].odds > 0 ? (Math.abs(delta1) / sorted[i - 1].odds) * 100 : 0;
    if (jump > maxJumpPct) maxJumpPct = jump;
  }

  let movementClassification = 'NORMAL';
  if (reversalCount > 5 || maxJumpPct > 40) {
    movementClassification = 'UNSTABLE';
  } else if (Math.abs(totalMovementPct) > 35 || maxJumpPct > 30) {
    movementClassification = 'EXTREME';
  } else if (Math.abs(totalMovementPct) > 20 || maxJumpPct > 15) {
    movementClassification = 'FAST';
  }

  // Trajectory efficiency: did the probability move in the direction of the outcome?
  let movedTowardsOutcome = null;
  if (outcome !== null) {
    const target = outcome ? 1 : 0;
    const initialDist = Math.abs(openingProb - target);
    const finalDist = Math.abs(closingProb - target);
    movedTowardsOutcome = finalDist < initialDist;
  }

  return {
    status: 'ANALYZED',
    samplePoints: sorted.length,
    openingOdds: opening.odds,
    closingOdds: closing.odds,
    openingProb: Number(openingProb.toFixed(4)),
    closingProb: Number(closingProb.toFixed(4)),
    totalMovementAbs: Number(totalMovementAbs.toFixed(4)),
    totalMovementPct,
    maxSingleJumpPct: Number(maxJumpPct.toFixed(2)),
    reversalCount,
    movementClassification,
    movedTowardsOutcome,
    settledOutcome: outcome,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Aggregates closing line efficiency across a dataset of settled markets.
 */
export function aggregateClosingLineDataset(dataset = []) {
  const byMarketSelection = new Map();

  for (const obs of dataset) {
    const key = `${obs.matchId}:${obs.marketId || obs.market}:${obs.selectionId || obs.selection}`;
    if (!byMarketSelection.has(key)) {
      byMarketSelection.set(key, []);
    }
    byMarketSelection.get(key).push(obs);
  }

  const results = [];
  let efficientCount = 0;
  let totalEvaluated = 0;

  for (const [key, timeline] of byMarketSelection.entries()) {
    const analysis = analyzeClosingLineEfficiency(timeline);
    if (analysis.status === 'ANALYZED' && analysis.movedTowardsOutcome !== null) {
      results.push({ key, ...analysis });
      if (analysis.movedTowardsOutcome) efficientCount++;
      totalEvaluated++;
    }
  }

  const efficiencyRate = totalEvaluated > 0 ? Number(((efficientCount / totalEvaluated) * 100).toFixed(2)) : null;

  return {
    totalEvaluated,
    efficientCount,
    efficiencyRatePercent: efficiencyRate,
    status: efficiencyRate !== null ? (efficiencyRate >= 55 ? 'EFFICIENT_CLOSING_TRAJECTORY' : 'RANDOM_OR_SUBOPTIMAL') : 'INSUFFICIENT_DATA',
    results: results.slice(0, 100),
  };
}
