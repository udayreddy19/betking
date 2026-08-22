import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateMilestoneOverMarketBet } from '../../lib/settlement/milestoneOverEvaluator.mjs';
import { isMilestoneBoundaryReached, isOverBoundaryComplete } from '../../lib/settlement/overBoundary.mjs';
import { parseMilestoneOverMarket } from '../../lib/settlement/milestoneMarketParser.mjs';

vi.mock('../../lib/matchOverSnapshotStore.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getScoreAtOverEnd: vi.fn(),
    getBattingOversAndScore: vi.fn(),
  };
});

import { getScoreAtOverEnd, getBattingOversAndScore } from '../../lib/matchOverSnapshotStore.mjs';

function inn1CompleteMatch(firstInningsScore = 64) {
  return {
    id: 'oy_milestone_test',
    matchId: 'oy_milestone_test',
    sport: 'cricket',
    isLive: true,
    matchState: 'in',
    matchType: 'T20',
    liveDetails: {
      inningsId: 2,
      firstOvers: '20.0',
      firstRuns: 177,
      firstWickets: 5,
      chaseOvers: '11.4',
      chaseRuns: 76,
      chaseWickets: 6,
    },
    team1: { name: 'REDL', runs: 177, wickets: 5, overs: '20.0' },
    team2: { name: 'IPSW', runs: 76, wickets: 6, overs: '11.4' },
  };
}

describe('milestone over settlement (i1_overs_0_10_total)', () => {
  beforeEach(() => {
    vi.mocked(getScoreAtOverEnd).mockReset();
    vi.mocked(getBattingOversAndScore).mockReset();
  });

  it('TEST 1: INN 2 @ 11.4, end over 10 score 64, Under 66.5 → WON', async () => {
    getScoreAtOverEnd.mockResolvedValue(64);
    getBattingOversAndScore.mockReturnValue({
      innings: 2,
      oversStr: '11.4',
      score: 76,
      wickets: 6,
    });

    const bet = {
      bet_id: 'b_m1',
      market_id: 'i1_overs_0_10_total',
      selection_id: 'sel_under_66.5',
      selection_name: 'Under 66.5',
      placement_snapshot: { legs: [{ line: 66.5, marketInstance: { innings: 1, over: 10 } }] },
    };

    const res = await evaluateMilestoneOverMarketBet(bet, inn1CompleteMatch(64));
    expect(res?.outcome).toBe('WON');
    expect(res?.reason).toMatch(/score=64/);
  });

  it('TEST 2: same setup, end over 10 score 71 → LOST', async () => {
    getScoreAtOverEnd.mockResolvedValue(71);
    getBattingOversAndScore.mockReturnValue({
      innings: 2,
      oversStr: '11.4',
      score: 76,
      wickets: 6,
    });

    const bet = {
      bet_id: 'b_m2',
      market_id: 'i1_overs_0_10_total',
      selection_id: 'sel_under_66.5',
      selection_name: 'Under 66.5',
    };

    const res = await evaluateMilestoneOverMarketBet(bet, inn1CompleteMatch(71));
    expect(res?.outcome).toBe('LOST');
  });

  it('TEST 3: current 9.4 (over 10 in progress), snapshot unavailable → PENDING (null)', async () => {
    getScoreAtOverEnd.mockResolvedValue(null);
    getBattingOversAndScore.mockReturnValue({
      innings: 1,
      oversStr: '9.4',
      score: 55,
      wickets: 2,
    });

    const match = {
      id: 'oy_mid',
      liveDetails: { inningsId: 1, overs: '9.4', firstOvers: '9.4' },
      team1: { runs: 55, overs: '9.4' },
    };

    const bet = {
      bet_id: 'b_m3',
      market_id: 'i1_overs_0_10_total',
      selection_id: 'sel_under_66.5',
      selection_name: 'Under 66.5',
    };

    const res = await evaluateMilestoneOverMarketBet(bet, match);
    expect(res).toBeNull();
    expect(isMilestoneBoundaryReached(match, 1, 10)).toBe(false);
  });

  it('TEST 4: 11.0 with snapshot → settled immediately', async () => {
    getScoreAtOverEnd.mockResolvedValue(58);
    getBattingOversAndScore.mockReturnValue({
      innings: 1,
      oversStr: '11.0',
      score: 58,
      wickets: 3,
    });

    const bet = {
      bet_id: 'b_m4',
      market_id: 'i1_overs_0_10_total',
      selection_id: 'sel_under_66.5',
      selection_name: 'Under 66.5',
    };

    const res = await evaluateMilestoneOverMarketBet(bet, {
      id: 'oy_11',
      liveDetails: { inningsId: 1, overs: '11.0' },
      team1: { runs: 58, overs: '11.0' },
    });
    expect(res?.outcome).toBe('WON');
  });

  it('TEST 5: bet INN 1 while match INN 2 — uses innings-1 score not chase', async () => {
    getScoreAtOverEnd.mockResolvedValue(64);
    getBattingOversAndScore.mockReturnValue({ innings: 2, oversStr: '11.4', score: 76, wickets: 6 });

    const bet = {
      bet_id: 'b_m5',
      market_id: 'i1_overs_0_10_total',
      selection_id: 'sel_under_66.5',
      selection_name: 'Under 66.5',
    };

    const res = await evaluateMilestoneOverMarketBet(bet, inn1CompleteMatch(64));
    expect(getScoreAtOverEnd).toHaveBeenCalledWith(expect.any(String), 10, 1);
    expect(res?.outcome).toBe('WON');
  });

  it('TEST 11: boundary reached, score permanently unavailable → VOID', async () => {
    getScoreAtOverEnd.mockResolvedValue(null);
    getBattingOversAndScore.mockReturnValue({
      innings: 2,
      oversStr: '11.4',
      score: 76,
      wickets: 6,
    });

    const bet = {
      bet_id: 'b_m11',
      market_id: 'i1_overs_0_10_total',
      selection_id: 'sel_under_66.5',
      selection_name: 'Under 66.5',
    };

    const res = await evaluateMilestoneOverMarketBet(bet, inn1CompleteMatch());
    expect(res?.outcome).toBe('VOID');
    expect(res?.reason).toMatch(/BOUNDARY_DATA_UNAVAILABLE/);
  });
});

describe('over boundary notation', () => {
  it('10.3 means over 10 complete (in over 11)', () => {
    expect(isOverBoundaryComplete('10.3', 10)).toBe(true);
    expect(isOverBoundaryComplete('9.4', 10)).toBe(false);
    expect(isOverBoundaryComplete('10.0', 10)).toBe(true);
  });

  it('parseMilestoneOverMarket returns structured fields', () => {
    const p = parseMilestoneOverMarket('i1_overs_0_10_total', {
      selection_name: 'Under 66.5',
      placement_snapshot: { legs: [{ line: 66.5 }] },
    });
    expect(p.marketType).toBe('MILESTONE_OVER_TOTAL');
    expect(p.innings).toBe(1);
    expect(p.targetOver).toBe(10);
    expect(p.line).toBe(66.5);
  });
});
