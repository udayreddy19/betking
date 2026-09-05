/**
 * Cutover gate: recommend ODDS_ENGINE=v4 when shadow metrics pass.
 * Live publish mode: admin runtime toggle > ODDS_ENGINE env > v3.
 */

import { getShadowMetrics } from './ShadowHarness.mjs';
import { getRuntimeEngineMode, ensureEngineModeHydrated } from './EngineModeControl.mjs';

export const CUTOVER_THRESHOLDS = Object.freeze({
  minSamples: 50,
  minSameFavRate: 0.90,
  maxMedianShortDelta: 0.25,
});

/**
 * @param {{ metrics?: object, thresholds?: object, consecutiveDaysPass?: number }} [opts]
 */
export function evaluateCutoverReadiness(opts = {}) {
  const metrics = opts.metrics || getShadowMetrics();
  const t = { ...CUTOVER_THRESHOLDS, ...(opts.thresholds || {}) };
  const reasons = [];

  if (!(metrics.samples >= t.minSamples)) {
    reasons.push(`samples ${metrics.samples || 0} < ${t.minSamples}`);
  }
  if (!(metrics.sameFavRate >= t.minSameFavRate)) {
    reasons.push(`sameFavRate ${metrics.sameFavRate ?? 'n/a'} < ${t.minSameFavRate}`);
  }
  if (!(metrics.medianShortDelta != null && metrics.medianShortDelta <= t.maxMedianShortDelta)) {
    reasons.push(`medianShortDelta ${metrics.medianShortDelta ?? 'n/a'} > ${t.maxMedianShortDelta}`);
  }

  const ready = reasons.length === 0;
  return {
    ready,
    reasons,
    metrics,
    thresholds: t,
    recommendedEngine: ready ? 'v4' : 'v3',
    note: ready
      ? 'Shadow metrics pass — use admin engine toggle (or ODDS_ENGINE=v4) to cut over Match Winner pricing.'
      : 'Keep V3 or Shadow until thresholds pass for 7 consecutive days in prod.',
  };
}

/**
 * Resolve engine mode: explicit override > admin toggle > env > v3.
 * When ODDS_ENGINE=auto (and no admin override), promote to v4 only if cutover metrics pass.
 */
export function resolveOddsEngineMode(env = process.env, override = null) {
  if (override === 'v3' || override === 'v4' || override === 'shadow') return override;
  ensureEngineModeHydrated();
  const runtime = getRuntimeEngineMode();
  if (runtime === 'v3' || runtime === 'v4' || runtime === 'shadow') return runtime;
  const raw = String(env.ODDS_ENGINE || 'v3').toLowerCase().trim();
  if (raw === 'v4' || raw === 'shadow' || raw === 'v3') return raw;
  if (raw === 'auto') {
    const gate = evaluateCutoverReadiness({ metrics: getShadowMetrics() });
    return gate.ready ? 'v4' : 'v3';
  }
  return 'v3';
}

