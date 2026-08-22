import { describe, it, expect, beforeEach, vi } from 'vitest';
import { assertBettableQuote } from '../../lib/odds-v3/bookIntegrity.mjs';

const resolveServerOdds = vi.fn();

vi.mock('../../lib/oddsQuoteService.mjs', () => ({
  resolveServerOdds: (...args) => resolveServerOdds(...args),
}));

vi.mock('../../lib/marketSuspensionEngine.mjs', () => ({
  marketSuspensionEngine: {
    getActiveCauses: vi.fn(async () => []),
  },
}));

import { accumulatorEngine } from '../../lib/accumulatorEngine.mjs';
import { enforceBetRisk } from '../../lib/betRiskEnforcement.mjs';
import { recordBetExposure } from '../../lib/exposureEngine.mjs';
import { priceCashoutFromV3Snapshot } from '../../lib/cashoutPricing.mjs';

describe('Acca client-odds rejection', () => {
  beforeEach(() => {
    resolveServerOdds.mockReset();
  });

  it('rejects accumulator when any leg client odds drift > 2%', async () => {
    resolveServerOdds
      .mockImplementationOnce(async ({ clientOdds }) => assertBettableQuote(1.50, clientOdds))
      .mockImplementationOnce(async ({ clientOdds }) => assertBettableQuote(2.00, clientOdds));

    await expect(accumulatorEngine.validateAccumulator(100, [
      { matchId: 'm1', marketId: 'mw', selectionId: 's1', odds: 1.50 },
      { matchId: 'm2', marketId: 'mw', selectionId: 's2', odds: 3.50 },
    ])).rejects.toThrow(/ODDS_CHANGED/);
  });

  it('accepts accumulator when every leg matches server odds', async () => {
    resolveServerOdds
      .mockImplementationOnce(async ({ clientOdds }) => assertBettableQuote(1.50, clientOdds))
      .mockImplementationOnce(async ({ clientOdds }) => assertBettableQuote(2.00, clientOdds));

    const result = await accumulatorEngine.validateAccumulator(100, [
      { matchId: 'm1', marketId: 'mw', selectionId: 's1', odds: 1.50 },
      { matchId: 'm2', marketId: 'mw', selectionId: 's2', odds: 2.00 },
    ]);
    expect(result.combinedOdds).toBe(3);
    expect(result.selections[0].odds).toBe(1.5);
    expect(result.selections[1].odds).toBe(2);
  });
});

describe('Placement liability cap', () => {
  it('allows bets even when in-memory exposure is at the old liability ceiling', async () => {
    const matchId = `m_liab_${Date.now()}`;
    recordBetExposure({
      matchId,
      marketId: 'match_winner',
      selectionId: 'home',
      stake: 250000,
      odds: 3.0,
    });

    const stake = await enforceBetRisk({
      userId: 'usr_liab_test',
      stake: 5000,
      betType: 'SINGLE',
      validatedSelections: [{
        matchId,
        marketId: 'match_winner',
        selectionId: 'home',
        odds: 2.0,
      }],
    });
    expect(stake).toBe(5000);
  });

  it('allows small stakes within remaining capacity', async () => {
    const matchId = `m_liab_ok_${Date.now()}`;
    const stake = await enforceBetRisk({
      userId: 'usr_liab_ok',
      stake: 100,
      betType: 'SINGLE',
      validatedSelections: [{
        matchId,
        marketId: 'match_winner',
        selectionId: 'away',
        odds: 1.85,
      }],
    });
    expect(stake).toBe(100);
  });
});

describe('Cashout V3 re-price', () => {
  beforeEach(() => {
    resolveServerOdds.mockReset();
  });

  it('prices cashout from current odds ratio, not stored potential alone', async () => {
    // Backed at 2.00, current shortened to 1.50 → fair rises above stake
    resolveServerOdds.mockResolvedValue(1.50);
    const quote = await priceCashoutFromV3Snapshot({
      stake: 100,
      acceptedOdds: 2.0,
      matchId: 'm1',
      marketId: 'mw',
      selectionId: 's1',
      vipTier: 'BRONZE',
    });
    expect(quote.available).toBe(true);
    expect(quote.fairCashout).toBeCloseTo(100 * (2 / 1.5), 1);
    expect(quote.cashoutValue).toBeGreaterThan(100);
    expect(quote.cashoutValue).toBeLessThan(quote.potentialPayout);
  });

  it('returns unavailable when live selection cannot be quoted', async () => {
    resolveServerOdds.mockRejectedValue(new Error('MARKET_ALREADY_DETERMINED: closed'));
    const quote = await priceCashoutFromV3Snapshot({
      stake: 100,
      acceptedOdds: 2.0,
      matchId: 'm1',
      marketId: 'mw',
      selectionId: 's1',
    });
    expect(quote.available).toBe(false);
    expect(quote.cashoutValue).toBe(0);
  });
});
