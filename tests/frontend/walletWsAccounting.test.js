import { describe, it, expect } from 'vitest';
import {
  financialEventId,
  financialEventTimestamp,
  isFinancialEventForUser,
  isFinancialWsEventType,
  shouldApplyFinancialWsEvent,
} from '../../src/utils/wsFinancialEvents.js';
import {
  getAvailableBalance,
  getWithdrawableAmount,
  getWinningsAmount,
  computeBetProfit,
  splitBetWinPayout,
} from '../../src/utils/wageringRules.js';

describe('wsFinancialEvents helpers', () => {
  it('identifies financial event types', () => {
    expect(isFinancialWsEventType('BET_SETTLED')).toBe(true);
    expect(isFinancialWsEventType('WALLET_BALANCE_UPDATED')).toBe(true);
    expect(isFinancialWsEventType('BET_CASHED_OUT')).toBe(true);
    expect(isFinancialWsEventType('odds.updated')).toBe(false);
  });

  it('enforces user isolation', () => {
    const msg = { payload: { userId: 'usr_a', eventId: 'e1' } };
    expect(isFinancialEventForUser(msg, 'usr_a')).toBe(true);
    expect(isFinancialEventForUser(msg, 'usr_b')).toBe(false);
  });

  it('dedupes duplicate eventIds', () => {
    const seen = new Set();
    const lastTs = { current: 0 };
    const msg = { eventId: 'evt_1', timestamp: 1000, payload: { eventId: 'evt_1' } };
    expect(shouldApplyFinancialWsEvent(msg, seen, lastTs).apply).toBe(true);
    expect(shouldApplyFinancialWsEvent(msg, seen, lastTs).reason).toBe('duplicate');
  });

  it('rejects out-of-order / stale timestamps', () => {
    const seen = new Set();
    const lastTs = { current: 0 };
    expect(shouldApplyFinancialWsEvent(
      { eventId: 'a', timestamp: 2000, payload: { eventId: 'a' } },
      seen,
      lastTs,
    ).apply).toBe(true);
    expect(shouldApplyFinancialWsEvent(
      { eventId: 'b', timestamp: 1500, payload: { eventId: 'b' } },
      seen,
      lastTs,
    )).toEqual({ apply: false, reason: 'stale' });
  });

  it('extracts event id and timestamp from nested payload', () => {
    expect(financialEventId({ payload: { eventId: 'x' } })).toBe('x');
    expect(financialEventTimestamp({ timestamp: 42 })).toBe(42);
    expect(financialEventTimestamp({ payload: { timestamp: 99 } })).toBe(99);
  });
});

describe('Frontend wallet accounting (canonical model)', () => {
  const base = {
    balance: 1000,
    reservedBalance: 200,
    lockedDepositBalance: 0,
    winningsBalance: 30,
  };

  it('available = balance; reserved is not double-subtracted', () => {
    expect(getAvailableBalance(base)).toBe(1000);
    expect(getWithdrawableAmount(base)).toBe(1000);
    expect(getWinningsAmount(base)).toBe(30);
  });

  it('₹500 LOSS — reporting profit −500; balance already reflects stake debit only', () => {
    const afterLoss = { balance: 500, reservedBalance: 0, lockedDepositBalance: 0, winningsBalance: -500 };
    expect(getAvailableBalance(afterLoss)).toBe(500);
    expect(computeBetProfit(0, 500)).toBe(-500);
  });

  it('₹500 WIN @ 1.06 — payout 530 usable; reporting profit +30', () => {
    expect(computeBetProfit(530, 500)).toBe(30);
    const split = splitBetWinPayout({ payout: 530, stake: 500, cashStake: 500, fundSource: 'cash' });
    expect(split.cashCredit).toBe(530);
    expect(split.winningsCredit).toBe(30);
    const afterWin = { balance: 1030, reservedBalance: 0, lockedDepositBalance: 0, winningsBalance: 30 };
    expect(getAvailableBalance(afterWin)).toBe(1030);
    expect(getWithdrawableAmount(afterWin)).toBe(1030);
  });

  it('₹500 WIN @ 2.00 — payout 1000 usable; reporting +500', () => {
    const split = splitBetWinPayout({ payout: 1000, stake: 500, cashStake: 500, fundSource: 'cash' });
    expect(split.cashCredit).toBe(1000);
    expect(split.winningsCredit).toBe(500);
    expect(getAvailableBalance({ balance: 1500, winningsBalance: 500 })).toBe(1500);
  });

  it('cashout / void reporting helpers', () => {
    expect(computeBetProfit(420, 500)).toBe(-80);
    expect(computeBetProfit(500, 500)).toBe(0);
  });

  it('multiple consecutive wins accumulate playable balance and reporting P&L', () => {
    // 1000 → bet 500 @1.06 win → 1030 (+30) → bet 500 @2 win → 1530 (+530 total P&L from second: +500)
    const afterTwo = { balance: 1530, winningsBalance: 530, reservedBalance: 0, lockedDepositBalance: 0 };
    expect(getAvailableBalance(afterTwo)).toBe(1530);
    expect(getWinningsAmount(afterTwo)).toBe(530);
  });

  it('win → second bet using winnings (available includes payout)', () => {
    const afterWin = { balance: 1030, winningsBalance: 30 };
    expect(getAvailableBalance(afterWin)).toBe(1030);
    expect(getAvailableBalance(afterWin) >= 1000).toBe(true);
  });

  it('withdrawal reservation does not reduce available twice', () => {
    // After request, balance already debited; reserved is audit.
    const afterReserve = {
      balance: 800,
      reservedBalance: 200,
      lockedDepositBalance: 0,
      winningsBalance: 30,
    };
    expect(getAvailableBalance(afterReserve)).toBe(800);
    expect(getWithdrawableAmount(afterReserve)).toBe(800);
  });

  it('locked deposit reduces withdrawable only', () => {
    const u = { balance: 1030, lockedDepositBalance: 1000, reservedBalance: 0, winningsBalance: 30 };
    expect(getAvailableBalance(u)).toBe(1030);
    expect(getWithdrawableAmount(u)).toBe(30);
  });
});
