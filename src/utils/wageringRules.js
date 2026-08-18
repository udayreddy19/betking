/** Bonus / freebet odds gates; only winnings are withdrawable */
export const BONUS_MIN_BET_ODDS = 1.80;
export const BONUS_MIN_WITHDRAW_ODDS = 1.85;
export const MIN_STAKE_INR = 10;
/** Early cashout pays this fraction of stake */
export const CASHOUT_OFFER_RATIO = 0.72;

export function canBetWithBonusOnLegs(legs) {
  if (!legs?.length) return false;
  return legs.every((leg) => Number(leg.odds) >= BONUS_MIN_BET_ODDS);
}

export function qualifiesForBonusWithdrawal(bet) {
  if (!bet?.legs?.length) return false;
  return bet.legs.every((leg) => Number(leg.odds) >= BONUS_MIN_WITHDRAW_ODDS);
}

export function getWinningsAmount(user) {
  return getWithdrawableAmount(user);
}

/** Cash available after withdrawal holds */
export function getWithdrawableAmount(user) {
  const balance = Number(user?.balance ?? 0);
  const reserved = Number(user?.reservedBalance ?? 0);
  return Math.max(0, balance - reserved);
}

export function getLockedDepositAmount(user) {
  return Math.max(0, user?.lockedDepositBalance ?? 0);
}

export function getCashoutOffer(bet) {
  const status = String(bet?.status || '').toLowerCase();
  if (!bet || (status !== 'pending' && status !== 'accepted' && status !== 'open')) return 0;
  if (bet.fundSource === 'bonus' || bet.fundSource === 'freebet') return 0;
  const stake = Number(bet.stake) || 0;
  if (stake <= 0) return 0;
  return Math.round(stake * CASHOUT_OFFER_RATIO * 100) / 100;
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

/** Split bet win payout: balance (playable), bonus recycle, freebet profit, winnings */
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
    if (qualifiesForBonusWithdrawal(bet)) {
      const profit = Math.max(0, bonusShare - bonusStake);
      cashCredit += profit;
      winningsCredit += profit;
    } else {
      bonusCredit += bonusShare;
    }
  }

  if (freebetStake > 0) {
    const freeShare = (freebetStake / stake) * payout;
    const profit = Math.max(0, freeShare - freebetStake);
    if (qualifiesForBonusWithdrawal(bet)) {
      cashCredit += profit;
      winningsCredit += profit;
    } else {
      freebetCredit += freebetStake;
    }
  }

  if (cashStake > 0) {
    const cashPayout = (cashStake / stake) * payout;
    const profit = Math.max(0, cashPayout - cashStake);
    cashCredit += cashPayout;
    winningsCredit += profit;
  }

  return { cashCredit, bonusCredit, freebetCredit, winningsCredit };
}
