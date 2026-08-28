/**
 * OddsEngineV3 — Empirical SGP Correlation (Rho) Research Engine
 * 
 * Computes empirical Pearson phi coefficient (binary correlation)
 * between paired historical market outcomes:
 *   rho_empirical = (P(A=1, B=1) - P(A=1)*P(B=1)) / sqrt(P(A=1)*P(A=0)*P(B=1)*P(B=0))
 * 
 * Compares against configured model assumption rho.
 */

export function calculateEmpiricalRho(pairedObservations = [], { marketTypeA = 'match_winner', marketTypeB = 'team_total', configuredRho = 0.50 } = {}) {
  if (!Array.isArray(pairedObservations) || pairedObservations.length < 5) {
    return {
      status: 'INSUFFICIENT_DATA',
      sampleSize: pairedObservations.length,
      marketPair: `${marketTypeA} + ${marketTypeB}`,
      configuredRho,
      empiricalRho: null,
      rhoDifference: null,
      confidence: 'LOW',
    };
  }

  let n11 = 0; // Both won
  let n10 = 0; // A won, B lost
  let n01 = 0; // A lost, B won
  let n00 = 0; // Both lost

  for (const pair of pairedObservations) {
    const a = pair.wonA ? 1 : 0;
    const b = pair.wonB ? 1 : 0;

    if (a === 1 && b === 1) n11++;
    else if (a === 1 && b === 0) n10++;
    else if (a === 0 && b === 1) n01++;
    else n00++;
  }

  const N = pairedObservations.length;
  const pA = (n11 + n10) / N;
  const pB = (n11 + n01) / N;
  const pJoint = n11 / N;

  const denom = Math.sqrt(pA * (1 - pA) * pB * (1 - pB));
  if (denom === 0) {
    return {
      status: 'ZERO_VARIANCE',
      sampleSize: N,
      marketPair: `${marketTypeA} + ${marketTypeB}`,
      configuredRho,
      empiricalRho: 0.0,
      rhoDifference: Number((0.0 - configuredRho).toFixed(4)),
      confidence: 'LOW',
    };
  }

  const empiricalRho = Number(((pJoint - pA * pB) / denom).toFixed(4));
  const diff = Number((empiricalRho - configuredRho).toFixed(4));

  const confidence = N >= 50 ? 'HIGH' : (N >= 20 ? 'MEDIUM' : 'LOW');

  return {
    status: 'COMPLETED',
    sampleSize: N,
    marketPair: `${marketTypeA} + ${marketTypeB}`,
    pA: Number(pA.toFixed(4)),
    pB: Number(pB.toFixed(4)),
    pJoint: Number(pJoint.toFixed(4)),
    configuredRho,
    empiricalRho,
    rhoDifference: diff,
    confidence,
    recommendation: Math.abs(diff) > 0.20 && confidence === 'HIGH' ? 'RECOMMEND_RHO_ADJUSTMENT' : 'RETAIN_CURRENT_RHO',
  };
}
