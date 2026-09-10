import { describe, it, expect } from 'vitest';
import { provisionalWinnerMarketsFromMatch } from '../../src/services/oddsService.js';

describe('provisionalWinnerMarketsFromMatch', () => {
  it('seeds from engineCardMarkets when present (not Match Winner only)', () => {
    const markets = provisionalWinnerMarketsFromMatch({
      team1: { name: 'RR' },
      team2: { name: 'PBKS' },
      odds: { team1: 3.5, team2: 1.2 },
      engineCardMarkets: [
        {
          marketId: 'match_winner',
          name: 'Match Winner',
          category: 'main',
          status: 'OPEN',
          selections: [
            { selectionId: '1', name: 'RR', odds: 3.5 },
            { selectionId: '2', name: 'PBKS', odds: 1.2 },
          ],
        },
        {
          marketId: 'match_total',
          name: 'Match Total',
          category: 'totals',
          status: 'OPEN',
          line: 320.5,
          selections: [
            { selectionId: 'over', name: 'Over', odds: 1.85 },
            { selectionId: 'under', name: 'Under', odds: 1.85 },
          ],
        },
      ],
    });
    expect(markets.map((m) => m.marketId)).toEqual(['match_winner', 'match_total']);
    expect(markets[1].category).toBe('totals');
  });

  it('falls back to Match Winner from match.odds', () => {
    const markets = provisionalWinnerMarketsFromMatch({
      team1: { name: 'RR' },
      team2: { name: 'PBKS' },
      odds: { team1: 3.53, team2: 1.13 },
    });
    expect(markets).toHaveLength(1);
    expect(markets[0].marketId).toBe('match_winner');
  });
});
