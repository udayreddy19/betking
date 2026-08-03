import {
  getWithdrawableAmount,
  getLockedDepositAmount,
  getWinningsAmount,
} from './wageringRules';

/** Wallet breakdown for header / profile display */
export function getWalletBreakdown(user) {
  const winnings = getWinningsAmount(user);
  const withdrawable = getWithdrawableAmount(user);
  const lockedDeposit = getLockedDepositAmount(user);
  const bonus = user?.bonusBalance ?? 0;
  const freebets = user?.freebetBalance ?? 0;
  const bonusAndFreebets = bonus + freebets;
  const cashBalance = user?.balance ?? 0;
  const total = cashBalance + bonusAndFreebets;

  return {
    total,
    withdrawable,
    winnings,
    lockedDeposit,
    cashBalance,
    bonus,
    freebets,
    bonusAndFreebets,
  };
}

export function formatInr(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN')}`;
}
