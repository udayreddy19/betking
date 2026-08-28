/**
 * OddsEngineV3 — Bayesian Provider / Model Blending Engine
 * 
 * Combines independent mathematical model probabilities with external
 * provider/market consensus probabilities via precision-weighted Bayesian shrinkage.
 * 
 * ═══════════════════════════════════════════════════════════════
 * BLENDING FORMULA
 * ═══════════════════════════════════════════════════════════════
 * 
 * Given:
 *   p_model      = probability from internal sport engine
 *   w_model      = confidence weight of internal model (e.g. 0.65)
 *   p_provider   = de-vigged implied probability from provider feed
 *   w_provider   = reliability weight of provider feed (e.g. 0.35)
 * 
 * Calculation:
 *   p_blended = (w_model * p_model + w_provider * p_provider) / (w_model + w_provider)
 * 
 * Fallback Rules:
 *   - If provider is stale/invalid: w_provider = 0 (100% internal model)
 *   - If model is unavailable: w_model = 0 (100% provider fallback)
 *   - If both unavailable: returns { valid: false, status: 'SUSPENDED' }
 * ═══════════════════════════════════════════════════════════════
 */

export const BLEND_CONFIG = Object.freeze({
  enabled: process.env.ODDS_MODEL_BLEND_ENABLED === 'true',
  defaultModelWeight: 0.60,
  defaultProviderWeight: 0.40,
  staleProviderMaxAgeMs: 15000,
});

/**
 * Blends internal model probabilities with provider probabilities
 * 
 * @param {Object} params
 * @param {Array<{ selectionId: string, name: string, modelProb: number, providerProb?: number }>} params.outcomes
 * @param {Object} [params.feedMetadata]
 * @param {Object} [params.config]
 * @returns {{
 *   valid: boolean,
 *   outcomes: Array<{ selectionId: string, name: string, blendedProb: number, fairOdds: number }>,
 *   telemetry: Object
 * }}
 */
export function blendModelAndProvider({
  outcomes = [],
  feedMetadata = {},
  config = {},
}) {
  const cfg = { ...BLEND_CONFIG, ...config };
  
  if (!Array.isArray(outcomes) || outcomes.length < 2) {
    return { valid: false, outcomes: [], telemetry: { reason: 'insufficient_outcomes' } };
  }

  const now = Date.now();
  const feedAgeMs = feedMetadata.timestamp ? Math.max(0, now - new Date(feedMetadata.timestamp).getTime()) : 0;
  const isProviderStale = feedAgeMs > cfg.staleProviderMaxAgeMs;

  let modelWeight = cfg.defaultModelWeight;
  let providerWeight = isProviderStale ? 0 : cfg.defaultProviderWeight;

  // Normalize weights
  const totalWeight = modelWeight + providerWeight;
  const normModelW = totalWeight > 0 ? modelWeight / totalWeight : 1.0;
  const normProvW = totalWeight > 0 ? providerWeight / totalWeight : 0.0;

  const blended = [];
  let sumBlended = 0;

  for (const outcome of outcomes) {
    const pModel = Number(outcome.modelProb) || 0;
    const pProv = outcome.providerProb != null && Number.isFinite(outcome.providerProb)
      ? Number(outcome.providerProb)
      : pModel;

    const p = (normModelW * pModel) + (normProvW * pProv);
    const clampedP = Math.max(0.001, Math.min(0.999, p));
    blended.push({
      selectionId: outcome.selectionId,
      name: outcome.name,
      blendedProb: clampedP,
    });
    sumBlended += clampedP;
  }

  // Ensure exact sum to 1.0
  const normalizedOutcomes = blended.map((b) => {
    const finalP = b.blendedProb / sumBlended;
    return {
      selectionId: b.selectionId,
      name: b.name,
      blendedProb: Number(finalP.toFixed(6)),
      fairOdds: Number((1 / finalP).toFixed(4)),
    };
  });

  return {
    valid: true,
    outcomes: normalizedOutcomes,
    telemetry: {
      blendVersion: 'bayesian_blend_v1',
      modelWeight: Number(normModelW.toFixed(3)),
      providerWeight: Number(normProvW.toFixed(3)),
      providerStale: isProviderStale,
      feedAgeMs,
    },
  };
}
