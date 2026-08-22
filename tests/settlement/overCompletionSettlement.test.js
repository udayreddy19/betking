import { describe, it, expect } from 'vitest';
import { evaluateOverMarketBet } from '../../lib/liveMatchSettlement.mjs';

describe('over completion settlement', () => {
  const liveMatch = (overs, extra = {}) => ({
    id: 'oy_over_test',
    sport: 'cricket',
    isLive: true,
    matchState: 'in',
    matchType: 'T20',
    liveDetails: {
      overs,
      firstOvers: overs,
      firstRuns: 120,
      firstWickets: 3,
      inningsId: 1,
    },
    team1: { name: 'A', shortName: 'A', runs: 120, wickets: 3, overs },
    team2: { name: 'B', shortName: 'B' },
    overHistory: extra.overHistory || [],
  });

  it('does not settle next over total before the over completes', async () => {
    const res = await evaluateOverMarketBet({
      market_id: 'i1_next_over_16_total',
      selection_id: 'sel_over_85',
      selection_name: 'Over 8.5',
    }, liveMatch('15.4'));
    expect(res).toBeNull();
  });

  it('settles WON when over 16 is complete and runs exceed line', async () => {
    const res = await evaluateOverMarketBet({
      market_id: 'i1_next_over_16_total',
      selection_id: 'sel_over_85',
      selection_name: 'Over 8.5',
    }, liveMatch('16.0', {
      overHistory: [{
        overNum: 16,
        balls: ['4', '1', '0', '2', '6', '0'],
        runs: 13,
        isCurrent: false,
      }],
    }));
    expect(res?.outcome).toBe('WON');
    expect(res.reason).toMatch(/runs=13/);
  });
});
