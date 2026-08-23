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

import { validatePlacementOdds } from '../../lib/oddsPlacementValidation.mjs';

describe('AUD-016 — stale odds rejection at placement', () => {
  it('throws STALE_ODDS when client quote drifts beyond MAX_ODDS_DRIFT_PCT', () => {
    expect(() => validatePlacementOdds({
      serverOdds: 1.85,
      clientOdds: 2.5,
      matchId: 'm1',
      marketId: 'mw',
      selectionId: '1',
    })).toThrow(/STALE_ODDS/);
  });

  it('throws ODDS_CHANGED for moderate drift', () => {
    expect(() => validatePlacementOdds({
      serverOdds: 1.85,
      clientOdds: 1.87,
      matchId: 'm1',
      marketId: 'mw',
      selectionId: '1',
    })).toThrow(/ODDS_CHANGED/);
  });
});
