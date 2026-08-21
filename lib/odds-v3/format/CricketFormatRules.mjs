/**
 * OddsEngineV3 — Cricket Format Rules
 *
 * Defines format-specific constants for supported cricket formats.
 * Extensible: supports THE_HUNDRED, T20, ODI, TEST, T10.
 */

import { resolveCricketOversFormat } from '../../../src/utils/cricketFormat.js';

export const FORMAT_RULES = Object.freeze({
  THE_HUNDRED: Object.freeze({
    ballsPerInnings: 100,
    ballsPerOver: 5,
    powerplayBalls: 25,
    maxWickets: 10,
    historicalRunsPerBall: 1.40,
  }),

  T20: Object.freeze({
    ballsPerInnings: 120,
    ballsPerOver: 6,
    powerplayBalls: 36,
    maxWickets: 10,
    historicalRunsPerBall: 1.35,
  }),

  ODI: Object.freeze({
    ballsPerInnings: 300,
    ballsPerOver: 6,
    powerplayBalls: 60,
    maxWickets: 10,
    historicalRunsPerBall: 0.95,
  }),

  TEST: Object.freeze({
    ballsPerInnings: 450,
    ballsPerOver: 6,
    powerplayBalls: 0,
    maxWickets: 10,
    historicalRunsPerBall: 0.55,
  }),

  T10: Object.freeze({
    ballsPerInnings: 60,
    ballsPerOver: 6,
    powerplayBalls: 18,
    maxWickets: 10,
    historicalRunsPerBall: 1.80,
  }),
});

/**
 * Returns format rules for the given format string, or null if unsupported.
 * @param {string} format
 * @returns {Object|null}
 */
export function getFormatRules(format) {
  if (!format) return FORMAT_RULES.T20;
  const norm = String(format).toUpperCase();
  if (FORMAT_RULES[norm]) return FORMAT_RULES[norm];

  if (norm.includes('ODI') || norm.includes('ONE-DAY') || norm.includes('ONE DAY') || norm.includes('LIST A') || norm.includes('50 OVER') || norm.includes('CWC LEAGUE') || norm.includes('50-OVER')) {
    return FORMAT_RULES.ODI;
  }
  if (norm.includes('TEST') || norm.includes('COUNTY') || norm.includes('FIRST CLASS') || norm.includes('4-DAY')) {
    return FORMAT_RULES.TEST;
  }
  if (norm.includes('100') || norm.includes('HUNDRED')) {
    return FORMAT_RULES.THE_HUNDRED;
  }
  if (norm.includes('T10') || norm.includes('TEN10') || norm.includes('10-OVER') || norm.includes('10 OVER')) {
    return FORMAT_RULES.T10;
  }
  if (norm.includes('T20') || norm.includes('TWENTY20') || norm.includes('20-OVER')) {
    return FORMAT_RULES.T20;
  }
  return null;
}

/**
 * Returns all supported format names.
 * @returns {string[]}
 */
export function getSupportedFormats() {
  return Object.keys(FORMAT_RULES);
}

/**
 * Detect format from the full match blob. League/series T10 must win over a generic T20 matchType.
 */
export function resolveCricketFormat(match) {
  return resolveCricketOversFormat(match);
}

/**
 * Next legal delivery after `ballsCompleted` balls in the innings.
 * At 6.0 overs (36 balls) the next ball is Over 7 Ball 1, not Over 6 Ball 6.
 */
export function nextBallSlot(ballsCompleted, ballsPerOver = 6) {
  const balls = Math.max(0, Number(ballsCompleted) || 0);
  const perOver = Math.max(1, Number(ballsPerOver) || 6);
  // Start of innings: next over to bet is over 1 (not 2)
  if (balls === 0) {
    return {
      overNum: 1,
      ballNum: 1,
      nextOverNum: 1,
      currentOverComplete: false,
    };
  }
  const finishedOvers = Math.floor(balls / perOver);
  const intoOver = balls % perOver;
  if (intoOver === 0) {
    return {
      overNum: finishedOvers + 1,
      ballNum: 1,
      nextOverNum: finishedOvers + 1,
      currentOverComplete: true,
    };
  }
  return {
    overNum: finishedOvers + 1,
    ballNum: intoOver + 1,
    nextOverNum: finishedOvers + 2,
    currentOverComplete: false,
  };
}
