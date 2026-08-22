import { describe, it, expect } from 'vitest';
import { splitSettlementWinCredits, voidRefundCredits } from '../../lib/walletSettlement.mjs';

describe('wallet settlement credits', () => {
  it('credits full cash payout to balance and net profit to cumulative winnings', () => {
    const split = splitSettlementWinCredits({ fund_source: 'cash', stake: 100 }, 250);
    expect(split.cashCredit).toBe(250);
    expect(split.winningsCredit).toBe(150);
  });

  it('keeps lost stake off wallet at settlement time', () => {
    const split = splitSettlementWinCredits({ fund_source: 'cash', stake: 100 }, 0);
    expect(split.cashCredit).toBe(0);
    expect(split.winningsCredit).toBe(0);
  });

  it('restores full stake to balance and locked portion on void refund', () => {
    const refund = voidRefundCredits({
      fund_source: 'cash',
      stake: 100,
      stake_from_locked: 40,
      stake_from_winnings: 0,
      stake_from_cash: 60,
    });
    expect(refund.balanceCredit).toBe(100);
    expect(refund.lockedCredit).toBe(40);
    expect(refund.winningsCredit).toBe(0);
  });

  it('refunds full stake when bet was funded entirely from locked deposit', () => {
    const refund = voidRefundCredits({
      fund_source: 'cash',
      stake: 500,
      stake_from_locked: 500,
      stake_from_cash: 0,
    });
    expect(refund.balanceCredit).toBe(500);
    expect(refund.lockedCredit).toBe(500);
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
