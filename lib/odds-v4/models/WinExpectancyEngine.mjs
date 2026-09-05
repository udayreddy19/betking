/**
 * OddsEngineV4 — WinExpectancyEngine
 * Resource-table chase / innings-1 win probs (replaces V3 RR logistic for MW).
 */

import { expectedRemainingRuns, remainingResourcePct, formatFullInningsExpectation } from './resourceTables.mjs';

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function logistic(x, k = 2.2) {
  return 1 / (1 + Math.exp(-k * x));
}

/**
 * P(chasing team wins) from remaining resources vs runs required.
 */
export function chaseWinProbability({
  runsRequired,
  ballsRemaining,
  wicketsRemaining,
  ballsPerInnings,
  format,
  resourceRunsHaircut = 0.93,
  momentumFactor = 1,
}) {
  const need = Number(runsRequired);
  const ballsLeft = Number(ballsRemaining) || 0;
  const wickets = Number(wicketsRemaining) || 0;

  if (!(need >= 0) || ballsLeft <= 0 || wickets <= 0) {
    return { pChase: 0.02, pField: 0.98, method: 'chase_impossible' };
  }
  if (need === 0) {
    return { pChase: 0.98, pField: 0.02, method: 'chase_already_home' };
  }

  const haircut = Number.isFinite(resourceRunsHaircut) && resourceRunsHaircut > 0
    ? resourceRunsHaircut
    : 0.93;
  const mom = Number.isFinite(momentumFactor) ? clamp(momentumFactor, 0.82, 1.18) : 1;
  const expected = expectedRemainingRuns({
    format,
    wicketsInHand: wickets,
    ballsRemaining: ballsLeft,
    ballsPerInnings,
  }) * haircut * mom;
  const surplusRatio = (expected - need) / Math.max(8, need);
  const resource = remainingResourcePct({
    wicketsInHand: wickets,
    ballsRemaining: ballsLeft,
    ballsPerInnings,
  });
  const rrr = (need / ballsLeft) * 6;
  const paceTerm = clamp(1.2 - (rrr / 12), -1.5, 1.5);

  let pChase = logistic(1.15 * surplusRatio + 0.35 * paceTerm + 0.01 * (resource - 40));
  pChase = clamp(pChase, 0.02, 0.98);

  return {
    pChase,
    pField: 1 - pChase,
    method: 'resource_table',
    debug: { expected, surplusRatio, resource, rrr, haircut, momentumFactor: mom },
  };
}

/**
 * Innings-1: projected total vs format par → P(batting side wins match).
 */
export function inningsOneWinProbability({
  battingRuns,
  ballsRemaining,
  wicketsRemaining,
  ballsPerInnings,
  format,
  resourceRunsHaircut = 0.93,
  momentumFactor = 1,
}) {
  const haircut = Number.isFinite(resourceRunsHaircut) && resourceRunsHaircut > 0
    ? resourceRunsHaircut
    : 0.93;
  const mom = Number.isFinite(momentumFactor) ? clamp(momentumFactor, 0.82, 1.18) : 1;
  const remaining = expectedRemainingRuns({
    format,
    wicketsInHand: wicketsRemaining,
    ballsRemaining,
    ballsPerInnings,
  }) * haircut * mom;
  const projected = Number(battingRuns) + remaining;
  const par = formatFullInningsExpectation(format);
  const ratio = projected / Math.max(60, par);
  let pBatFirst = logistic((ratio - 1) * 2.4);
  pBatFirst = clamp(pBatFirst, 0.18, 0.82);
  return {
    pBatFirst,
    pBowlFirst: 1 - pBatFirst,
    method: 'innings1_resource',
    debug: { projected, par, ratio, haircut, momentumFactor: mom },
  };
}
