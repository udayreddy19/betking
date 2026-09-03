import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/pg.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(async (fn) => fn({ query: vi.fn() })),
}));

import { query } from '../../db/pg.js';
import {
  evaluateOverMarketBet,
  evaluateWicketInOverMarketBet,
  evaluateBetAfterMatchOver,
} from '../../lib/liveMatchSettlement.mjs';
import { evaluateMilestoneOverMarketBet } from '../../lib/settlement/milestoneOverEvaluator.mjs';
import {
  isOverNeverCompleted,
  isInningsComplete,
  resolveInningsWickets,
} from '../../lib/settlement/inningsCompletion.mjs';

describe('never-event settlement (innings ended early)', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
  });

  /** 1st inns all out 95/10 in 14.3 — chase underway. Over 16 never bowled. */
  const earlyEndChase = {
    id: 'oy_early_end',
    sport: 'cricket',
    isLive: true,
    matchState: 'in',
    matchType: 'T20',
    liveDetails: {
      firstRuns: 95,
      firstWickets: 10,
      firstOvers: '14.3',
      chaseRuns: 20,
      chaseWickets: 1,
      chaseOvers: '3.0',
      overs: '3.0',
      inningsId: 2,
      firstTeamName: 'Team A',
      chaseTeamName: 'Team B',
      commentary: 'all out',
    },
    team1: { name: 'Team A', shortName: 'A', runs: 95, wickets: 10, overs: '14.3' },
    team2: { name: 'Team B', shortName: 'B', runs: 20, wickets: 1, overs: '3.0' },
  };

  it('detects over never completed after early innings end', () => {
    expect(isInningsComplete(earlyEndChase, 1)).toBe(true);
    expect(isOverNeverCompleted(earlyEndChase, 1, 16)).toBe(true);
    expect(isOverNeverCompleted(earlyEndChase, 1, 14)).toBe(false);
    expect(resolveInningsWickets(earlyEndChase, 1)).toBe(10);
  });

  it('VOIDs next_over when over never bowled', async () => {
    const res = await evaluateOverMarketBet({
      market_id: 'i1_next_over_16_total',
      selection_id: 'sel_over_85',
      selection_name: 'Over 8.5',
    }, earlyEndChase);

    expect(res).toEqual({
      outcome: 'VOID',
      reason: 'over_16_i1_never_bowled',
    });
  });

  it('VOIDs wicket_in_over when over never bowled', async () => {
    const res = await evaluateWicketInOverMarketBet({
      market_id: 'i1_wicket_in_next_over_16',
      selection_id: 'sel_yes',
      selection_name: 'Yes',
    }, earlyEndChase);

    expect(res).toEqual({
      outcome: 'VOID',
      reason: 'wicket_in_over_16_i1_never_bowled',
    });
  });

  it('settles milestone at final innings score when overs end early', async () => {
    const res = await evaluateMilestoneOverMarketBet({
      bet_id: 'b_early_mile',
      market_id: 'i1_overs_0_20_total',
      selection_id: 'sel_under_120_5',
      selection_name: 'Under 120.5',
    }, earlyEndChase);

    expect(res?.outcome).toBe('WON');
    expect(res?.reason).toMatch(/score=95/);
    expect(res?.scoreSource).toBe('innings_final_early_end');
  });

  it('match-over fallback VOIDs next_over only when never-bowled is proven', () => {
    expect(evaluateBetAfterMatchOver({ market_id: 'i1_next_over_18_total' })).toBeNull();
    expect(evaluateBetAfterMatchOver({ market_id: 'i1_next_over_18_total' }, earlyEndChase)).toEqual({
      outcome: 'VOID',
      reason: 'over_never_bowled_match_over',
    });
  });

  it('does not blind-void next_over when chase is still live (County false-final)', () => {
    const countyLive = {
      id: 'cb_county',
      league: 'County Championship Division 1',
      matchState: 'in',
      isLive: true,
      startTime: new Date(Date.now() - 10 * 3600 * 1000).toISOString(),
      liveDetails: {
        inningsId: 2,
        firstRuns: 194,
        firstWickets: 10,
        chaseRuns: 92,
        chaseWickets: 0,
        chaseOvers: '23.0',
        overs: '23.0',
      },
      team1: { name: 'Somerset', runs: 194, wickets: 10 },
      team2: { name: 'Glamorgan', runs: 92, wickets: 0 },
    };
    expect(evaluateBetAfterMatchOver({ market_id: 'i2_next_over_24_total' }, countyLive)).toBeNull();
  });

  it('stays PENDING while innings still live before the over', async () => {
    const live = {
      ...earlyEndChase,
      liveDetails: {
        overs: '12.2',
        firstOvers: '12.2',
        firstRuns: 80,
        firstWickets: 4,
        inningsId: 1,
      },
      team1: { name: 'Team A', runs: 80, wickets: 4, overs: '12.2' },
      team2: { name: 'Team B' },
    };

    expect(await evaluateOverMarketBet({
      market_id: 'i1_next_over_16_total',
      selection_id: 'sel_over',
      selection_name: 'Over 8.5',
    }, live)).toBeNull();
  });
});
