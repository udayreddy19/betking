/**
 * Server-side wagering / wallet bucket rules.
 * Keep in sync with src/utils/wageringRules.js (allocateCashStake, splitBetWinPayout).
 */

export function getWinningsAmount(user) {
  return Math.max(0, Number(user?.winningsBalance ?? 0));
}

export function getLockedDepositAmount(user) {
  return Math.max(0, user?.lockedDepositBalance ?? 0);
}

export function allocateCashStake(user, cashAmount) {
  const cash = Math.max(0, Number(cashAmount) || 0);
  const balance = user?.balance ?? 0;
  const locked = getLockedDepositAmount(user);
  const winnings = getWinningsAmount(user);
  const unlockedNonWinnings = Math.max(0, balance - locked - winnings);

  const fromLocked = Math.min(cash, locked);
  let remaining = cash - fromLocked;
  const fromNonWinnings = Math.min(remaining, unlockedNonWinnings);
  remaining -= fromNonWinnings;
  const fromWinnings = Math.min(remaining, winnings);

  return {
    fromLocked,
    fromNonWinnings,
    fromWinnings,
    total: fromLocked + fromNonWinnings + fromWinnings,
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
    const profit = Math.max(0, cashPayout - cashStake);
    cashCredit += cashPayout;
    winningsCredit += profit;
  }

  return { cashCredit, bonusCredit, freebetCredit, winningsCredit };
}
