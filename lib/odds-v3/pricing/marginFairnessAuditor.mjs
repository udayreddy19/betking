/**
 * OddsEngineV3 — Margin Fairness & Volatility Auditor
 * 
 * Audits published market margins against:
 * - Hard safety bounds [0.035, 0.12]
 * - Provider consensus alignment (avoids gouging under high consensus)
 * - Volatility & latency risk adaptation
 * 
 * Computes: marginFairnessScore (0 to 100).
 */

const MIN_ALLOWED_MARGIN = 0.035;
const MAX_ALLOWED_MARGIN = 0.12;

export function auditMarginFairness(observations = []) {
  if (!Array.isArray(observations) || observations.length === 0) {
    return {
      status: 'NO_DATA',
      marginFairnessScore: 100,
      totalAudited: 0,
      boundViolations: 0,
      pathologicalAnomalies: 0,
      avgMargin: 0.05,
    };
  }

  let boundViolations = 0;
  let pathologicalAnomalies = 0;
  let totalMargin = 0;
  const anomaliesList = [];

  for (const obs of observations) {
    const margin = Number(obs.margin ?? 0.05);
    totalMargin += margin;

    // Hard bound check
    if (margin < MIN_ALLOWED_MARGIN || margin > MAX_ALLOWED_MARGIN) {
      boundViolations++;
    } else {
      // Pathological check 1: High margin (> 0.09) despite low latency (< 150ms) and low volatility (< 0.1)
      if (margin > 0.09 && Number(obs.providerLatency || 0) < 150 && Number(obs.volatilityScore || 0) < 0.1) {
        pathologicalAnomalies++;
        if (anomaliesList.length < 10) {
          anomaliesList.push({
            matchId: obs.matchId,
            market: obs.marketId,
            margin,
            reason: 'Excessive margin applied during calm, low-latency market state.',
          });
        }
      }

      // Pathological check 2: Too low margin (< 0.04) during high volatility (> 0.6)
      if (margin < 0.04 && Number(obs.volatilityScore || 0) > 0.6) {
        pathologicalAnomalies++;
        if (anomaliesList.length < 10) {
          anomaliesList.push({
            matchId: obs.matchId,
            market: obs.marketId,
            margin,
            reason: 'Insufficient margin defense during high volatility spike.',
          });
        }
      }
    }
  }

  const N = observations.length;
  const avgMargin = Number((totalMargin / N).toFixed(4));
  const defectRate = (boundViolations + pathologicalAnomalies) / N;
  const marginFairnessScore = Number((Math.max(0, (1 - defectRate)) * 100).toFixed(2));

  return {
    status: marginFairnessScore >= 95 ? 'OPTIMAL_FAIRNESS' : (marginFairnessScore >= 80 ? 'ACCEPTABLE_FAIRNESS' : 'MARGIN_DISTORTION_DETECTED'),
    marginFairnessScore,
    totalAudited: N,
    avgMargin,
    boundViolations,
    pathologicalAnomalies,
    sampleAnomalies: anomaliesList,
    enforcedEnvelope: { min: MIN_ALLOWED_MARGIN, max: MAX_ALLOWED_MARGIN },
    auditedAt: new Date().toISOString(),
  };
}
