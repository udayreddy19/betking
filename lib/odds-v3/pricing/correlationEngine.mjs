/**
 * OddsEngineV3 — Cross-Market Correlation & Same Game Parlay (SGP) Engine
 * 
 * Computes joint probabilities for correlated selections within the same match
 * using a Bivariate Gaussian Copula approximation to ensure the operator retains
 * positive expected margin on accumulator combinations.
 * 
 * ═══════════════════════════════════════════════════════════════
 * CORRELATION MATRIX (Standard Market Relationships)
 * ═══════════════════════════════════════════════════════════════
 * 
 * 1. Match Winner (Team A) <-> Team Total (Team A Over): rho = +0.55
 * 2. Match Winner (Team A) <-> Team Total (Team A Under): rho = -0.45
 * 3. Match Winner (Team A) <-> Top Batsman / Scorer (Team A): rho = +0.35
 * 4. Team Total (Over) <-> Match Total (Over): rho = +0.65
 * 5. Opposing Winner Selections (Team A <-> Team B): rho = -1.00 (Mutually Exclusive)
 * ═══════════════════════════════════════════════════════════════
 */

// Inverse normal CDF (Acklam approximation)
function invNormalCDF(p) {
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680133088879687e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];

  const q = Math.min(0.999999, Math.max(0.000001, p));
  if (q < 0.02425) {
    const r = Math.sqrt(-2 * Math.log(q));
    return (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) /
           ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
  }
  if (q > 1 - 0.02425) {
    const r = Math.sqrt(-2 * Math.log(1 - q));
    return -(((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) /
            ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
  }
  const r = q - 0.5;
  const s = r * r;
  return (((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r /
         (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
}

function bivariateNormalCDF(z1, z2, rho) {
  // Direct numerical approximation for bivariate Gaussian copula integral
  const r = Math.max(-0.99, Math.min(0.99, rho));
  if (Math.abs(r) < 0.001) {
    return (1 / (1 + Math.exp(-1.7 * z1))) * (1 / (1 + Math.exp(-1.7 * z2)));
  }
  // Fast Gaussian Quadrature approximation
  const p1 = 1 / (1 + Math.exp(-1.7 * z1));
  const p2 = 1 / (1 + Math.exp(-1.7 * z2));
  const cov = r * Math.sqrt(p1 * (1 - p1) * p2 * (1 - p2));
  return Math.max(0.0001, Math.min(Math.min(p1, p2), (p1 * p2) + cov));
}

/**
 * Resolves correlation coefficient (rho) between two markets
 */
export function resolveCorrelationCoefficient(marketTypeA, marketTypeB, isSameTeam = true) {
  if (marketTypeA === marketTypeB) {
    return isSameTeam ? 1.0 : -1.0;
  }
  if ((marketTypeA === 'match_winner' && marketTypeB === 'team_total') ||
      (marketTypeA === 'team_total' && marketTypeB === 'match_winner')) {
    return isSameTeam ? 0.50 : -0.40;
  }
  if ((marketTypeA === 'team_total' && marketTypeB === 'match_total') ||
      (marketTypeA === 'match_total' && marketTypeB === 'team_total')) {
    return 0.60;
  }
  if ((marketTypeA === 'player_runs' && marketTypeB === 'match_winner') ||
      (marketTypeA === 'match_winner' && marketTypeB === 'player_runs')) {
    return isSameTeam ? 0.35 : -0.20;
  }
  return 0.0; // Independent default
}

/**
 * Calculates joint probability and final SGP parlay odds
 * 
 * @param {Array<{ marketType: string, probability: number, isSameTeam?: boolean }>} legs
 * @param {number} [parlayMargin=0.08] - Configured accumulator margin (8%)
 * @returns {{
 *   valid: boolean,
 *   jointProbability: number,
 *   independentProbability: number,
 *   sgpOdds: number,
 *   correlationApplied: boolean,
 *   telemetry: Object
 * }}
 */
export function calculateSgpJointOdds(legs = [], parlayMargin = 0.08) {
  if (!Array.isArray(legs) || legs.length < 2) {
    return { valid: false, jointProbability: 0, sgpOdds: 1.01, correlationApplied: false, telemetry: { reason: 'insufficient_legs' } };
  }

  // Check for mutually contradictory selections
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      const rho = resolveCorrelationCoefficient(legs[i].marketType, legs[j].marketType, legs[i].isSameTeam === legs[j].isSameTeam);
      if (rho <= -0.95) {
        return { valid: false, jointProbability: 0, sgpOdds: 0, correlationApplied: true, telemetry: { reason: 'mutually_exclusive_legs' } };
      }
    }
  }

  let jointP = legs[0].probability;
  let indepP = legs[0].probability;

  for (let i = 1; i < legs.length; i++) {
    const p1 = jointP;
    const p2 = legs[i].probability;
    indepP *= p2;

    const rho = resolveCorrelationCoefficient(legs[i - 1].marketType, legs[i].marketType, legs[i - 1].isSameTeam === legs[i].isSameTeam);
    if (Math.abs(rho) > 0.01) {
      const z1 = invNormalCDF(p1);
      const z2 = invNormalCDF(p2);
      jointP = bivariateNormalCDF(z1, z2, rho);
    } else {
      jointP *= p2;
    }
  }

  // Ensure joint probability is mathematically valid and bounded
  const cleanJointP = Math.max(0.0001, Math.min(Math.min(...legs.map(l => l.probability)), jointP));
  const marginedP = cleanJointP * (1 + parlayMargin);
  const sgpOdds = Number(Math.max(1.01, Math.min(1000.0, 1 / marginedP)).toFixed(2));

  return {
    valid: true,
    jointProbability: Number(cleanJointP.toFixed(6)),
    independentProbability: Number(indepP.toFixed(6)),
    sgpOdds,
    correlationApplied: Math.abs(cleanJointP - indepP) > 0.001,
    telemetry: {
      legCount: legs.length,
      correlationFactor: Number((cleanJointP / Math.max(0.0001, indepP)).toFixed(3)),
    },
  };
}
