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
  const playableCash = Math.max(0, cashBalance - lockedDeposit - winnings);
  const total = cashBalance + bonusAndFreebets;

  return {
    total,
    withdrawable,
    winnings,
    lockedDeposit,
    cashBalance,
    playableCash,
    bonus,
    freebets,
    bonusAndFreebets,
  };
}

export function formatInr(amount) {
  const num = Number(amount || 0);
  const formatted = num.toLocaleString('en-IN', {
    minimumFractionDigits: num % 1 !== 0 ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `₹${formatted}`;
}
