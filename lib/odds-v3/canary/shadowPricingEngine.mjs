/**
 * OddsEngineV3 — Shadow Pricing & Canary Evaluation Engine
 * 
 * Compares candidate model pricing against authoritative baseline control:
 * - Deterministic canary assignment (e.g. 5% traffic in shadow mode)
 * - Zero risk: candidate odds are NEVER exposed to bettors or financial transactions
 * - Evaluates probability delta, margin divergence, and line stability
 */

import { generate } from '../OddsEngineV3.mjs';
import { generateOtherSportsSnapshot, isCricketSport } from '../otherSportsOdds.mjs';
import { recordPricingObservation } from '../telemetry/oddsObservationStore.mjs';

export const CANARY_CONFIG = Object.freeze({
  enabled: process.env.ODDS_ENGINE_CANARY_ENABLED === 'true',
  canaryPercent: Number(process.env.ODDS_ENGINE_CANARY_PERCENT) || 5,
  candidateVersion: 'ODDS_V3_CANDIDATE_1',
  baselineVersion: 'ODDS_V3_BASELINE_PROD',
});

/**
 * Deterministically checks if a match/market qualifies for Canary Shadow evaluation.
 */
export function isCanaryCandidate(matchId, canaryPercent = CANARY_CONFIG.canaryPercent) {
  if (!matchId) return false;
  let hash = 0;
  const str = String(matchId);
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 100) < canaryPercent;
}

/**
 * Executes shadow pricing comparison:
 * Generates both baseline and candidate snapshot, compares delta, and records telemetry.
 */
export function evaluateShadowPricing(matchState, config = {}) {
  const matchId = matchState?.matchId || matchState?.id || 'unknown';
  const isCricket = isCricketSport(matchState?.sport);

  // 1. Authoritative Baseline Pricing
  const baselineSnap = isCricket
    ? generate(matchState, config)
    : generateOtherSportsSnapshot(matchState, config);

  // 2. Candidate / Experimental Pricing (e.g. Dynamic Margin enabled)
  const candidateConfig = { ...config, candidateMode: true, margins: { liveMatchWinnerOverround: 0.06 } };
  const candidateSnap = isCricket
    ? generate(matchState, candidateConfig)
    : generateOtherSportsSnapshot(matchState, candidateConfig);

  const baselineWinner = baselineSnap.markets?.find(m => m.marketId === 'match_winner');
  const candidateWinner = candidateSnap.markets?.find(m => m.marketId === 'match_winner');

  const comparisons = [];
  if (baselineWinner && candidateWinner) {
    const baseSel1 = baselineWinner.selections?.[0];
    const candSel1 = candidateWinner.selections?.[0];

    if (baseSel1 && candSel1) {
      const pDiff = Math.abs((baseSel1.probability || 0) - (candSel1.probability || 0));
      const oddsDiff = Math.abs((baseSel1.odds || 0) - (candSel1.odds || 0));

      comparisons.push({
        marketId: 'match_winner',
        selectionId: baseSel1.selectionId,
        baselineProb: baseSel1.probability,
        candidateProb: candSel1.probability,
        baselineOdds: baseSel1.odds,
        candidateOdds: candSel1.odds,
        pDiff: Number(pDiff.toFixed(4)),
        oddsDiff: Number(oddsDiff.toFixed(4)),
      });

      // Record to telemetry as canary observation
      recordPricingObservation({
        matchId,
        sport: matchState?.sport,
        marketId: 'match_winner',
        selectionId: baseSel1.selectionId,
        probability: candSel1.probability,
        odds: candSel1.odds,
        margin: candSel1.margin || 0.06,
        modelVersion: CANARY_CONFIG.candidateVersion,
        isCanary: true,
      });
    }
  }

  return {
    matchId,
    baselineStatus: baselineSnap.status,
    candidateStatus: candidateSnap.status,
    comparisons,
    isCanaryEligible: isCanaryCandidate(matchId),
    authoritativeSnapshot: baselineSnap, // Strictly return authoritative baseline to callers
  };
}
