/**
 * Format resource tables (DLS-style remaining resources, simplified).
 * resource(wicketsInHand, ballsRemainingFraction) ≈ % of innings runs still available.
 */

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** Approximate remaining resource % given wickets in hand and balls fraction left. */
export function remainingResourcePct({ wicketsInHand, ballsRemaining, ballsPerInnings }) {
  const maxW = 10;
  const w = clamp(Number(wicketsInHand) || 0, 0, maxW);
  const ballsLeft = Math.max(0, Number(ballsRemaining) || 0);
  const ballsTotal = Math.max(1, Number(ballsPerInnings) || 120);
  const ballFrac = clamp(ballsLeft / ballsTotal, 0, 1);

  // Wickets remaining weight: lose resources faster as wickets fall.
  const wicketFrac = clamp(w / maxW, 0, 1);
  // Convex combo used by many simplified resource models.
  const resource = 100 * (0.55 * ballFrac + 0.45 * ballFrac * Math.pow(wicketFrac, 0.65));
  return clamp(resource, 0.5, 100);
}

/** Expected remaining runs at full resources for format. */
export function formatFullInningsExpectation(format = 'T20') {
  switch (String(format)) {
    case 'T10': return 95;
    case 'THE_HUNDRED': return 145;
    case 'ODI':
    case 'LIST_A': return 265;
    case 'TEST': return 320;
    case 'T20':
    default: return 165;
  }
}

export function expectedRemainingRuns(state) {
  const full = formatFullInningsExpectation(state.format);
  const pct = remainingResourcePct({
    wicketsInHand: state.wicketsInHand,
    ballsRemaining: state.ballsRemaining,
    ballsPerInnings: state.ballsPerInnings,
  });
  return full * (pct / 100);
}
