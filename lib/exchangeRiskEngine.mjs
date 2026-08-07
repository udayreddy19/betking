/**
 * Enterprise Exchange Risk Engine — BetKing Enterprise Platform (lib/exchangeRiskEngine.mjs)
 * Manages open exchange positions, backer/layer liabilities, margin requirements,
 * exchange liquidity, and settlement calculations.
 */

export function calculateExchangeLiability(side, stake, odds) {
  const s = Number(stake) || 0;
  const o = Number(odds) || 1.0;

  if (side === 'BACK') {
    return { maxLoss: s, maxWin: s * (o - 1.0) };
  } else {
    // LAY order liability = stake * (odds - 1)
    return { maxLoss: s * (o - 1.0), maxWin: s };
  }
}
