/**
 * Settlement Reconciliation Dry-Run Engine
 * 
 * Simulates the financial outcome of settling a market or match without committing
 * any irreversible database or wallet transactions.
 * Returns:
 *  - Eligible bets count (Won, Lost, Void/Push)
 *  - Projected total payout liability
 *  - House gross gaming revenue (GGR)
 *  - Wallet impacts summary
 */

import { query } from '../db/pg.js';

export async function simulateMarketSettlement(matchId, marketId, winningSelectionId, outcome = 'WON') {
  if (!matchId || !marketId) {
    throw new Error('matchId and marketId are required for settlement dry-run');
  }

  // Query all pending/accepted bets for this market
  const betsRes = await query(
    `SELECT b.bet_id, b.user_id, b.stake, b.odds, b.potential_payout, b.selection_id, b.status,
            w.balance AS current_user_balance
     FROM bets b
     LEFT JOIN wallets w ON b.user_id = w.user_id
     WHERE b.match_id = $1 AND (b.market_id = $2 OR $2 = 'all')
       AND b.status IN ('ACCEPTED', 'PENDING', 'PLACED')`,
    [matchId, marketId],
  );

  const bets = betsRes.rows;
  let totalStakes = 0;
  let projectedPayouts = 0;
  let winningBetsCount = 0;
  let losingBetsCount = 0;
  let voidBetsCount = 0;

  const simulatedBetOutcomes = [];

  for (const bet of bets) {
    const stake = Number(bet.stake) || 0;
    const odds = Number(bet.odds) || 1.0;
    totalStakes += stake;

    let betOutcome = 'LOST';
    let payout = 0.0;

    if (outcome === 'VOID' || outcome === 'CANCELLED') {
      betOutcome = 'VOID';
      payout = stake; // Refund stake
      voidBetsCount += 1;
    } else if (bet.selection_id === winningSelectionId) {
      betOutcome = 'WON';
      payout = Number((stake * odds).toFixed(2));
      winningBetsCount += 1;
    } else {
      betOutcome = 'LOST';
      payout = 0.0;
      losingBetsCount += 1;
    }

    projectedPayouts += payout;

    simulatedBetOutcomes.push({
      betId: bet.bet_id,
      userId: bet.user_id,
      stake,
      odds,
      selectionId: bet.selection_id,
      simulatedOutcome: betOutcome,
      projectedPayout: payout,
      currentUserBalance: Number(bet.current_user_balance || 0),
      projectedNewBalance: Number((Number(bet.current_user_balance || 0) + payout).toFixed(2)),
    });
  }

  const projectedGgr = totalStakes - projectedPayouts;
  const marginPct = totalStakes > 0 ? (projectedGgr / totalStakes) * 100 : 0;

  return {
    dryRun: true,
    matchId,
    marketId,
    winningSelectionId,
    totalBetsEvaluated: bets.length,
    winningBetsCount,
    losingBetsCount,
    voidBetsCount,
    totalStakes: Number(totalStakes.toFixed(2)),
    projectedTotalPayout: Number(projectedPayouts.toFixed(2)),
    projectedHouseGgr: Number(projectedGgr.toFixed(2)),
    projectedHoldMarginPct: Number(marginPct.toFixed(2)),
    isProfitable: projectedGgr >= 0,
    betsPreview: simulatedBetOutcomes.slice(0, 50),
    evaluatedAt: new Date().toISOString(),
  };
}
