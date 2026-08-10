/**
 * What-If Risk Simulation Engine
 * Allows traders to project potential liability, payout exposure, and liquidity impact before changing odds or limits.
 */

class RiskSimulationEngine {
  /** Simulate market impact of odds change */
  simulateOddsChange({
    matchId,
    marketId,
    selectionId,
    currentOdds,
    proposedOdds,
    currentLiability = 10000,
    projectedVolume = 5000,
  }) {
    const delta = proposedOdds - currentOdds;
    const projectedAdditionalLiability = projectedVolume * (proposedOdds - 1);
    const totalProjectedLiability = currentLiability + projectedAdditionalLiability;
    const liabilityDeltaPercent = ((totalProjectedLiability - currentLiability) / currentLiability) * 100;

    let riskRating = 'LOW';
    if (liabilityDeltaPercent > 50) riskRating = 'HIGH';
    else if (liabilityDeltaPercent > 20) riskRating = 'MEDIUM';

    return {
      matchId,
      marketId,
      selectionId,
      currentOdds,
      proposedOdds,
      currentLiability,
      projectedAdditionalLiability,
      totalProjectedLiability,
      liabilityDeltaPercent: parseFloat(liabilityDeltaPercent.toFixed(2)),
      riskRating,
      recommendation: riskRating === 'HIGH' ? 'REQUIRE_SENIOR_TRADER_APPROVAL' : 'SAFE_TO_EXECUTE',
    };
  }
}

export const riskSimulationEngine = new RiskSimulationEngine();
