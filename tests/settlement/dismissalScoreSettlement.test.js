import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/pg.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(async (fn) => fn({ query: vi.fn() })),
}));

import { query } from '../../db/pg.js';
import {
  evaluateDismissalMarketBet,
  evaluateBetAfterMatchOver,
  isDismissalInningsComplete,
} from '../../lib/liveMatchSettlement.mjs';

describe('dismissal score (Nth wicket) settlement', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
  });

  const chaseMatch212for4 = {
    id: 'oy_fow_void',
    sport: 'cricket',
    isLive: true,
    matchState: 'in',
    liveDetails: {
      firstRuns: 212,
      firstWickets: 4,
      firstOvers: '20.0',
      chaseRuns: 35,
      chaseWickets: 2,
      chaseOvers: '5.0',
      overs: '5.0',
      inningsId: 2,
      chaseTeamName: 'Mumbai Indians SRL',
    },
    team1: { name: 'Delhi Capitals SRL', shortName: 'DC', runs: 212, wickets: 4, overs: '20.0' },
    team2: { name: 'Mumbai Indians SRL', shortName: 'MI', runs: 35, wickets: 2, overs: '5.0' },
  };

  it('VOIDs when 1st innings ends without the 5th wicket (212/4)', async () => {
    const result = await evaluateDismissalMarketBet({
      market_id: 'i1_team_score_at_5_dismissal',
      selection_id: 'under_208_5',
      selection_name: 'Under 208.5',
    }, chaseMatch212for4);

    expect(result).toEqual({
      outcome: 'VOID',
      reason: 'dismissal_5_i1_never_occurred_wkts=4',
    });
  });

  it('stays PENDING while 1st innings is still live under 5 wickets', async () => {
    const liveFirst = {
      ...chaseMatch212for4,
      liveDetails: {
        overs: '18.2',
        firstRuns: 190,
        firstWickets: 4,
        firstOvers: '18.2',
        inningsId: 1,
      },
      team1: { name: 'Delhi Capitals SRL', shortName: 'DC', runs: 190, wickets: 4, overs: '18.2' },
      team2: { name: 'Mumbai Indians SRL', shortName: 'MI' },
    };

    const result = await evaluateDismissalMarketBet({
      market_id: 'i1_team_score_at_5_dismissal',
      selection_id: 'under_208_5',
      selection_name: 'Under 208.5',
    }, liveFirst);

    expect(result).toBeNull();
  });

  it('settles Over/Under when the Nth wicket snapshot exists', async () => {
    query.mockImplementation(async (sql) => {
      if (String(sql).includes('SELECT score_at_dismissal')) {
        return { rows: [{ score_at_dismissal: 195 }] };
      }
      return { rows: [] };
    });

    const withFiveDown = {
      ...chaseMatch212for4,
      liveDetails: {
        ...chaseMatch212for4.liveDetails,
        firstWickets: 5,
        firstRuns: 195,
      },
    };

    const over = await evaluateDismissalMarketBet({
      market_id: 'i1_team_score_at_5_dismissal',
      selection_id: 'over_208_5',
      selection_name: 'Over 208.5',
    }, withFiveDown);
    expect(over?.outcome).toBe('LOST');

    const under = await evaluateDismissalMarketBet({
      market_id: 'i1_team_score_at_5_dismissal',
      selection_id: 'under_208_5',
      selection_name: 'Under 208.5',
    }, withFiveDown);
    expect(under?.outcome).toBe('WON');
  });

  it('VOIDs team_score_at markets after match over fallback', () => {
    expect(evaluateBetAfterMatchOver({
      market_id: 'i1_team_score_at_5_dismissal',
    })).toEqual({
      outcome: 'VOID',
      reason: 'dismissal_never_occurred_match_over',
    });
  });

  it('detects innings complete once chase has started', () => {
    expect(isDismissalInningsComplete(chaseMatch212for4, 1)).toBe(true);
    expect(isDismissalInningsComplete(chaseMatch212for4, 2)).toBe(false);
  });
});
