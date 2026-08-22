import { describe, it, expect } from 'vitest';
import { splitSettlementWinCredits, voidRefundCredits } from '../../lib/walletSettlement.mjs';

describe('wallet settlement credits', () => {
  it('credits cash win profit to winnings bucket', () => {
    const split = splitSettlementWinCredits({ fund_source: 'cash', stake: 100 }, 250);
    expect(split.cashCredit).toBe(250);
    expect(split.winningsCredit).toBe(150);
  });

  it('keeps lost stake off wallet at settlement time', () => {
    const split = splitSettlementWinCredits({ fund_source: 'cash', stake: 100 }, 0);
    expect(split.cashCredit).toBe(0);
    expect(split.winningsCredit).toBe(0);
  });

  it('restores locked and winnings portions on void refund', () => {
    const refund = voidRefundCredits({
      fund_source: 'cash',
      stake: 100,
      stake_from_locked: 40,
      stake_from_winnings: 30,
      stake_from_cash: 30,
    });
    expect(refund.balanceCredit).toBe(30);
    expect(refund.lockedCredit).toBe(40);
    expect(refund.winningsCredit).toBe(30);
  });

  it('refunds legacy cash void to balance when no bucket split stored', () => {
    const refund = voidRefundCredits({ fund_source: 'cash', stake: 100 });
    expect(refund.balanceCredit).toBe(100);
    expect(refund.lockedCredit).toBe(0);
    expect(refund.winningsCredit).toBe(0);
  });

  it('returns bonus stake to bonus on void', () => {
    const refund = voidRefundCredits({ fund_source: 'bonus', stake: 50 });
    expect(refund.bonusCredit).toBe(50);
    expect(refund.balanceCredit).toBe(0);
  });
});
