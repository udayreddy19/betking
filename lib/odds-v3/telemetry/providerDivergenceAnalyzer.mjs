/**
 * OddsEngineV3 — Provider Divergence & Consensus Analyzer
 * 
 * Computes disagreement metrics between external providers and internal models:
 * - Mean Absolute Difference (MAD)
 * - Maximum Divergence
 * - Disagreement Frequency (> 10% discrepancy)
 */

export function analyzeProviderDivergence(comparisonPairs = []) {
  if (!Array.isArray(comparisonPairs) || !comparisonPairs.length) {
    return {
      sampleSize: 0,
      meanAbsoluteDiff: 0,
      maxDiff: 0,
      disagreementCount: 0,
      disagreementRatePct: 0,
      consensusHealth: 'INSUFFICIENT_DATA',
    };
  }

  let totalDiff = 0;
  let maxDiff = 0;
  let disagreements = 0;

  for (const pair of comparisonPairs) {
    const pModel = pair.modelProb || pair.modelProbability || 0;
    const pProv = pair.providerProb || pair.providerProbability || 0;

    const diff = Math.abs(pModel - pProv);
    totalDiff += diff;
    if (diff > maxDiff) maxDiff = diff;
    if (diff > 0.10) disagreements++;
  }

  const sampleSize = comparisonPairs.length;
  const meanDiff = totalDiff / sampleSize;
  const disagreementRate = (disagreements / sampleSize) * 100;

  let consensusHealth = 'GREEN';
  if (disagreementRate > 25 || maxDiff > 0.35) {
    consensusHealth = 'RED';
  } else if (disagreementRate > 10 || maxDiff > 0.20) {
    consensusHealth = 'YELLOW';
  }

  return {
    sampleSize,
    meanAbsoluteDiff: Number(meanDiff.toFixed(4)),
    maxDiff: Number(maxDiff.toFixed(4)),
    disagreementCount: disagreements,
    disagreementRatePct: Number(disagreementRate.toFixed(2)),
    consensusHealth,
  };
}
