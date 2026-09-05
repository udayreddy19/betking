/**
 * OddsEngineV4 — WinExpectancyEngine
 * Resource-table based chase / innings-1 win probabilities.
 */

import { expectedRemainingRuns, remainingResourcePct } from './resourceTables.mjs';

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function logistic(x, k = 2.2) {
  return 1 / (1 + Math.exp(-k * x));
}

/**
 * P(chasing team wins) from remaining resources vs runs required.
 */
export function chaseWinProbability(state) {
  const runsRequired = Number(state.runsRequired);
  const ballsLeft = Number(state.ballsRemaining) || 0;
  const wickets = Number(state.wicketsInHand) || 0;

  if (!(runsRequired >= 0) || ballsLeft <= 0 || wickets <= 0) {
    return { pChase: 0.02, pField: 0.98, method: 'chase_impossible' };
  }
  if (runsRequired === 0) {
    return { pChase: 0.98, pField: 0.02, method: 'chase_already_home' };
  }

  const expected = expectedRemainingRuns(state);
  // Surplus of expected runs vs required (positive => chase favorite)
  const surplusRatio = (expected - runsRequired) / Math.max(8, runsRequired);
  const resource = remainingResourcePct({
    wicketsInHand: wickets,
    ballsRemaining: ballsLeft,
    ballsPerInnings: state.ballsPerInnings,
  });
  const rrr = (runsRequired / ballsLeft) * 6;
  const paceTerm = clamp(1.2 - (rrr / 12), -1.5, 1.5);

  let pChase = logistic(1.15 * surplusRatio + 0.35 * paceTerm + 0.01 * (resource - 40));
  pChase = clamp(pChase, 0.02, 0.98);

  return {
    pChase,
    pField: 1 - pChase,
    method: 'resource_table',
    debug: { expected, surplusRatio, resource, rrr },
  };
}

/**
 * Innings-1 win probability for the batting side (team currently batting).
 */
export function inningsOneWinProbability(state) {
  const projected = Number(state.battingRuns) + expectedRemainingRuns(state);
  const formatPar = expectedRemainingRuns({
    ...state,
    wicketsInHand: 10,
    ballsRemaining: state.ballsPerInnings,
    ballsCompleted: 0,
  });
  const ratio = projected / Math.max(60, formatPar);
  // Convert projected vs par into P(bat first wins match) — modest edge.
  let pBatFirst = logistic((ratio - 1) * 2.4);
  pBatFirst = clamp(pBatFirst, 0.18, 0.82);
  return {
    pBatFirst,
    pBowlFirst: 1 - pBatFirst,
    method: 'innings1_projection',
    debug: { projected, formatPar, ratio },
  };
}

/**
 * Prematch production prior: independent of provider scrapes.
 * Provider MW is for shadow calibration only — never published as OddsYra prices.
 */
export function prematchWinProbability(_state) {
  // Slight team1 lean so margined book is not a silent 1.90/1.90 twin.
  return {
    pTeam1: 0.52,
    pTeam2: 0.48,
    method: 'flat_prior',
  };
}

/** Shadow / calibration helper — deconvolve reference odds; do not use in generate(). */
export function deconvolveProviderFair(provider) {
  const home = Number(provider?.home ?? provider?.team1);
  const away = Number(provider?.away ?? provider?.team2);
  if (!(home > 1) || !(away > 1)) return null;
  const ih = 1 / home;
  const ia = 1 / away;
  const sum = ih + ia;
  return { pTeam1: ih / sum, pTeam2: ia / sum, method: 'provider_fair_deconvolve' };
}

/**
 * Resolve match-winner fair probs for team1 / team2.
 */
export function matchWinnerFairProbs(state) {
  if (state.status === 'COMPLETED') {
    const t1 = Number(state.team1.runs);
    const t2 = Number(state.team2.runs);
    if (t1 === t2) return { pTeam1: 0.5, pTeam2: 0.5, method: 'completed_tie' };
    return t1 > t2
      ? { pTeam1: 0.99, pTeam2: 0.01, method: 'completed' }
      : { pTeam1: 0.01, pTeam2: 0.99, method: 'completed' };
  }

  if (state.phase === 'PREMATCH' || state.status === 'SCHEDULED') {
    return prematchWinProbability(state);
  }

  if (Number(state.currentInnings) >= 2 || state.phase === 'CHASE') {
    const chase = chaseWinProbability(state);
    const chaseIsTeam1 = String(state.battingTeamId) === String(state.team1.id);
    return {
      pTeam1: chaseIsTeam1 ? chase.pChase : chase.pField,
      pTeam2: chaseIsTeam1 ? chase.pField : chase.pChase,
      method: chase.method,
      debug: chase.debug,
    };
  }

  const inn1 = inningsOneWinProbability(state);
  const batIsTeam1 = String(state.battingTeamId) === String(state.team1.id);
  return {
    pTeam1: batIsTeam1 ? inn1.pBatFirst : inn1.pBowlFirst,
    pTeam2: batIsTeam1 ? inn1.pBowlFirst : inn1.pBatFirst,
    method: inn1.method,
    debug: inn1.debug,
  };
}
