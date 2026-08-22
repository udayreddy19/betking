import { cashoutAmountFromPotential } from './vipBenefits.js';

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

/** Cumulative lifetime net profit/loss — reporting only, not a separate spendable wallet */
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

/** Split bet win payout: full payout → balance; net profit → cumulative winnings */
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
    winningsCredit += parseFloat((cashPayout - cashStake).toFixed(2));
  }

  return { cashCredit, bonusCredit, freebetCredit, winningsCredit };
}

export function computeBetProfit(payout, stake) {
  return parseFloat(((Number(payout) || 0) - (Number(stake) || 0)).toFixed(2));
}
