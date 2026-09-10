import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/emergencyState.mjs', () => ({
  assertEmergencyAllows: vi.fn(async () => true),
}));

vi.mock('../../lib/cashoutPricing.mjs', () => ({
  priceCashoutFromV3Snapshot: vi.fn(async () => ({
    available: true,
    cashoutValue: 42.5,
  })),
}));

describe('quoteBetCashoutsBatch', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns empty quotes for empty betIds', async () => {
    const { quoteBetCashoutsBatch } = await import('../../lib/cashoutEngine.mjs');
    const result = await quoteBetCashoutsBatch({ betIds: [], userId: 'u1' });
    expect(result).toEqual({ success: true, quotes: {} });
  });

  it('batches bets/legs/loyalty into one quote map', async () => {
    const exec = {
      query: vi.fn(async (sql, params) => {
        if (String(sql).includes('FROM bets')) {
          return {
            rows: [{
              bet_id: 'b1',
              user_id: 'u1',
              match_id: 'm1',
              market_id: 'mk1',
              selection_id: '1',
              stake: 100,
              odds: 2,
              accepted_odds: 2,
              potential_payout: 200,
              status: 'PENDING',
              bet_type: 'SINGLE',
              fund_source: 'cash',
            }],
          };
        }
        if (String(sql).includes('FROM bet_selections')) {
          return {
            rows: [{
              bet_id: 'b1',
              match_id: 'm1',
              market_id: 'mk1',
              selection_id: '1',
              selection_name: 'Home',
              odds: 2,
            }],
          };
        }
        if (String(sql).includes('user_loyalty')) {
          return { rows: [{ tier: 'GOLD' }] };
        }
        return { rows: [] };
      }),
    };

    const { quoteBetCashoutsBatch } = await import('../../lib/cashoutEngine.mjs');
    const result = await quoteBetCashoutsBatch({
      betIds: ['b1', 'missing'],
      userId: 'u1',
      exec,
    });

    expect(result.success).toBe(true);
    expect(result.quotes.b1.available).toBe(true);
    expect(result.quotes.b1.cashoutValue).toBe(42.5);
    expect(result.quotes.missing).toEqual({
      available: false,
      cashoutValue: 0,
      reason: 'BET_NOT_FOUND',
    });
    expect(exec.query).toHaveBeenCalledTimes(3);
  });
});
