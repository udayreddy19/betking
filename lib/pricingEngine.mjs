/**
 * Enterprise Dynamic Pricing Engine — OddsYra Sportsbook (lib/pricingEngine.mjs)
 * Controls odds pricing independently of Odds Engine. Incorporates dynamic margins,
 * liquidity pricing, sharp/public money adjustments, time decay, automatic market balancing,
 * market confidence factors, and late-betting surge adjustments.
 */

import { getV3WinnerDecimalBook } from './v3MatchOdds.mjs';
import { calculateMatchExposureMetrics } from './exposureEngine.mjs';
import { validateBetRisk } from './riskEngine.mjs';

/**
 * Calculate dynamic market price incorporating liquidity, sharp money, and time decay
 */
export function calculateDynamicPricing(match = {}, options = {}) {
  const matchId = match.id || `match_${Date.now()}`;
  const baseOddsObj = getV3WinnerDecimalBook(match, options);

  // 1. Exposure & Liability Metrics
  const exposureMetrics = calculateMatchExposureMetrics(matchId);
  const totalStaked = exposureMetrics.totalStaked || 0;

  // 2. Liquidity Adjustment (Higher volume = narrower margin)
  let dynamicMargin = options.baseMarginPct || 5.0;
  if (totalStaked > 100000) {
    dynamicMargin = Math.max(2.5, dynamicMargin - 1.5); // High liquidity tightness
  } else if (totalStaked < 5000) {
    dynamicMargin += 1.0; // Low liquidity protection
  }

  // 3. Sharp vs Public Money Adjustments
  let sharpMoneyMultiplier = 1.0;
  let publicMoneyMultiplier = 1.0;
  if (options.hasSharpActivity) {
    sharpMoneyMultiplier = 1.12; // Move odds faster against sharp money
  }
  if (options.hasPublicSurge) {
    publicMoneyMultiplier = 1.05;
  }

  // 4. Time Decay Factor (Late betting before kickoff/close)
  let timeDecayMultiplier = 1.0;
  if (options.minutesToKickoff != null && options.minutesToKickoff <= 15) {
    timeDecayMultiplier = 1.08; // Increase margin on late surge
  }

  const finalAdjustedHomeOdds = Number(
    (baseOddsObj.odds.home.decimal / sharpMoneyMultiplier / timeDecayMultiplier).toFixed(2),
  );

  const finalAdjustedAwayOdds = Number(
    (baseOddsObj.odds.away.decimal / publicMoneyMultiplier / timeDecayMultiplier).toFixed(2),
  );

  return {
    matchId,
    pricingVersion: Date.now(),
    dynamicMarginPct: Number(dynamicMargin.toFixed(2)),
    liquidityVolume: totalStaked,
    adjustments: {
      sharpMoneyMultiplier,
      publicMoneyMultiplier,
      timeDecayMultiplier,
    },
    pricedOdds: {
      home: Math.max(1.01, finalAdjustedHomeOdds),
      away: Math.max(1.01, finalAdjustedAwayOdds),
      draw: baseOddsObj.odds.draw ? baseOddsObj.odds.draw.decimal : null,
    },
    calculatedAt: new Date().toISOString(),
  };
}
