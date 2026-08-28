/**
 * OddsEngineV3 — RiskCalculator
 * 
 * Bounded liability-aware risk shading.
 * 
 * Adjusts fair/margined probability based on open market exposure and net liability,
 * shortening the price on heavily exposed outcomes to deter further one-sided flow
 * and lengthening under-backed outcomes to balance the book.
 * 
 * ═══════════════════════════════════════════════════════════════
 * MATHEMATICAL MODEL (Bounded Logistic Skew)
 * ═══════════════════════════════════════════════════════════════
 * 
 * Given:
 *   p_orig        = margined probability before risk adjustment
 *   netLiability  = net operator payout liability on selection if it wins
 *   marketCapacity= configurable market risk tolerance limit (default: 50,000 INR)
 *   gamma         = sensitivity factor (default: 0.08)
 * 
 * Calculation:
 *   exposureRatio = clamp(netLiability / marketCapacity, -1.0, 1.0)
 *   deltaP        = gamma * exposureRatio
 *   p_risk        = clamp(p_orig + deltaP, 0.01, 0.99)
 *   odds_risk     = 1 / p_risk
 * 
 * Invariants Enforced:
 *   1. Probability remains strictly within (0, 1)
 *   2. Final Odds are bounded [MIN_DECIMAL_ODDS, MAX_ODDS]
 *   3. Monotonic: higher liability always produces higher probability (lower odds)
 *   4. Zero liability produces deltaP = 0 (exact original odds preserved)
 *   5. Deterministic and fully auditable
 * ═══════════════════════════════════════════════════════════════
 */

import { PRICING_CONFIG } from '../../engines/pricingConfig.mjs';
import { MIN_DECIMAL_ODDS } from './MarginCalculator.mjs';

export const DEFAULT_RISK_CONFIG = Object.freeze({
  enabled: process.env.ODDS_RISK_SHADING_ENABLED === 'true',
  sensitivityGamma: 0.06,          // Maximum 6% probability shift
  defaultMarketCapacity: 100000,   // ₹1,00,000 default market capacity
  maxProbabilityShift: 0.08,       // Hard ceiling on deltaP (8%)
});

/**
 * Calculates risk-shaded probability and odds for a selection.
 * 
 * @param {Object} params
 * @param {number} params.probability      - Margined or fair probability
 * @param {number} [params.netLiability=0] - Net operator financial liability
 * @param {number} [params.capacity]       - Market capacity limit
 * @param {Object} [params.config]         - Override risk parameters
 * @returns {{
 *   probability: number,
 *   odds: number,
 *   riskShift: number,
 *   liabilityBucket: string,
 *   telemetry: Object
 * }}
 */
export function calculateRiskShadedPrice({
  probability,
  netLiability = 0,
  capacity,
  config = {},
}) {
  const cfg = { ...DEFAULT_RISK_CONFIG, ...config };
  
  if (typeof probability !== 'number' || !Number.isFinite(probability) || probability <= 0 || probability >= 1) {
    throw new Error(`RiskCalculator: invalid input probability ${probability}`);
  }

  const cleanLiability = Number.isFinite(netLiability) ? Number(netLiability) : 0;
  const marketCap = Math.max(1000, Number(capacity || cfg.defaultMarketCapacity));

  // If risk shading is disabled or net liability is negligible (< 100), return original
  if (!cfg.enabled || Math.abs(cleanLiability) < 100) {
    const unshadedOdds = Number(Math.min(PRICING_CONFIG.MAX_ODDS, Math.max(MIN_DECIMAL_ODDS, 1 / probability)).toFixed(4));
    return {
      probability,
      odds: unshadedOdds,
      riskShift: 0,
      liabilityBucket: cleanLiability >= 0 ? 'LOW_POSITIVE' : 'LOW_NEGATIVE',
      telemetry: {
        rawLiability: cleanLiability,
        marketCapacity: marketCap,
        appliedShift: 0,
        shaded: false,
      },
    };
  }

  // Bounded exposure ratio in [-1.0, 1.0]
  const exposureRatio = Math.max(-1.0, Math.min(1.0, cleanLiability / marketCap));
  const rawShift = exposureRatio * cfg.sensitivityGamma;
  const clampedShift = Math.max(-cfg.maxProbabilityShift, Math.min(cfg.maxProbabilityShift, rawShift));

  // Shaded probability: if netLiability > 0 (heavy payout), increase probability to lower the odds
  const shadedP = Math.max(0.01, Math.min(0.99, probability + clampedShift));
  const rawOdds = 1 / shadedP;
  const boundedOdds = Number(Math.min(PRICING_CONFIG.MAX_ODDS, Math.max(MIN_DECIMAL_ODDS, rawOdds)).toFixed(4));

  // Bucket classification for telemetry
  let bucket = 'BALANCED';
  if (cleanLiability > marketCap * 0.75) bucket = 'CRITICAL_HIGH';
  else if (cleanLiability > marketCap * 0.4) bucket = 'ELEVATED';
  else if (cleanLiability < -marketCap * 0.4) bucket = 'UNDER_BACKED';

  return {
    probability: Number(shadedP.toFixed(6)),
    odds: boundedOdds,
    riskShift: Number(clampedShift.toFixed(6)),
    liabilityBucket: bucket,
    telemetry: {
      rawLiability: cleanLiability,
      marketCapacity: marketCap,
      exposureRatio: Number(exposureRatio.toFixed(4)),
      appliedShift: Number(clampedShift.toFixed(6)),
      shaded: true,
    },
  };
}

/**
 * Backward-compatible single odds risk adjustment function.
 * @param {number} odds 
 * @param {number} netLiability 
 * @returns {number}
 */
export function applyRiskAdjustment(odds, netLiability = 0) {
  if (!Number.isFinite(odds) || odds <= MIN_DECIMAL_ODDS) return odds;
  const p = 1 / odds;
  const shaded = calculateRiskShadedPrice({ probability: p, netLiability });
  return shaded.odds;
}
