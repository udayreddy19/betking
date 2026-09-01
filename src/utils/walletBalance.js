import {
  getWithdrawableAmount,
  getAvailableBalance,
  getLockedDepositAmount,
  getWinningsAmount,
} from './wageringRules.js';

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

/** Header amount: never paint ₹0 just because /me has not returned yet. */
export function formatHeaderWalletAmount(user, amount, { visible = true } = {}) {
  if (!visible) return '₹ ✦✦✦';
  if (user?.walletReady === false) return '…';
  return formatInr(amount);
}

/**
 * Balance lines for wallet UI — labels match backend bucket semantics.
 * Always show core buckets; hide promotional/reserved when zero.
 */
export function getWalletBreakdownLines(wallet, { compact = true } = {}) {
  const lines = [
    { key: 'available', label: 'Available', value: wallet.availableBalance, tone: 'cash' },
  ];
  const winningsValue = Number(wallet.winnings ?? wallet.netProfit ?? 0);
  if (!compact || winningsValue > 0) {
    lines.push({
      key: 'winnings',
      label: winningsValue < 0 ? 'Net P/L' : 'Winnings',
      value: winningsValue,
      tone: 'cash',
    });
  }
  lines.push(
    { key: 'withdrawable', label: 'Withdrawable', value: wallet.withdrawable, tone: 'cash' },
  );
  if (!compact || wallet.lockedDeposit > 0) {
    lines.push({ key: 'locked', label: 'Locked deposit', value: wallet.lockedDeposit, tone: 'locked' });
  }
  if (!compact || wallet.pendingWithdrawal > 0) {
    lines.push({
      key: 'reserved',
      label: 'Reserved withdrawal',
      value: wallet.pendingWithdrawal,
      tone: 'locked',
    });
  }
  if (!compact || wallet.bonus > 0) {
    lines.push({ key: 'bonus', label: 'Bonus', value: wallet.bonus, tone: 'bonus' });
  }
  if (!compact || wallet.freebets > 0) {
    lines.push({ key: 'freebet', label: 'Free bet', value: wallet.freebets, tone: 'freebet' });
  }
  return lines;
}

/** Full labeled bucket list for Profile (never merges bonus + freebet). */
export function getWalletBucketRows(wallet) {
  return getWalletBreakdownLines(wallet, { compact: false });
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
