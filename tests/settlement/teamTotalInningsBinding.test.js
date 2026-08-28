import { describe, it, expect } from 'vitest';
import { evaluateTotalsMarketBet } from '../../lib/liveMatchSettlement.mjs';

describe('AUD-015 — team_total innings / team binding', () => {
  const chaseMatch = {
    id: 'oy_team_bind',
    sport: 'cricket',
    liveDetails: {
      firstRuns: 160,
      firstWickets: 5,
      chaseRuns: 98,
      chaseWickets: 3,
      inningsId: 2,
    },
    team1: { id: 't_home', name: 'Home', runs: 160, wickets: 5 },
    team2: { id: 't_away', name: 'Away', runs: 98, wickets: 3 },
  };

  it('i1_team_total uses first innings score even when chase is live', () => {
    const bet = {
      market_id: 'i1_team_total',
      selection_id: 'sel_under',
      selection_name: 'Under 165.5',
      placement_snapshot: JSON.stringify({
        legs: [{ teamId: 't_home', innings: 1, line: 165.5 }],
      }),
    };
    const res = evaluateTotalsMarketBet(bet, chaseMatch);
    expect(res?.outcome).toBe('WON');
    expect(res?.reason).toContain('165.5');
    expect(Number(res?.reason.match(/final=(\d+)/)?.[1] || res?.reason.match(/score=(\d+)/)?.[1])).toBe(160);
  });

  it('i2_team_total uses chase innings score not first innings', () => {
    const bet = {
      market_id: 'i2_team_total',
      selection_id: 'sel_over',
      selection_name: 'Over 95.5',
      placement_snapshot: JSON.stringify({
        legs: [{ teamId: 't_away', innings: 2, line: 95.5 }],
      }),
    };
    const res = evaluateTotalsMarketBet(bet, chaseMatch);
    expect(res?.outcome).toBe('WON');
    expect(res?.reason).toMatch(/98/);
  });

  it('team_total Under 182.5 does NOT settle as WON while 2nd innings is live and score is 106', () => {
    const liveMatch = {
      id: 'oy_live_chase',
      sport: 'cricket',
      status: 'LIVE',
      liveDetails: {
        firstRuns: 179,
        firstWickets: 5,
        chaseRuns: 106,
        chaseWickets: 2,
        inningsId: 2,
        firstOvers: '20.0',
        overs: '10.1',
      },
      team1: { id: 'csk', name: 'Chennai Super Kings SRL', runs: 179, wickets: 5 },
      team2: { id: 'dc', name: 'Delhi Capitals SRL', runs: 106, wickets: 2 },
    };

    const bet = {
      market_id: 'team_total',
      selection_id: 'sel_under_182.5',
      selection_name: 'Under 182.5',
      placement_snapshot: JSON.stringify({
        legs: [{ line: 182.5, marketId: 'team_total', selectionName: 'Under 182.5' }],
      }),
    };

    const res = evaluateTotalsMarketBet(bet, liveMatch);
    // Must NOT settle as WON while Delhi is at 106 runs in over 10.1
    expect(res).toBeNull();
  });
});
