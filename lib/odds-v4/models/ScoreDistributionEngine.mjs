/**
 * OddsEngineV4 — ScoreDistributionEngine
 * Projected run distributions for totals / overs / deliveries.
 */

import { expectedRemainingRuns, formatFullInningsExpectation } from './resourceTables.mjs';

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** Normal CDF approximation */
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-0.5 * x * x);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) p = 1 - p;
  return clamp(p, 0.001, 0.999);
}

export function normalOuFair(mean, sd, line) {
  const z = (Number(line) + 0.5 - mean) / Math.max(0.8, sd); // continuity correction toward Under
  const pUnder = normCdf(z);
  return { pOver: 1 - pUnder, pUnder, mean, sd, line: Number(line) };
}

export function projectInningsTotal(state) {
  const remaining = expectedRemainingRuns(state);
  const mean = Number(state.battingRuns) + remaining;
  const sd = Math.max(8, Math.sqrt(remaining) * 1.35);
  return { mean, sd, remaining };
}

export function projectMatchTotal(state) {
  if (Number(state.currentInnings) >= 2) {
    const chaseProj = projectInningsTotal(state);
    const first = Number(state.firstInningsRuns) || 0;
    return {
      mean: first + chaseProj.mean,
      sd: Math.max(10, chaseProj.sd * 1.1),
    };
  }
  const inn1 = projectInningsTotal(state);
  const chasePar = formatFullInningsExpectation(state.format) * 0.92;
  return {
    mean: inn1.mean + chasePar,
    sd: Math.max(14, inn1.sd * 1.25),
  };
}

export function projectOverRuns(state) {
  // Typical remaining RPB * 6 with format prior.
  const rpb = expectedRemainingRuns(state) / Math.max(1, Number(state.ballsRemaining) || 1);
  const mean = clamp(rpb * 6, 2.5, 18);
  const sd = Math.max(2.2, mean * 0.45);
  return { mean, sd };
}

export function projectDeliveryRuns(state) {
  const rpb = expectedRemainingRuns(state) / Math.max(1, Number(state.ballsRemaining) || 1);
  const mean = clamp(rpb, 0.4, 2.2);
  const sd = Math.max(0.7, mean * 0.85);
  return { mean, sd };
}

/** Pick .5 line closest to 50/50 fair. */
export function pickBalancedLine(mean, step = 1) {
  const base = Math.floor(mean / step) * step;
  const candidates = [base - step, base, base + step, base + 2 * step]
    .map((x) => x + 0.5)
    .filter((x) => x > 0);
  let best = candidates[0];
  let bestDist = Infinity;
  for (const line of candidates) {
    const { pOver } = normalOuFair(mean, Math.max(3, mean * 0.2), line);
    const dist = Math.abs(pOver - 0.5);
    if (dist < bestDist) {
      bestDist = dist;
      best = line;
    }
  }
  return best;
}

export function deliveryOutcomeProbs(state) {
  const { mean } = projectDeliveryRuns(state);
  // Simple multinomial-ish from mean runs/ball.
  let p0 = clamp(0.55 - mean * 0.12, 0.22, 0.62);
  let p1 = clamp(0.28 + mean * 0.04, 0.18, 0.38);
  let p2 = clamp(0.06 + mean * 0.03, 0.04, 0.14);
  let p3 = 0.015;
  let p4 = clamp(0.08 + mean * 0.04, 0.05, 0.16);
  let p6 = clamp(0.03 + mean * 0.03, 0.02, 0.12);
  const sum = p0 + p1 + p2 + p3 + p4 + p6;
  return {
    0: p0 / sum,
    1: p1 / sum,
    2: p2 / sum,
    3: p3 / sum,
    4: p4 / sum,
    '6plus': p6 / sum,
  };
}
