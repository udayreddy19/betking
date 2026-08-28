/**
 * Multi-Bet Accumulator (Acca) Booster Engine
 * 
 * Computes progressive bonus multipliers based on the number of qualifying legs
 * in a parlay / multi-bet slip.
 * 
 * Default Tier Ladder:
 *  - 3 legs:  +5%
 *  - 4 legs:  +7.5%
 *  - 5 legs:  +10%
 *  - 6 legs:  +15%
 *  - 7 legs:  +20%
 *  - 8 legs:  +25%
 *  - 9 legs:  +30%
 *  - 10 legs: +40%
 *  - 11+ legs: +50%
 */

export const DEFAULT_ACCA_BOOST_TIERS = [
  { minLegs: 11, boostPct: 50.0 },
  { minLegs: 10, boostPct: 40.0 },
  { minLegs: 9,  boostPct: 30.0 },
  { minLegs: 8,  boostPct: 25.0 },
  { minLegs: 7,  boostPct: 20.0 },
  { minLegs: 6,  boostPct: 15.0 },
  { minLegs: 5,  boostPct: 10.0 },
  { minLegs: 4,  boostPct: 7.5 },
  { minLegs: 3,  boostPct: 5.0 },
];

export const MIN_LEG_ODDS = 1.20; // Each leg must have minimum odds of 1.20 to qualify for booster

/**
 * Calculate the Acca boost for a multi-bet slip
 * @param {Array<{ odds: number }>} legs Array of selection legs
 * @param {number} baseStake Bet stake
 * @param {object} customConfig
 * @returns {object} { eligible: boolean, qualifyingLegs: number, boostPct: number, basePayout: number, boostedPayout: number, bonusAmount: number }
 */
export function calculateAccaBoost(legs = [], baseStake = 0, customConfig = {}) {
  const tiers = customConfig.tiers || DEFAULT_ACCA_BOOST_TIERS;
  const minOdds = customConfig.minOdds || MIN_LEG_ODDS;
  const stake = Number(baseStake) || 0;

  if (!Array.isArray(legs) || legs.length < 3 || stake <= 0) {
    return {
      eligible: false,
      qualifyingLegs: 0,
      boostPct: 0,
      basePayout: 0,
      boostedPayout: 0,
      bonusAmount: 0,
      reason: 'INSUFFICIENT_LEGS_OR_STAKE',
    };
  }

  // Count qualifying legs with minimum odds
  let combinedOdds = 1.0;
  let qualifyingCount = 0;

  for (const leg of legs) {
    const odds = Number(leg.odds) || 1.0;
    combinedOdds *= odds;
    if (odds >= minOdds) {
      qualifyingCount += 1;
    }
  }

  const basePayout = Number((stake * combinedOdds).toFixed(2));

  // Find matching tier
  const matchedTier = tiers.find((t) => qualifyingCount >= t.minLegs);
  if (!matchedTier) {
    return {
      eligible: false,
      qualifyingLegs: qualifyingCount,
      boostPct: 0,
      basePayout,
      boostedPayout: basePayout,
      bonusAmount: 0,
      reason: 'QUALIFYING_LEGS_BELOW_MINIMUM',
    };
  }

  const boostPct = matchedTier.boostPct;
  const netWinnings = basePayout - stake;
  const bonusAmount = Number((netWinnings * (boostPct / 100)).toFixed(2));
  const boostedPayout = Number((basePayout + bonusAmount).toFixed(2));

  return {
    eligible: true,
    totalLegs: legs.length,
    qualifyingLegs: qualifyingCount,
    combinedOdds: Number(combinedOdds.toFixed(3)),
    boostPct,
    baseStake: stake,
    basePayout,
    bonusAmount,
    boostedPayout,
    minQualifyingOdds: minOdds,
  };
}
