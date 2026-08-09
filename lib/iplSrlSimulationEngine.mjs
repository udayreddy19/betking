/**
 * Module G: Cricket Simulation Engine (IPLSRL)
 * Core physics and weighted probability delivery engine for IPLSRL.
 */

import { calculateIPLSRLPlayerForm } from './iplSrlFormEngine.mjs';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const BALL_OUTCOMES = {
  DOT: 'DOT',
  ONE: 'ONE',
  TWO: 'TWO',
  THREE: 'THREE',
  FOUR: 'FOUR',
  SIX: 'SIX',
  WIDE: 'WIDE',
  NO_BALL: 'NO_BALL',
  BYE: 'BYE',
  LEG_BYE: 'LEG_BYE',
  WICKET: 'WICKET',
};

/**
 * Simulates a single delivery using physics, player ratings, dynamic form, and match state.
 */
export function simulateIPLSRLDelivery(inputs = {}) {
  const {
    striker = { name: 'Batter', battingRating: 85, aggression: 80 },
    bowler = { name: 'Bowler', bowlingRating: 85 },
    overNum = 1,
    ballNum = 1,
    wicketsLost = 2,
    targetScore = null,
    currentRuns = 80,
    seed = Date.now(),
  } = inputs;

  const rng = mulberry32(seed + overNum * 100 + ballNum * 17);

  // Form adjustments
  const strikerForm = calculateIPLSRLPlayerForm(striker.playerId || 'p1').battingForm;
  const bowlerForm = calculateIPLSRLPlayerForm(bowler.playerId || 'p2').bowlingForm;

  // Effective Ratings
  const effBat = (striker.battingRating || 80) * 0.6 + strikerForm * 0.4;
  const effBowl = (bowler.bowlingRating || 80) * 0.6 + bowlerForm * 0.4;
  const ratingDelta = (effBat - effBowl) / 100; // e.g. -0.1 to +0.15

  // Match Phase adjustments
  const isPowerplay = overNum <= 6;
  const isDeathOvers = overNum >= 16;
  let aggressionFactor = 1.0;
  if (isPowerplay) aggressionFactor = 1.25;
  if (isDeathOvers) aggressionFactor = 1.45;

  // Chasing Pressure
  if (targetScore && targetScore > 0) {
    const oversLeft = Math.max(0.1, 20 - (overNum - 1) - (ballNum / 6));
    const runsNeeded = targetScore - currentRuns;
    const rrr = runsNeeded / oversLeft;
    if (rrr > 11) aggressionFactor *= 1.35;
    else if (rrr > 8.5) aggressionFactor *= 1.15;
  }

  // Base Weights
  let pDot = 0.36 - ratingDelta * 0.2;
  let pOne = 0.35 + ratingDelta * 0.05;
  let pTwo = 0.08;
  let pThree = 0.01;
  let pFour = (0.09 + ratingDelta * 0.08) * (isPowerplay ? 1.3 : 1.0);
  let pSix = (0.05 + ratingDelta * 0.08) * (isDeathOvers ? 1.5 : 1.1) * (aggressionFactor > 1.2 ? 1.2 : 1.0);
  let pWicket = (0.04 - ratingDelta * 0.03) * (isDeathOvers ? 1.3 : 1.0) * (wicketsLost > 7 ? 1.4 : 1.0);
  let pExtra = 0.02;

  // Normalize probabilities
  const totalWeight = pDot + pOne + pTwo + pThree + pFour + pSix + pWicket + pExtra;
  pDot /= totalWeight;
  pOne /= totalWeight;
  pTwo /= totalWeight;
  pThree /= totalWeight;
  pFour /= totalWeight;
  pSix /= totalWeight;
  pWicket /= totalWeight;

  const roll = rng();
  let cumulative = 0;

  if (roll < (cumulative += pDot)) {
    return { outcome: BALL_OUTCOMES.DOT, runs: 0, extras: 0, isExtra: false, isWicket: false };
  }
  if (roll < (cumulative += pOne)) {
    return { outcome: BALL_OUTCOMES.ONE, runs: 1, extras: 0, isExtra: false, isWicket: false };
  }
  if (roll < (cumulative += pTwo)) {
    return { outcome: BALL_OUTCOMES.TWO, runs: 2, extras: 0, isExtra: false, isWicket: false };
  }
  if (roll < (cumulative += pThree)) {
    return { outcome: BALL_OUTCOMES.THREE, runs: 3, extras: 0, isExtra: false, isWicket: false };
  }
  if (roll < (cumulative += pFour)) {
    return { outcome: BALL_OUTCOMES.FOUR, runs: 4, extras: 0, isExtra: false, isWicket: false, isBoundary: true };
  }
  if (roll < (cumulative += pSix)) {
    return { outcome: BALL_OUTCOMES.SIX, runs: 6, extras: 0, isExtra: false, isWicket: false, isBoundary: true, isSix: true };
  }
  if (roll < (cumulative += pWicket)) {
    const wicketTypes = ['bowled', 'caught', 'lbw', 'run_out', 'stumped'];
    const wType = wicketTypes[Math.floor(rng() * wicketTypes.length)];
    return { outcome: BALL_OUTCOMES.WICKET, runs: 0, extras: 0, isExtra: false, isWicket: true, wicketType: wType };
  }

  // Extras
  const extraTypes = [BALL_OUTCOMES.WIDE, BALL_OUTCOMES.NO_BALL, BALL_OUTCOMES.LEG_BYE, BALL_OUTCOMES.BYE];
  const eType = extraTypes[Math.floor(rng() * extraTypes.length)];
  const eRuns = (eType === BALL_OUTCOMES.WIDE || eType === BALL_OUTCOMES.NO_BALL) ? 1 : 1;
  return { outcome: eType, runs: (eType === BALL_OUTCOMES.LEG_BYE || eType === BALL_OUTCOMES.BYE) ? 1 : 0, extras: eRuns, isExtra: true, isWicket: false };
}
