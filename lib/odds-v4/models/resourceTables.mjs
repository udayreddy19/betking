/**
 * resourceTables.mjs
 *
 * OddsEngineV4 — Format-Aware Cricket Resource Model.
 * Supports:
 *   - T20 & SRL (120 balls, standard 20-over DLS parameters)
 *   - T10 (60 balls, accelerated resource decay)
 *   - ODI & LIST_A (300 balls, 50-over DLS curves)
 *   - THE_HUNDRED (100 legal deliveries — never converts to 6-ball overs)
 *   - TEST & FIRST_CLASS (Unbounded ball budget; returns null when ballsRemaining is unknown)
 *
 * When resource certainty is insufficient: does NOT invent a value.
 */

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Format-specific full innings average par scores.
 */
export function formatFullInningsExpectation(format = 'T20') {
  const norm = String(format || 'T20').toUpperCase();
  if (norm.includes('T10')) return 105;
  if (norm.includes('HUNDRED') || norm === 'THE_HUNDRED') return 148;
  if (norm.includes('ODI') || norm.includes('LIST_A') || norm.includes('50')) return 285;
  if (norm.includes('TEST') || norm.includes('FIRST_CLASS')) return 330;
  // T20, SRL, default
  return 172;
}

/**
 * DLS-style resource percentage remaining.
 *
 * @param {Object} params
 * @param {number} params.wicketsInHand - 0 to 10
 * @param {number|null} params.ballsRemaining - balls left (or legal deliveries for Hundred)
 * @param {number} [params.ballsPerInnings] - total balls in an innings
 * @param {string} [params.format='T20'] - cricket format
 * @returns {number|null} remaining resource percentage (0 to 100), or null if indeterminate
 */
export function remainingResourcePct({
  wicketsInHand,
  ballsRemaining,
  ballsPerInnings,
  format = 'T20',
}) {
  const normFormat = String(format || 'T20').toUpperCase();
  const isTest = normFormat.includes('TEST') || normFormat.includes('FIRST_CLASS');

  // Priority 6: For Test, ballsRemaining may legitimately be null.
  // Never invent a value when resource certainty is insufficient.
  if (isTest) {
    if (ballsRemaining == null || !Number.isFinite(Number(ballsRemaining))) {
      return null;
    }
  }

  if (ballsRemaining == null) {
    return null;
  }

  const w = clamp(Number(wicketsInHand) || 0, 0, 10);
  if (w === 0) return 0;

  const ballsLeft = Math.max(0, Number(ballsRemaining) || 0);
  if (ballsLeft === 0) return 0;

  // Format-specific total ball budgets
  let totalBalls = Number(ballsPerInnings);
  if (!Number.isFinite(totalBalls) || totalBalls <= 0) {
    if (normFormat.includes('T10')) totalBalls = 60;
    else if (normFormat.includes('HUNDRED')) totalBalls = 100;
    else if (normFormat.includes('ODI') || normFormat.includes('LIST_A')) totalBalls = 300;
    else if (isTest) totalBalls = 450; // only used if ballsRemaining is explicitly provided
    else totalBalls = 120;
  }

  const ballFrac = clamp(ballsLeft / totalBalls, 0, 1);
  const wicketFrac = clamp(w / 10, 0, 1);

  // Format-specific DLS exponent shapes:
  // ODI: early wickets cost more; balls decay more slowly
  // T20: balanced ball and wicket decay
  // T10: wicket decay is steeper; fewer balls to recover
  // Hundred: based strictly on 100 legal deliveries
  if (normFormat.includes('ODI') || normFormat.includes('LIST_A')) {
    const b = 0.045 + 0.040 * (1 - wicketFrac);
    const oversLeft = ballsLeft / 6;
    const rPct = 100 * (1 - Math.exp(-b * oversLeft)) * Math.pow(wicketFrac, 0.55);
    return clamp(Number(rPct.toFixed(2)), 0, 100);
  }

  if (normFormat.includes('T10')) {
    const rPct = 100 * (0.40 * ballFrac + 0.60 * ballFrac * Math.pow(wicketFrac, 0.85));
    return clamp(Number(rPct.toFixed(2)), 0, 100);
  }

  if (normFormat.includes('HUNDRED') || normFormat === 'THE_HUNDRED') {
    // 100 legal deliveries (not traditional overs)
    const deliveriesFrac = clamp(ballsLeft / 100, 0, 1);
    const rPct = 100 * (0.50 * deliveriesFrac + 0.50 * deliveriesFrac * Math.pow(wicketFrac, 0.70));
    return clamp(Number(rPct.toFixed(2)), 0, 100);
  }

  // T20 / SRL / Default
  const rPct = 100 * (0.52 * ballFrac + 0.48 * ballFrac * Math.pow(wicketFrac, 0.65));
  return clamp(Number(rPct.toFixed(2)), 0, 100);
}

/**
 * Expected runs remaining in the innings.
 * Returns null for Test matches with indeterminate balls remaining.
 */
export function expectedRemainingRuns({
  format = 'T20',
  wicketsInHand,
  ballsRemaining,
  ballsPerInnings,
}) {
  const normFormat = String(format || 'T20').toUpperCase();
  const isTest = normFormat.includes('TEST') || normFormat.includes('FIRST_CLASS');

  if (isTest && (ballsRemaining == null || !Number.isFinite(Number(ballsRemaining)))) {
    return null;
  }

  const pct = remainingResourcePct({
    wicketsInHand,
    ballsRemaining,
    ballsPerInnings,
    format,
  });

  if (pct == null) return null;

  const full = formatFullInningsExpectation(format);
  return Number((full * (pct / 100)).toFixed(2));
}
