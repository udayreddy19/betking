import { describe, it, expect } from 'vitest';
import { getWalletBreakdown, getWalletBreakdownLines, getWalletBucketRows } from '../../src/utils/walletBalance.js';

describe('wallet breakdown labels', () => {
  const user = {
    balance: 1000,
    reservedBalance: 100,
    bonusBalance: 50,
    freebetBalance: 500,
    lockedDepositBalance: 200,
    winningsBalance: 300,
  };

  it('exposes all required buckets from backend-aligned breakdown', () => {
    const w = getWalletBreakdown(user);
    expect(w).toMatchObject({
      availableBalance: expect.any(Number),
      winnings: expect.any(Number),
      lockedDeposit: expect.any(Number),
      pendingWithdrawal: 100,
      withdrawable: expect.any(Number),
      bonus: 50,
      freebets: 500,
    });
  });

  it('lists Available / Winnings / Withdrawable / Bonus / Free bet labels', () => {
    const rows = getWalletBucketRows(getWalletBreakdown(user));
    const labels = rows.map((r) => r.label);
    expect(labels).toEqual(expect.arrayContaining([
      'Available',
      'Winnings',
      'Withdrawable',
      'Locked deposit',
      'Reserved withdrawal',
      'Bonus',
      'Free bet',
    ]));
  });

  it('compact lines hide zero reserved/bonus when compact', () => {
    const empty = getWalletBreakdown({
      balance: 100,
      reservedBalance: 0,
      bonusBalance: 0,
      freebetBalance: 0,
      lockedDepositAmount: 0,
    });
    const lines = getWalletBreakdownLines(empty, { compact: true });
    expect(lines.some((l) => l.key === 'bonus')).toBe(false);
    expect(lines.some((l) => l.key === 'available')).toBe(true);
  });

  it('hides winnings in compact mode when net P/L is not positive', () => {
    const negative = getWalletBreakdown({
      ...user,
      winningsBalance: -110,
      bonusBalance: 0,
      freebetBalance: 0,
      reservedBalance: 0,
      lockedDepositBalance: 0,
    });
    const compact = getWalletBreakdownLines(negative, { compact: true });
    expect(compact.some((l) => l.key === 'winnings')).toBe(false);

    const full = getWalletBreakdownLines(negative, { compact: false });
    const winnings = full.find((l) => l.key === 'winnings');
    expect(winnings.label).toBe('Net P/L');
    expect(winnings.value).toBe(-110);
  });

  it('does not paint ₹0 when wallet is not ready', async () => {
    const { formatHeaderWalletAmount } = await import('../../src/utils/walletBalance.js');
    expect(formatHeaderWalletAmount({ walletReady: false }, 0)).toBe('…');
    expect(formatHeaderWalletAmount({ walletReady: true }, 191)).toBe('₹191');
  });
});
