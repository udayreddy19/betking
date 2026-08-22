import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/oddsQuoteService.mjs', () => ({
  resolveServerOdds: vi.fn(async ({ clientOdds }) => ({
    odds: 1.85,
    changed: clientOdds != null && Math.abs(Number(clientOdds) - 1.85) / 1.85 > 0.02,
    previousOdds: clientOdds != null ? Number(clientOdds) : null,
  })),
  unwrapServerOddsQuote: (quote) => (quote?.odds != null ? Number(quote.odds) : Number(quote)),
  loadLiveOddsSnapshot: vi.fn(async () => ({ status: 'OK', markets: [] })),
}));

import { assertBettableQuote } from '../../lib/odds-v3/bookIntegrity.mjs';

describe('AUD-016 — stale odds rejection at placement', () => {
  it('throws STALE_ODDS when client quote drifts beyond MAX_ODDS_DRIFT_PCT', () => {
    expect(() => assertBettableQuote(1.85, 2.5)).toThrow(/STALE_ODDS/);
  });

  it('allows small drift within threshold', () => {
    expect(assertBettableQuote(1.85, 1.87)).toBe(1.85);
  });
});
