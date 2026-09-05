/**
 * OddsEngineV4 — DLS-style remaining resource tables (simplified).
 */

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function remainingResourcePct({ wicketsInHand, ballsRemaining, ballsPerInnings }) {
  const w = clamp(Number(wicketsInHand) || 0, 0, 10);
  const ballsLeft = Math.max(0, Number(ballsRemaining) || 0);
  const ballsTotal = Math.max(1, Number(ballsPerInnings) || 120);
  const ballFrac = clamp(ballsLeft / ballsTotal, 0, 1);
  const wicketFrac = clamp(w / 10, 0, 1);
  return clamp(100 * (0.55 * ballFrac + 0.45 * ballFrac * Math.pow(wicketFrac, 0.65)), 0.5, 100);
}

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

export function expectedRemainingRuns({
  format,
  wicketsInHand,
  ballsRemaining,
  ballsPerInnings,
}) {
  const full = formatFullInningsExpectation(format);
  const pct = remainingResourcePct({ wicketsInHand, ballsRemaining, ballsPerInnings });
  return full * (pct / 100);
}
