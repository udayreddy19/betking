/**
 * ScoreDistributionEngine — projected remaining-run distributions for totals markets.
 * Uses resource-table mean + format-aware variance; O/U via normal CDF (continuity-corrected).
 */

import { expectedRemainingRuns, formatFullInningsExpectation } from './resourceTables.mjs';

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** Approximate Φ(z) — Abramowitz & Stegun 26.2.17 */
export function normalCdf(z) {
  const x = Number(z);
  if (!Number.isFinite(x)) return 0.5;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-0.5 * x * x);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

function formatRpb(format = 'T20') {
  const f = String(format || 'T20').toUpperCase();
  if (f.includes('T10')) return 1.75;
  if (f.includes('HUNDRED')) return 1.48;
  if (f.includes('ODI') || f.includes('LIST_A')) return 0.95;
  if (f.includes('TEST') || f.includes('FIRST_CLASS')) return 0.55;
  return 1.35; // T20 / SRL
}

/**
 * Remaining-run distribution for the batting side.
 */
export function remainingRunsDistribution({
  format,
  wicketsInHand,
  ballsRemaining,
  ballsPerInnings,
  momentumFactor = 1,
  haircut = 0.93,
}) {
  const meanRaw = expectedRemainingRuns({
    format,
    wicketsInHand,
    ballsRemaining,
    ballsPerInnings,
  });
  if (meanRaw == null || !Number.isFinite(meanRaw)) {
    return { mean: null, variance: null, sd: null, method: 'indeterminate' };
  }
  const mom = clamp(Number(momentumFactor) || 1, 0.82, 1.18);
  const h = Number.isFinite(haircut) && haircut > 0 ? haircut : 0.93;
  const mean = Math.max(0, meanRaw * h * mom);

  const balls = Math.max(0, Number(ballsRemaining) || 0);
  const wickets = clamp(Number(wicketsInHand) || 0, 0, 10);
  const rpb = formatRpb(format);
  // Variance grows with balls left; shrinks when few wickets remain.
  const wicketScale = 0.55 + 0.45 * (wickets / 10);
  const variance = Math.max(4, balls * rpb * rpb * 2.2 * wicketScale);
  return {
    mean,
    variance,
    sd: Math.sqrt(variance),
    method: 'resource_normal',
  };
}

/**
 * P(finalTotal > line) with continuity correction at line + 0.5 for .5 lines.
 */
export function pOverUnderFromDistribution(dist, line) {
  if (!dist || dist.mean == null || !(dist.sd > 0) || !Number.isFinite(Number(line))) {
    // Fail closed — never invent 50/50 fair prices from missing state.
    return { pOver: null, pUnder: null, suspended: true, method: 'fail_closed' };
  }
  const L = Number(line);
  const threshold = Number.isInteger(L) ? L + 0.5 : L;
  const z = (threshold - dist.mean) / dist.sd;
  let pUnder = normalCdf(z);
  pUnder = clamp(pUnder, 0.02, 0.98);
  return {
    pOver: 1 - pUnder,
    pUnder,
    method: dist.method || 'resource_normal',
    mean: dist.mean,
    sd: dist.sd,
  };
}

/**
 * Projected innings / team total distribution (current score + remaining).
 */
export function teamTotalDistribution({
  currentScore = 0,
  format,
  wicketsInHand,
  ballsRemaining,
  ballsPerInnings,
  momentumFactor = 1,
  haircut = 0.93,
  targetCap = null,
}) {
  const rem = remainingRunsDistribution({
    format,
    wicketsInHand,
    ballsRemaining,
    ballsPerInnings,
    momentumFactor,
    haircut,
  });
  if (rem.mean == null) {
    // Fail closed — insufficient state for a totals distribution.
    return {
      mean: null,
      variance: null,
      sd: null,
      suspended: true,
      method: 'fail_closed',
    };
  }
  let mean = (Number(currentScore) || 0) + rem.mean;
  if (targetCap != null && Number.isFinite(Number(targetCap))) {
    mean = Math.min(mean, Number(targetCap) + 2);
  }
  return {
    mean,
    variance: rem.variance,
    sd: rem.sd,
    method: rem.method,
  };
}

/**
 * Next-over runs distribution (single over ~ Poisson/Normal hybrid).
 */
export function nextOverRunsDistribution({ format, momentumFactor = 1 }) {
  const rpb = formatRpb(format);
  const mom = clamp(Number(momentumFactor) || 1, 0.82, 1.18);
  const mean = clamp(rpb * 6 * mom, 2.5, 16);
  const variance = Math.max(2.5, mean * 1.15);
  return { mean, variance, sd: Math.sqrt(variance), method: 'over_normal' };
}

export function pickBalancedLine(mean, { minLead = 0.5, floor = 0 } = {}) {
  const m = Math.max(Number(floor) || 0, Number(mean) || 0);
  const raw = Math.floor(m) + 0.5;
  return Math.max(raw, (Number(floor) || 0) + (Number(minLead) || 0.5));
}
