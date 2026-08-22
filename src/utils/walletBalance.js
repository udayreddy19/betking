import {
  getWithdrawableAmount,
  getAvailableBalance,
  getLockedDepositAmount,
  getWinningsAmount,
} from './wageringRules';

/**
 * Wallet breakdown for header / profile display.
 * Total balance = cash + bonus + freebets. Net profit is already in cash balance.
 */
export function getWalletBreakdown(user) {
  const cashBalance = Number(user?.balance ?? 0);
  const reserved = Number(user?.reservedBalance ?? 0);
  const netProfit = getWinningsAmount(user);
  const withdrawable = getWithdrawableAmount(user);
  const available = getAvailableBalance(user);
  const lockedDeposit = getLockedDepositAmount(user);
  const bonus = Number(user?.bonusBalance ?? 0);
  const freebets = Number(user?.freebetBalance ?? 0);
  const bonusAndFreebets = bonus + freebets;
  const pendingWithdrawal = reserved;
  const total = parseFloat((cashBalance + bonusAndFreebets).toFixed(2));

  return {
    total,
    cashBalance,
    netProfit,
    winnings: netProfit,
    availableBalance: available,
    withdrawable,
    lockedDeposit,
    pendingWithdrawal,
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

/** Compact balance lines for wallet dropdown (hides zero buckets). */
export function getWalletBreakdownLines(wallet) {
  const lines = [
    { key: 'cash', label: 'Cash', value: wallet.cashBalance, tone: 'cash' },
  ];
  if (wallet.bonus > 0) {
    lines.push({ key: 'bonus', label: 'Bonus', value: wallet.bonus, tone: 'bonus' });
  }
  if (wallet.freebets > 0) {
    lines.push({ key: 'freebet', label: 'Freebet', value: wallet.freebets, tone: 'freebet' });
  }
  if (wallet.lockedDeposit > 0) {
    lines.push({ key: 'locked', label: 'Must wager', value: wallet.lockedDeposit, tone: 'locked' });
  }
  return lines;
}

/** Short withdrawable helper copy for wallet UI. */
export function getWithdrawableHint(wallet) {
  if (wallet.lockedDeposit > 0) {
    return `Wager ${formatInr(wallet.lockedDeposit)} of your deposit before withdrawing it.`;
  }
  if (wallet.withdrawable < wallet.cashBalance) {
    return 'Some cash is held until wagering requirements are met.';
  }
  return 'Winnings are withdrawable. New deposits need one bet first.';
}
