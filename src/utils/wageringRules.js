import { cashoutAmountFromPotential } from './vipBenefits';

export const BONUS_MIN_BET_ODDS = 1.75;
export const BONUS_WAGERING_MULTIPLIER = 5;
export const MIN_STAKE_INR = 10;

export function getCashoutOffer(bet, tier = 'BRONZE') {
  const status = String(bet?.status || '').toLowerCase();
  if (!bet || (status !== 'pending' && status !== 'accepted' && status !== 'open')) return 0;
  if (bet.fundSource === 'bonus' || bet.fundSource === 'freebet') return 0;
  const stake = Number(bet.stake) || 0;
  if (stake <= 0) return 0;
  const potential = Number(bet.potentialPayout || bet.potentialReturn || bet.payout || 0)
    || Number((stake * (Number(bet.odds) || 1)).toFixed(2));
  return cashoutAmountFromPotential(potential, tier);
}

export function canBetWithBonusOnLegs(legs) {
  if (!legs?.length) return false;
  return legs.every((leg) => Number(leg.odds) >= BONUS_MIN_BET_ODDS);
}

export function canBetWithFreebetOnLegs(legs) {
  return Array.isArray(legs) && legs.length > 0;
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
