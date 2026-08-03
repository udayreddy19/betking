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

export function getWithdrawableAmount(user) {
  const balance = user?.balance ?? 0;
  const locked = user?.lockedDepositBalance ?? 0;
  return Math.max(0, balance - locked);
}

export function getLockedDepositAmount(user) {
  return user?.lockedDepositBalance ?? 0;
}

/** Split bet win payout between withdrawable cash and recycled bonus */
export function splitBetWinPayout(bet) {
  const payout = Number(bet.payout) || 0;
  const stake = Number(bet.stake) || 0;
  if (payout <= 0 || stake <= 0) return { cashCredit: 0, bonusCredit: 0 };

  const bonusStake = Number(bet.bonusStake) || 0;
  const cashStake = Number(bet.cashStake) || (bet.fundSource === 'cash' ? stake : 0);

  let cashCredit = 0;
  let bonusCredit = 0;

  if (bonusStake > 0) {
    const bonusShare = (bonusStake / stake) * payout;
    if (qualifiesForBonusWithdrawal(bet)) {
      cashCredit += bonusShare - bonusStake;
    } else {
      bonusCredit += bonusShare;
    }
  }

  if (cashStake > 0) {
    cashCredit += (cashStake / stake) * payout;
  }

  return { cashCredit, bonusCredit };
}
