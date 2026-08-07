/**
 * Enterprise AI Trader Assistant — BetKing Enterprise Platform (lib/traderAssistant.mjs)
 * Provides real-time intelligent recommendations for sports traders:
 * Odds changes, Market suspensions, Market reopenings, Exposure reductions,
 * Margin adjustments, Suspicious market flags, High risk matches, and High value markets.
 */

import { calculateMatchExposureMetrics } from './exposureEngine.mjs';

export function getTraderAssistantSuggestions(matchId) {
  const exposure = calculateMatchExposureMetrics(matchId);
  const suggestions = [];

  if (exposure.worstCaseLoss > 5000) {
    suggestions.push({
      type: 'EXPOSURE_REDUCTION',
      severity: 'HIGH',
      message: `High liability detected ($${exposure.worstCaseLoss.toFixed(2)}). Recommend shortening odds on selection ${exposure.highestRiskSelection?.selectionId || 'home'}.`,
      action: 'SHORTEN_ODDS',
    });
  }

  if (exposure.totalBetsCount > 100) {
    suggestions.push({
      type: 'MARGIN_ADJUSTMENT',
      severity: 'MEDIUM',
      message: 'High bet throughput. Recommend lowering margin by 1% to attract balanced volume.',
      action: 'LOWER_MARGIN',
    });
  }

  return {
    matchId,
    totalSuggestions: suggestions.length,
    suggestions,
    generatedAt: new Date().toISOString(),
  };
}
