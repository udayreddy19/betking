/** Bonus bets require min odds; only winnings from 1.85+ odds are withdrawable */
export const BONUS_MIN_BET_ODDS = 1.80;
export const BONUS_MIN_WITHDRAW_ODDS = 1.85;

export function canBetWithBonusOnLegs(legs) {
  if (!legs?.length) return false;
  return legs.every((leg) => Number(leg.odds) >= BONUS_MIN_BET_ODDS);
}

export function qualifiesForBonusWithdrawal(bet) {
  if (!bet?.legs?.length) return false;
  return bet.legs.every((leg) => Number(leg.odds) >= BONUS_MIN_WITHDRAW_ODDS);
}

export function getWinningsAmount(user) {
  return Math.max(0, user?.winningsBalance ?? 0);
}

/** Only bet winnings can be withdrawn — not locked deposits or bonus */
export function getWithdrawableAmount(user) {
  return getWinningsAmount(user);
}

export function getLockedDepositAmount(user) {
  return Math.max(0, user?.lockedDepositBalance ?? 0);
}

/**
 * Split a cash stake across locked deposits, playable cash, then winnings.
 * Locked deposits are wagered first to clear playthrough.
 */
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

/** Split bet win payout: balance (playable), bonus recycle, and withdrawable winnings */
export function splitBetWinPayout(bet) {
  const payout = Number(bet.payout) || 0;
  const stake = Number(bet.stake) || 0;
  if (payout <= 0 || stake <= 0) return { cashCredit: 0, bonusCredit: 0, winningsCredit: 0 };

  const bonusStake = Number(bet.bonusStake) || 0;
  const cashStake = Number(bet.cashStake) || (bet.fundSource === 'cash' ? stake : 0);

  let cashCredit = 0;
  let bonusCredit = 0;
  let winningsCredit = 0;

  if (bonusStake > 0) {
    const bonusShare = (bonusStake / stake) * payout;
    if (qualifiesForBonusWithdrawal(bet)) {
      const profit = Math.max(0, bonusShare - bonusStake);
      cashCredit += profit;
      winningsCredit += profit;
    } else {
      bonusCredit += bonusShare;
    }
  }

  if (cashStake > 0) {
    const cashPayout = (cashStake / stake) * payout;
    const profit = Math.max(0, cashPayout - cashStake);
    cashCredit += cashPayout;
    winningsCredit += profit;
  }

  return { cashCredit, bonusCredit, winningsCredit };
}
