import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/pg.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(async (fn) => fn({ query: vi.fn() })),
}));

import { query } from '../../db/pg.js';
import { evaluateWicketInOverMarketBet } from '../../lib/liveMatchSettlement.mjs';
import { resolveSettlementGrader } from '../../lib/settlement/marketSettlementRegistry.mjs';

describe('wicket in next over settlement', () => {
  beforeEach(() => {
    query.mockReset();
  });

  const matchAtOver11 = {
    id: 'oy_wkt_test',
    sport: 'cricket',
    isLive: true,
    matchState: 'in',
    liveDetails: {
      overs: '11.0',
      chaseOvers: '11.0',
      chaseRuns: 42,
      chaseWickets: 2,
      inningsId: 2,
    },
    team1: { name: 'A', shortName: 'A' },
    team2: { name: 'B', shortName: 'B', runs: 42, wickets: 2, overs: '11.0' },
  };

  it('registers wicket_in_next_over grader', () => {
    expect(resolveSettlementGrader('i2_wicket_in_next_over_10')).toBe('wicketInOverMarket');
    expect(resolveSettlementGrader('i1_wicket_in_over_5')).toBe('wicketInOverMarket');
  });

  it('settles LOST for Yes when no wicket fell in over 10', async () => {
    query.mockImplementation(async (sql) => {
      if (String(sql).includes('CREATE TABLE')) return { rows: [] };
      if (String(sql).includes('match_over_snapshots')) {
        return {
          rows: [
            { innings: 2, over_num: 9, wickets_at_end: 2, overs_raw: '9' },
            { innings: 2, over_num: 10, wickets_at_end: 2, overs_raw: '10' },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await evaluateWicketInOverMarketBet({
      market_id: 'i2_wicket_in_next_over_10',
      selection_id: 'sel_nwkt_yes',
      selection_name: 'Yes',
    }, matchAtOver11);

    expect(res?.outcome).toBe('LOST');
    expect(res.reason).toMatch(/wkts=0/);
  });

  it('settles WON for Yes when a wicket fell in the over', async () => {
    query.mockImplementation(async (sql) => {
      if (String(sql).includes('CREATE TABLE')) return { rows: [] };
      if (String(sql).includes('match_over_snapshots')) {
        return {
          rows: [
            { innings: 2, over_num: 9, wickets_at_end: 2, overs_raw: '9' },
            { innings: 2, over_num: 10, wickets_at_end: 3, overs_raw: '10' },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await evaluateWicketInOverMarketBet({
      market_id: 'i2_wicket_in_next_over_10',
      selection_id: 'sel_nwkt_yes',
      selection_name: 'Yes',
    }, matchAtOver11);

    expect(res?.outcome).toBe('WON');
    expect(res.reason).toMatch(/wkts=1/);
  });

  it('waits until over snapshot exists', async () => {
    query.mockImplementation(async (sql) => {
      if (String(sql).includes('CREATE TABLE')) return { rows: [] };
      return { rows: [] };
    });

    const res = await evaluateWicketInOverMarketBet({
      market_id: 'i2_wicket_in_next_over_10',
      selection_id: 'sel_nwkt_yes',
      selection_name: 'Yes',
    }, {
      ...matchAtOver11,
      liveDetails: { ...matchAtOver11.liveDetails, overs: '9.4', chaseOvers: '9.4' },
      team2: { ...matchAtOver11.team2, overs: '9.4' },
    });
    expect(res).toBeNull();
  });
});
