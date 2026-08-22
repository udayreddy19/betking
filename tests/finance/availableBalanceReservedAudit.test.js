import { describe, it, expect } from 'vitest';
import { getAvailableBalance, getWithdrawableAmount } from '../../lib/wageringRules.mjs';

describe('Wallet available/withdrawable — reserved is audit-only', () => {
  it('does not subtract reserved_balance twice from available', () => {
    const view = {
      balance: 1000,
      reservedBalance: 200,
      lockedDepositBalance: 0,
      winningsBalance: 50,
    };
    // Balance already reflects withdrawal debit; reserved is audit trail only.
    expect(getAvailableBalance(view)).toBe(1000);
    expect(getWithdrawableAmount(view)).toBe(1000);
  });

  it('subtracts locked deposits from withdrawable only', () => {
    const view = {
      balance: 1000,
      reservedBalance: 0,
      lockedDepositBalance: 400,
      winningsBalance: 0,
    };
    expect(getAvailableBalance(view)).toBe(1000);
    expect(getWithdrawableAmount(view)).toBe(600);
  });
});
