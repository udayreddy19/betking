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
  if (!format) return null;
  const norm = String(format).toUpperCase();
  return FORMAT_RULES[norm] ?? null;
}

/**
 * Returns all supported format names.
 * @returns {string[]}
 */
export function getSupportedFormats() {
  return Object.keys(FORMAT_RULES);
}
