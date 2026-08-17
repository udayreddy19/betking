/**
 * Enterprise Smart Hedging Engine — OddsYra Enterprise Platform (lib/hedgingEngine.mjs)
 * Calculates automated liability reduction suggestions, risk mitigation opportunities,
 * portfolio risk hedging, and external exchange lay-hedge recommendations.
 */

import { calculateMatchExposureMetrics } from './exposureEngine.mjs';

export function calculateSmartHedgeOpportunity(matchId) {
  const exposure = calculateMatchExposureMetrics(matchId);
  if (exposure.worstCaseLoss < 10000) {
    return { shouldHedge: false, matchId, reason: 'Exposure within risk tolerance' };
  }

  const selectionToHedge = exposure.highestRiskSelection?.selectionId || 'home';
  const hedgeAmount = exposure.worstCaseLoss * 0.70;

  return {
    shouldHedge: true,
    matchId,
    targetSelection: selectionToHedge,
    suggestedHedgeStake: Number(hedgeAmount.toFixed(2)),
    recommendedAction: `Place lay/hedge bet of ₹${hedgeAmount.toFixed(2)} on selection ${selectionToHedge} to reduce worst-case loss by 70%.`,
    generatedAt: new Date().toISOString(),
  };
}
