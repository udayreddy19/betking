/**
 * OddsEngineV3 — Candidate 002: Regime-Specific Model Blending
 * 
 * Dynamically adjusts Bayesian blending weights between internal physics models
 * and external provider consensus based on the detected operational match regime.
 * 
 * SHADOW ONLY: Operates in offline/shadow mode.
 */

export const PRICING_REGIMES = Object.freeze({
  NORMAL: 'NORMAL',
  EARLY_GAME: 'EARLY_GAME',
  HIGH_VOLATILITY: 'HIGH_VOLATILITY',
  LATE_GAME: 'LATE_GAME',
  HIGH_PROVIDER_DISAGREEMENT: 'HIGH_PROVIDER_DISAGREEMENT',
  STALE_PROVIDER: 'STALE_PROVIDER',
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
});

const REGIME_WEIGHT_PROFILES = {
  [PRICING_REGIMES.NORMAL]:                     { modelWeight: 0.60, providerWeight: 0.40 },
  [PRICING_REGIMES.EARLY_GAME]:                 { modelWeight: 0.45, providerWeight: 0.55 },
  [PRICING_REGIMES.HIGH_VOLATILITY]:            { modelWeight: 0.70, providerWeight: 0.30 },
  [PRICING_REGIMES.LATE_GAME]:                  { modelWeight: 0.80, providerWeight: 0.20 },
  [PRICING_REGIMES.HIGH_PROVIDER_DISAGREEMENT]: { modelWeight: 0.85, providerWeight: 0.15 },
  [PRICING_REGIMES.STALE_PROVIDER]:             { modelWeight: 1.00, providerWeight: 0.00 },
  [PRICING_REGIMES.LOW_CONFIDENCE]:             { modelWeight: 0.50, providerWeight: 0.50 },
};

/**
 * Detects the active operational regime from match state and feed telemetry.
 */
export function detectPricingRegime({
  sport = 'cricket',
  matchState = {},
  providerDisagreement = 0.02,
  feedAgeMs = 150,
  volatilityScore = 0.05,
} = {}) {
  if (feedAgeMs > 10000) {
    return PRICING_REGIMES.STALE_PROVIDER;
  }

  if (providerDisagreement > 0.15) {
    return PRICING_REGIMES.HIGH_PROVIDER_DISAGREEMENT;
  }

  if (volatilityScore > 0.35) {
    return PRICING_REGIMES.HIGH_VOLATILITY;
  }

  if (sport === 'cricket') {
    const ballsRemaining = matchState.ballsRemaining ?? (120 - (matchState.ballsCompleted || 0));
    if (ballsRemaining <= 24 && ballsRemaining > 0) {
      return PRICING_REGIMES.LATE_GAME;
    }
    if ((matchState.ballsCompleted || 0) <= 18) {
      return PRICING_REGIMES.EARLY_GAME;
    }
  } else if (sport === 'soccer') {
    const minute = matchState.minute || 0;
    if (minute >= 80) return PRICING_REGIMES.LATE_GAME;
    if (minute <= 15) return PRICING_REGIMES.EARLY_GAME;
  }

  return PRICING_REGIMES.NORMAL;
}

/**
 * Blends model and provider probabilities using candidate regime weights.
 */
export function blendByRegime({
  modelProb,
  providerProb,
  regime = null,
  context = {},
} = {}) {
  const activeRegime = regime || detectPricingRegime(context);
  const profile = REGIME_WEIGHT_PROFILES[activeRegime] || REGIME_WEIGHT_PROFILES[PRICING_REGIMES.NORMAL];

  const pModel = Math.max(0.001, Math.min(0.999, Number(modelProb) || 0.5));
  const pProv = providerProb != null && Number.isFinite(providerProb)
    ? Math.max(0.001, Math.min(0.999, Number(providerProb)))
    : pModel;

  const totalW = profile.modelWeight + profile.providerWeight;
  const normModelW = profile.modelWeight / totalW;
  const normProvW = profile.providerWeight / totalW;

  const blendedP = normModelW * pModel + normProvW * pProv;

  return {
    candidateVersion: 'v3.2-candidate-002',
    regime: activeRegime,
    blendedProbability: Number(blendedP.toFixed(4)),
    weights: {
      modelWeight: profile.modelWeight,
      providerWeight: profile.providerWeight,
    },
    fairOdds: Number((1 / blendedP).toFixed(4)),
  };
}
