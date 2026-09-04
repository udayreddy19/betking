/**
 * Hard-block + new-account dual-control coverage for withdrawal risk.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  evaluateWithdrawalRisk,
  assertWithdrawalHardBlocks,
  requiresWithdrawalDualControl,
} from '../../lib/withdrawalRiskEngine.mjs';

function mockExec(handlers) {
  return async (sql, params = []) => {
    const q = String(sql).replace(/\s+/g, ' ');
    for (const h of handlers) {
      if (h.match(q, params)) return h.result;
    }
    return { rows: [{}] };
  };
}

describe('assertWithdrawalHardBlocks', () => {
  it('rejects when lifetime captured deposits are ₹0', async () => {
    const exec = mockExec([
      {
        match: (q) => q.includes('FROM deposits') && q.includes('PAID'),
        result: { rows: [{ total: 0 }] },
      },
    ]);
    await expect(assertWithdrawalHardBlocks({ userId: 'u1', exec })).rejects.toMatchObject({
      code: 'NO_CAPTURED_DEPOSITS',
      status: 400,
    });
  });

  it('allows when deposits are PAID (gateway success status)', async () => {
    const exec = mockExec([
      {
        match: (q) => q.includes('FROM deposits') && q.includes('PAID'),
        result: { rows: [{ total: 1500 }] },
      },
      {
        match: (q) => q.includes('FROM bets'),
        result: { rows: [{ cnt: 0 }] },
      },
    ]);
    await expect(assertWithdrawalHardBlocks({ userId: 'u1', exec })).resolves.toEqual({ ok: true });
  });

  it('rejects when open bets exist even with deposits', async () => {
    const exec = mockExec([
      {
        match: (q) => q.includes('FROM deposits'),
        result: { rows: [{ total: 5000 }] },
      },
      {
        match: (q) => q.includes('FROM bets') && q.includes('ACCEPTED'),
        result: { rows: [{ cnt: 2 }] },
      },
    ]);
    await expect(assertWithdrawalHardBlocks({ userId: 'u1', exec })).rejects.toMatchObject({
      code: 'OPEN_BETS',
      openBetCount: 2,
    });
  });

  it('allows when deposits exist and no open bets', async () => {
    const exec = mockExec([
      {
        match: (q) => q.includes('FROM deposits'),
        result: { rows: [{ total: 1000 }] },
      },
      {
        match: (q) => q.includes('FROM bets'),
        result: { rows: [{ cnt: 0 }] },
      },
    ]);
    await expect(assertWithdrawalHardBlocks({ userId: 'u1', exec })).resolves.toEqual({ ok: true });
  });
});

describe('evaluateWithdrawalRisk — hard blocks + new account', () => {
  it('hard-blocks no deposits and open bets; forces HIGH for accounts <7 days', async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    const exec = mockExec([
      {
        match: (q) => q.includes('FROM users'),
        result: {
          rows: [{
            kyc_status: 'VERIFIED',
            account_status: 'ACTIVE',
            risk_tier: 'LOW_RISK',
            registered_at: threeDaysAgo,
          }],
        },
      },
      {
        match: (q) => q.includes('FROM deposits'),
        result: { rows: [{ total: 0, cnt: 0, last_at: null }] },
      },
      {
        match: (q) => q.includes('FROM bets') && q.includes('ACCEPTED'),
        result: { rows: [{ cnt: 1 }] },
      },
      {
        match: (q) => q.includes('FROM withdrawals'),
        result: { rows: [{ cnt_24h: 0, rejected: 0, cnt_7d: 0 }] },
      },
      {
        match: (q) => q.includes('FROM bets WHERE user_id'),
        result: { rows: [{ cnt: 1, stake: 100 }] },
      },
      {
        match: (q) => q.includes('FROM risk_signals'),
        result: { rows: [{ cnt: 0 }] },
      },
    ]);

    const risk = await evaluateWithdrawalRisk({ userId: 'u_new', amount: 500, exec });
    expect(risk.hardBlocks.map((b) => b.code)).toEqual(
      expect.arrayContaining(['NO_CAPTURED_DEPOSITS', 'OPEN_BETS']),
    );
    expect(risk.recommendedAction).toBe('HARD_BLOCK');
    expect(risk.signals.some((s) => s.rule === 'NEW_ACCOUNT')).toBe(true);
    expect(risk.level).toBe('CRITICAL'); // hard blocks bump to CRITICAL
    expect(requiresWithdrawalDualControl('HIGH')).toBe(true);
  });

  it('forces dual-control HIGH for young accounts even without other hard blocks', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    const exec = mockExec([
      {
        match: (q) => q.includes('FROM users'),
        result: {
          rows: [{
            kyc_status: 'VERIFIED',
            account_status: 'ACTIVE',
            risk_tier: 'LOW_RISK',
            registered_at: twoDaysAgo,
          }],
        },
      },
      {
        match: (q) => q.includes('FROM deposits'),
        result: { rows: [{ total: 10000, cnt: 1, last_at: new Date().toISOString() }] },
      },
      {
        match: (q) => q.includes('FROM bets') && q.includes('ACCEPTED'),
        result: { rows: [{ cnt: 0 }] },
      },
      {
        match: (q) => q.includes('FROM withdrawals'),
        result: { rows: [{ cnt_24h: 0, rejected: 0, cnt_7d: 0 }] },
      },
      {
        match: (q) => q.includes('FROM bets WHERE'),
        result: { rows: [{ cnt: 5, stake: 2000 }] },
      },
      {
        match: (q) => q.includes('FROM risk_signals'),
        result: { rows: [{ cnt: 0 }] },
      },
    ]);

    const risk = await evaluateWithdrawalRisk({ userId: 'u_young', amount: 500, exec });
    expect(risk.hardBlocks).toHaveLength(0);
    expect(risk.level).toBe('HIGH');
    expect(risk.recommendedAction).toBe('HOLD');
    expect(requiresWithdrawalDualControl(risk.level)).toBe(true);
  });
});
