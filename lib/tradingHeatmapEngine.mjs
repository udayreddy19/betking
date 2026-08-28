/**
 * Visual Cricket Trading Desk Liability Heatmap Engine
 * 
 * Generates an interactive run-by-run and wicket ladder showing:
 *  - Projected house P&L across a range of final scores (e.g. 140 to 220 runs)
 *  - High-risk liability zones (Red) vs Profitable zones (Green)
 *  - Real-time delta shifts per ball bowled
 */

export function generateCricketLiabilityHeatmap(bets = [], currentScore = 0, currentOvers = 0) {
  const minRuns = Math.max(currentScore, Math.floor(currentScore / 10) * 10 - 20);
  const maxRuns = minRuns + 80;
  const runBuckets = [];

  // Filter relevant active totals and match bets
  const totalStakesCollected = bets.reduce((sum, b) => sum + (Number(b.stake) || 0), 0);

  for (let runs = minRuns; runs <= maxRuns; runs += 5) {
    let projectedPayout = 0;

    for (const bet of bets) {
      const stake = Number(bet.stake) || 0;
      const odds = Number(bet.odds) || 1.0;
      const line = Number(bet.line || bet.targetValue || 0);

      if (bet.selectionId === 'OVER' || String(bet.selectionName).includes('Over')) {
        if (runs > line) {
          projectedPayout += stake * odds;
        }
      } else if (bet.selectionId === 'UNDER' || String(bet.selectionName).includes('Under')) {
        if (runs < line) {
          projectedPayout += stake * odds;
        }
      }
    }

    const netHousePnL = Number((totalStakesCollected - projectedPayout).toFixed(2));
    let colorZone = 'NEUTRAL';
    if (netHousePnL > 1000) colorZone = 'GREEN_PROFIT';
    else if (netHousePnL < -2000) colorZone = 'RED_HIGH_LIABILITY';
    else if (netHousePnL < 0) colorZone = 'ORANGE_EXPOSURE';

    runBuckets.push({
      projectedRuns: runs,
      totalStakesCollected,
      projectedPayout: Number(projectedPayout.toFixed(2)),
      netHousePnL,
      colorZone,
      isCurrentTrajectory: runs >= (currentScore + 40) && runs <= (currentScore + 60),
    });
  }

  return {
    currentScore,
    currentOvers,
    totalStakesCollected: Number(totalStakesCollected.toFixed(2)),
    runBuckets,
    generatedAt: new Date().toISOString(),
  };
}
