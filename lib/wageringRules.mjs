/**
 * Server-side wagering / wallet rules.
 * Keep in sync with src/utils/wageringRules.js
 *
 * Financial model:
 * - wallet.balance = authoritative total playable cash (includes settled winnings)
 * - wallet.winnings_balance = cumulative lifetime NET profit/loss from settled bets (reporting only)
 * - wallet.reserved_balance = audit trail for pending withdrawals (balance already debited on request)
 * - wallet.locked_deposit_balance = deposit portion not yet withdrawable until wagered
 *
 * Do NOT treat cash balance + cumulative winnings as additive totals.
 */

export function getWinningsAmount(user) {
  return Number(user?.winningsBalance ?? 0);
}

export function getLockedDepositAmount(user) {
  return Math.max(0, Number(user?.lockedDepositBalance ?? 0));
}

/** Playable cash — balance is authoritative (pending withdrawals already debited on request). */
export function getAvailableBalance(user) {
  const balance = Number(user?.balance ?? 0);
  return Math.max(0, parseFloat(balance.toFixed(2)));
}

/** Cash available for withdrawal (excludes locked deposit wagering requirement). */
export function getWithdrawableAmount(user) {
  const balance = Number(user?.balance ?? 0);
  const locked = getLockedDepositAmount(user);
  return Math.max(0, parseFloat((balance - locked).toFixed(2)));
}

/**
 * Split a cash stake across locked deposits first, then remaining balance.
 * Winnings are part of balance — no separate spendable winnings bucket.
 */
export function allocateCashStake(user, cashAmount) {
  const cash = Math.max(0, Number(cashAmount) || 0);
  const locked = getLockedDepositAmount(user);
  const fromLocked = Math.min(cash, locked);
  const fromNonWinnings = cash - fromLocked;

  return {
    fromLocked,
    fromNonWinnings,
    fromWinnings: 0,
    total: fromLocked + fromNonWinnings,
  };
}

export function splitBetWinPayout(bet) {
  const payout = Number(bet.payout) || 0;
  const stake = Number(bet.stake) || 0;
  if (payout <= 0 || stake <= 0) {
    return { cashCredit: 0, bonusCredit: 0, freebetCredit: 0, winningsCredit: 0 };
  }

  const bonusStake = Number(bet.bonusStake) || 0;
  const freebetStake = Number(bet.freebetStake) || (bet.fundSource === 'freebet' ? stake : 0);
  const cashStake = Number(bet.cashStake) || (bet.fundSource === 'cash' ? stake : 0);

  let cashCredit = 0;
  let bonusCredit = 0;
  let freebetCredit = 0;
  let winningsCredit = 0;

  if (bonusStake > 0) {
    const bonusShare = (bonusStake / stake) * payout;
    const profit = Math.max(0, bonusShare - bonusStake);
    cashCredit += profit;
    winningsCredit += profit;
    bonusCredit += bonusStake;
  }

  if (freebetStake > 0) {
    const freeShare = (freebetStake / stake) * payout;
    const profit = Math.max(0, freeShare - freebetStake);
    cashCredit += profit;
    winningsCredit += profit;
  }

  if (cashStake > 0) {
    const cashPayout = (cashStake / stake) * payout;
    cashCredit += cashPayout;
    winningsCredit += computeBetProfit(cashPayout, cashStake);
  }

  return { cashCredit, bonusCredit, freebetCredit, winningsCredit };
}

/** Net profit from a settled bet (payout − stake). May be negative for losses. */
export function computeBetProfit(payout, stake) {
  return parseFloat(((Number(payout) || 0) - (Number(stake) || 0)).toFixed(2));
}

/** Cumulative net profit delta applied on settlement (WON/LOST). */
export function settlementNetProfitDelta(outcome, payout, stake) {
  const s = Number(stake) || 0;
  if (outcome === 'WON') {
    return computeBetProfit(payout, s);
  }
  if (outcome === 'LOST') {
    return parseFloat((-s).toFixed(2));
  }
  return 0;
}
