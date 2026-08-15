/**
 * OddsEngineV3 — Cricket Format Rules
 * 
 * Defines format-specific constants for supported cricket formats.
 * Extensible: supports THE_HUNDRED, T20, ODI, TEST, T10.
 */

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
  if (norm.includes('T10') || norm.includes('TEN10') || norm.includes('10-OVER')) {
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
