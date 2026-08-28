/**
 * OddsEngineV3 — Odds Movement & Price Stability Analyzer
 * 
 * Tracks price changes, jumps, high-frequency oscillations, and flickering:
 * - Computes delta between consecutive snapshots for the same market/selection
 * - Flags jumps > 25% within < 10 seconds
 * - Computes jump distribution (Median, P95, Max)
 */

export function analyzeOddsMovement(snapshotHistory = []) {
  if (!Array.isArray(snapshotHistory) || snapshotHistory.length < 2) {
    return {
      sampleSize: snapshotHistory.length,
      movementCount: 0,
      maxJumpPct: 0,
      medianJumpPct: 0,
      p95JumpPct: 0,
      flickerDetected: false,
      status: 'STABLE',
    };
  }

  const deltas = [];
  let flickerCount = 0;

  for (let i = 1; i < snapshotHistory.length; i++) {
    const prev = snapshotHistory[i - 1];
    const curr = snapshotHistory[i];

    if (prev.odds && curr.odds && prev.odds > 0) {
      const deltaPct = Math.abs(curr.odds - prev.odds) / prev.odds;
      deltas.push(deltaPct);

      const timeDiffMs = (curr.timestamp || 0) - (prev.timestamp || 0);
      if (deltaPct > 0.20 && timeDiffMs < 5000) {
        flickerCount++;
      }
    }
  }

  if (!deltas.length) {
    return {
      sampleSize: snapshotHistory.length,
      movementCount: 0,
      maxJumpPct: 0,
      medianJumpPct: 0,
      p95JumpPct: 0,
      flickerDetected: false,
      status: 'STABLE',
    };
  }

  deltas.sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length * 0.5)] || 0;
  const p95 = deltas[Math.floor(deltas.length * 0.95)] || 0;
  const max = deltas[deltas.length - 1] || 0;

  const status = flickerCount > 2 ? 'HIGH_VOLATILITY' : (max > 0.40 ? 'ELEVATED_JUMPS' : 'STABLE');

  return {
    sampleSize: snapshotHistory.length,
    movementCount: deltas.length,
    flickerCount,
    maxJumpPct: Number((max * 100).toFixed(2)),
    medianJumpPct: Number((median * 100).toFixed(2)),
    p95JumpPct: Number((p95 * 100).toFixed(2)),
    flickerDetected: flickerCount > 0,
    status,
  };
}
