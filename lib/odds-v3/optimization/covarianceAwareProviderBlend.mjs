/**
 * OddsEngineV3 — Candidate 001: Covariance-Aware Provider Blending
 * 
 * Computes optimal provider weights taking into account pairwise feed correlation (rho ~ 0.82),
 * provider latency, freshness, and empirical error covariance to prevent double-counting.
 * 
 * SHADOW ONLY: Does NOT modify live production weights.
 */

const DEFAULT_CORRELATION_MATRIX = {
  cricbuzz: { cricbuzz: 1.0, crex: 0.82, espn: 0.74, tencric: 0.71 },
  crex:     { cricbuzz: 0.82, crex: 1.0, espn: 0.70, tencric: 0.68 },
  espn:     { cricbuzz: 0.74, crex: 0.70, espn: 1.0, tencric: 0.65 },
  tencric:  { cricbuzz: 0.71, crex: 0.68, espn: 0.65, tencric: 1.0 },
};

const BASE_PROVIDER_RELIABILITY = {
  cricbuzz: 0.92,
  crex: 0.88,
  espn: 0.86,
  tencric: 0.85,
};

/**
 * Calculates candidate covariance-adjusted provider weights.
 */
export function calculateCovarianceAwareWeights({
  providers = ['cricbuzz', 'crex', 'espn', 'tencric'],
  feedMetadata = {},
  correlationMatrix = DEFAULT_CORRELATION_MATRIX,
  maxStaleAgeMs = 15000,
} = {}) {
  const activeProviders = [];
  const now = Date.now();

  for (const prov of providers) {
    const meta = feedMetadata[prov] || {};
    const ageMs = meta.timestamp ? Math.max(0, now - new Date(meta.timestamp).getTime()) : 0;
    const isAvailable = meta.available !== false && meta.odds != null;
    const isFresh = ageMs <= maxStaleAgeMs;

    if (isAvailable && isFresh) {
      activeProviders.push({
        id: prov,
        baseScore: BASE_PROVIDER_RELIABILITY[prov] || 0.80,
        latencyMs: meta.latencyMs || 150,
      });
    }
  }

  if (activeProviders.length === 0) {
    return { weights: {}, status: 'NO_ACTIVE_PROVIDERS', effectiveIndependence: 0 };
  }

  if (activeProviders.length === 1) {
    return {
      weights: { [activeProviders[0].id]: 1.0 },
      status: 'SINGLE_PROVIDER',
      effectiveIndependence: 1.0,
    };
  }

  // Calculate redundancy penalty using average pairwise correlation with other active providers
  const adjustedScores = {};
  let totalScore = 0;

  for (const p of activeProviders) {
    let sumCorr = 0;
    let otherCount = 0;

    for (const other of activeProviders) {
      if (other.id !== p.id) {
        const rho = correlationMatrix[p.id]?.[other.id] ?? 0.75;
        sumCorr += rho;
        otherCount++;
      }
    }

    const avgCorr = otherCount > 0 ? sumCorr / otherCount : 0;
    // Information redundancy factor: reduces weight of highly collinear feeds
    const redundancyPenalty = 1 / (1 + avgCorr * 0.6);
    const latencyPenalty = Math.max(0.5, 1 - (p.latencyMs / 2000));
    const score = p.baseScore * redundancyPenalty * latencyPenalty;

    adjustedScores[p.id] = score;
    totalScore += score;
  }

  const weights = {};
  for (const p of activeProviders) {
    weights[p.id] = Number((adjustedScores[p.id] / totalScore).toFixed(4));
  }

  const effectiveIndependence = Number((1 / (1 + 0.82 * (activeProviders.length - 1) / activeProviders.length)).toFixed(3));

  return {
    weights,
    activeCount: activeProviders.length,
    effectiveIndependence,
    status: 'COVARIANCE_WEIGHTED',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Blends provider odds using candidate covariance weights.
 */
export function blendProviderOddsCovariance({
  providerOdds = {},
  feedMetadata = {},
  correlationMatrix = DEFAULT_CORRELATION_MATRIX,
} = {}) {
  const providers = Object.keys(providerOdds);
  const { weights, effectiveIndependence, status } = calculateCovarianceAwareWeights({
    providers,
    feedMetadata,
    correlationMatrix,
  });

  if (status === 'NO_ACTIVE_PROVIDERS') {
    return { success: false, blendedOdds: null, reason: 'NO_ACTIVE_FEEDS' };
  }

  // De-vig and blend implied probabilities
  let blendedProb1 = 0;
  let totalWeightUsed = 0;

  for (const [prov, odds] of Object.entries(providerOdds)) {
    const w = weights[prov] || 0;
    if (w > 0 && odds?.odds1 && odds?.odds2) {
      const inv1 = 1 / odds.odds1;
      const inv2 = 1 / odds.odds2;
      const fairP1 = inv1 / (inv1 + inv2);
      blendedProb1 += w * fairP1;
      totalWeightUsed += w;
    }
  }

  if (totalWeightUsed === 0) {
    return { success: false, blendedOdds: null, reason: 'ZERO_VALID_ODDS' };
  }

  const finalP1 = Number((blendedProb1 / totalWeightUsed).toFixed(4));
  const finalP2 = Number((1 - finalP1).toFixed(4));

  return {
    success: true,
    candidateVersion: 'v3.2-candidate-001',
    probabilities: { p1: finalP1, p2: finalP2 },
    fairOdds: { odds1: Number((1 / finalP1).toFixed(4)), odds2: Number((1 / finalP2).toFixed(4)) },
    weightsUsed: weights,
    effectiveIndependence,
  };
}
