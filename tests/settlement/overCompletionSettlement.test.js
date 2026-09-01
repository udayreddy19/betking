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

  it('settles 2nd-innings over 6 from that innings, not 1st-innings over 6', async () => {
    const res = await evaluateOverMarketBet({
      market_id: 'i2_next_over_6_total',
      market_name: '2nd Innings — Over 6 Total',
      selection_id: 'sel_under_12.5',
      selection_name: 'Under 12.5',
    }, {
      id: 'oy_over_i2',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      matchType: 'T20',
      liveDetails: {
        inningsId: 2,
        overs: '6.0',
        chaseOvers: '6.0',
        chaseRuns: 103,
        chaseWickets: 1,
        chaseTeamName: 'Jalandhar Warriors',
        firstOvers: '20.0',
        firstRuns: 264,
        firstWickets: 5,
        firstTeamName: 'Amritsar Soormas',
      },
      team1: { name: 'Jalandhar Warriors', shortName: 'JW', runs: 103, wickets: 1, overs: '6.0' },
      team2: { name: 'Amritsar Soormas', shortName: 'AS', runs: 264, wickets: 5, overs: '20.0' },
      overHistory: [
        { overNum: 6, inningsId: 1, runs: 48, balls: ['6', '6', '6', '6', '6', '6', '6', '6'], isCurrent: false },
        { overNum: 6, inningsId: 2, runs: 16, balls: ['6', '1', '•', '1', '4', '4'], isCurrent: false },
      ],
    });
    expect(res?.reason).toMatch(/runs=16/);
    expect(res?.outcome).toBe('LOST');
  });
});
