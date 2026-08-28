/**
 * OddsEngineV3 — Provider Regime & Multi-Segment Accuracy Analyzer
 * 
 * Analyzes provider accuracy regimes across:
 * - Sport (Cricket, Soccer, Tennis, Basketball)
 * - Match phase / status (Live vs Pre-match)
 * - Feed latency and staleness profiles
 * 
 * POLICY INVARIANT:
 * Candidate weights derived from regime analysis remain strictly in SHADOW mode.
 */

import { calculateBrierScore } from '../validation/modelScorecard.mjs';

export function analyzeProviderRegimes(dataset = []) {
  const bySportProvider = new Map();

  for (const row of dataset) {
    const sport = String(row.sport || 'cricket').toLowerCase();
    const provider = String(row.providerUsed || 'consensus');
    const key = `${sport}::${provider}`;

    if (!bySportProvider.has(key)) {
      bySportProvider.set(key, []);
    }
    bySportProvider.get(key).push(row);
  }

  const regimes = {};

  for (const [key, rows] of bySportProvider.entries()) {
    const [sport, provider] = key.split('::');
    if (!regimes[sport]) regimes[sport] = {};

    const settled = rows.filter((r) => r.settledOutcome === 'WIN' || r.settledOutcome === 'LOSE' || r.actualOutcome !== undefined);
    const brier = settled.length > 0 ? calculateBrierScore(settled) : null;
    const avgLatency = rows.length > 0 ? Number((rows.reduce((s, r) => s + (Number(r.providerLatency) || 0), 0) / rows.length).toFixed(1)) : 0;

    regimes[sport][provider] = {
      sampleCount: rows.length,
      settledCount: settled.length,
      brierScore: brier,
      avgLatencyMs: avgLatency,
      reliabilityRank: brier !== null ? (brier < 0.20 ? 'HIGH' : (brier < 0.25 ? 'MODERATE' : 'LOW')) : 'UNRATED',
    };
  }

  // Calculate candidate regime weights
  const candidateWeights = {};
  for (const [sport, providers] of Object.entries(regimes)) {
    candidateWeights[sport] = {};
    const validProvs = Object.entries(providers).filter(([_, p]) => p.brierScore !== null && p.settledCount >= 10);
    if (validProvs.length > 0) {
      const invBrierSum = validProvs.reduce((sum, [_, p]) => sum + (1 / (p.brierScore + 0.001)), 0);
      for (const [provName, p] of validProvs) {
        candidateWeights[sport][provName] = Number(((1 / (p.brierScore + 0.001)) / invBrierSum).toFixed(4));
      }
    }
  }

  return {
    status: Object.keys(regimes).length > 0 ? 'ANALYZED' : 'NO_DATA',
    regimes,
    shadowCandidateWeights: candidateWeights,
    weightStatus: 'SHADOW_ONLY',
    analyzedAt: new Date().toISOString(),
  };
}
