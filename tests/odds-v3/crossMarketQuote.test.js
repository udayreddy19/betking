import { describe, it, expect } from 'vitest';
import { resolveServerOddsFromSnapshot } from '../../lib/oddsQuoteService.mjs';

describe('AUD-019 — market-scoped quote lookup', () => {
  const snapshot = {
    status: 'OK',
    matchId: 'm_scope',
    markets: [
      {
        marketId: 'match_winner',
        status: 'OPEN',
        selections: [
          { selectionId: '1', name: 'Team Alpha', odds: 1.9 },
          { selectionId: '2', name: 'Team Beta', odds: 2.1 },
        ],
      },
      {
        marketId: 'other_market',
        status: 'OPEN',
        selections: [
          { selectionId: '1', name: 'Wrong Team', odds: 5.0 },
        ],
      },
    ],
  };

  it('resolves selection only within the requested marketId', () => {
    const quote = resolveServerOddsFromSnapshot(snapshot, {
      matchId: 'm_scope',
      marketId: 'match_winner',
      selectionId: '1',
      clientOdds: 1.9,
    });
    expect(quote.odds).toBe(1.9);
    expect(quote.selectionId).toBe('1');
  });

  it('returns SELECTION_UNAVAILABLE when selection exists only in another market', () => {
    expect(() => resolveServerOddsFromSnapshot(snapshot, {
      matchId: 'm_scope',
      marketId: 'match_winner',
      selectionId: 'sel_only_in_other_market',
      clientOdds: 5.0,
      selectionName: 'Wrong Team',
    })).toThrow(/SELECTION_UNAVAILABLE|SELECTION_UNRESOLVED|ODDS_UNAVAILABLE/);
  });
});
