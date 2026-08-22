import { describe, it, expect } from 'vitest';
import { evaluateBetForSettlement } from '../../lib/liveMatchSettlement.mjs';

describe('AUD-014 — next-over runs unknown stays PENDING', () => {
  it('returns null (OPEN) when over runs cannot be resolved yet', async () => {
    const bet = {
      bet_id: 'b_over_unknown',
      market_id: 'i1_next_over_12_total',
      selection_id: 'sel_over',
      selection_name: 'Over 8.5',
    };
    const match = {
      id: 'oy_test',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      liveDetails: { overs: '11.4', firstOvers: '11.4', firstRuns: 95, firstWickets: 3, inningsId: 1 },
      team1: { name: 'A', runs: 95, wickets: 3 },
      team2: { name: 'B' },
    };
    const lookup = () => match;
    const evaluated = await evaluateBetForSettlement(bet, lookup);
    expect(evaluated).toBeNull();
  });
});
