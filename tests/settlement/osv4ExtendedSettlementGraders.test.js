/**
 * Settlement graders for OSV4 extended markets — earned settleability, not vanity.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateScoreSpreadBet,
  evaluateScoreTotalBet,
  evaluateSoccerHalfTimeBet,
  evaluateSoccerCorrectScoreBet,
  evaluateFirstToScoreBet,
  evaluateWinningMarginBet,
  evaluateCorrectSetScoreBet,
  evaluateFirstHalfWinnerBet,
  evaluateFirstHalfTotalBet,
  evaluateBetForSettlement,
} from '../../lib/liveMatchSettlement.mjs';
import { resolveSettlementGrader } from '../../lib/settlement/marketSettlementRegistry.mjs';
import { validateMarketSettlementCompatibility } from '../../lib/settlement/marketSettlementContract.mjs';

function finalMatch(overrides = {}) {
  return {
    id: 'm1',
    status: 'COMPLETED',
    isCompleted: true,
    matchState: 'post',
    score1: 2,
    score2: 1,
    liveDetails: { score1: 2, score2: 1, minute: 90 },
    ...overrides,
    liveDetails: {
      score1: 2,
      score2: 1,
      minute: 90,
      ...(overrides.liveDetails || {}),
    },
  };
}

describe('OSV4 extended settlement graders', () => {
  const marketIds = [
    'ht_result',
    'correct_score',
    'first_to_score',
    'run_line',
    'total_runs',
    'puck_line',
    'total_goals',
    'first_half_winner',
    'first_half_total',
    'winning_margin',
    'correct_set_score',
  ];

  it('every extended marketId has registry grader and contract parity', () => {
    for (const marketId of marketIds) {
      const grader = resolveSettlementGrader(marketId);
      expect(grader, marketId).toBeTruthy();
      const compat = validateMarketSettlementCompatibility({ marketId, status: 'OPEN', selections: [] });
      expect(compat.compatible, `${marketId}: ${compat.reason}`).toBe(true);
      expect(compat.resolver).toBe(grader);
    }
  });

  it('grades baseball RunLine and hockey PuckLine spreads', () => {
    const match = finalMatch({ score1: 5, score2: 3, liveDetails: { score1: 5, score2: 3 } });
    expect(evaluateScoreSpreadBet({
      market_id: 'run_line',
      selection_id: 'RunLine:1 -1.5',
      selection_name: 'Home -1.5',
    }, match).outcome).toBe('WON');
    expect(evaluateScoreSpreadBet({
      market_id: 'puck_line',
      selection_id: 'PuckLine:2 +1.5',
      selection_name: 'Away +1.5',
    }, match).outcome).toBe('LOST');
  });

  it('grades total_runs / total_goals via score total', () => {
    const match = finalMatch({ score1: 4, score2: 3, liveDetails: { score1: 4, score2: 3 } });
    expect(evaluateScoreTotalBet({
      market_id: 'total_runs',
      selection_id: 'Runs:Over 6.5',
      selection_name: 'Over 6.5',
    }, match).outcome).toBe('WON');
    expect(evaluateScoreTotalBet({
      market_id: 'total_goals',
      selection_id: 'Goals:Under 8.5',
      selection_name: 'Under 8.5',
    }, match).outcome).toBe('WON');
  });

  it('soccer HT voids without HT evidence; grades with htScore', () => {
    const noHt = finalMatch();
    expect(evaluateSoccerHalfTimeBet({ market_id: 'ht_result', selection_id: 'HT:1' }, noHt).outcome).toBe('VOID');
    const withHt = finalMatch({ liveDetails: { htScore1: 1, htScore2: 0, score1: 1, score2: 2 } });
    expect(evaluateSoccerHalfTimeBet({ market_id: 'ht_result', selection_id: 'HT:1' }, withHt).outcome).toBe('WON');
    expect(evaluateSoccerHalfTimeBet({ market_id: 'ht_result', selection_id: 'HT:2' }, withHt).outcome).toBe('LOST');
  });

  it('soccer correct score CS:h-a', () => {
    const match = finalMatch({ score1: 2, score2: 1, liveDetails: { score1: 2, score2: 1 } });
    expect(evaluateSoccerCorrectScoreBet({
      market_id: 'correct_score',
      selection_id: 'CS:2-1',
      selection_name: '2-1',
    }, match).outcome).toBe('WON');
    expect(evaluateSoccerCorrectScoreBet({
      market_id: 'correct_score',
      selection_id: 'CS:1-0',
      selection_name: '1-0',
    }, match).outcome).toBe('LOST');
  });

  it('first_to_score uses evidence; voids when FT known but first goal unknown', () => {
    const withEvidence = finalMatch({ liveDetails: { score1: 2, score2: 1, firstGoalTeam: '1' } });
    expect(evaluateFirstToScoreBet({ market_id: 'first_to_score', selection_id: 'FTS:1' }, withEvidence).outcome).toBe('WON');
    const noEvidence = finalMatch({ liveDetails: { score1: 2, score2: 1 } });
    expect(evaluateFirstToScoreBet({ market_id: 'first_to_score', selection_id: 'FTS:1' }, noEvidence).outcome).toBe('VOID');
  });

  it('winning margin bands', () => {
    const match = finalMatch({ score1: 110, score2: 102, liveDetails: { score1: 110, score2: 102 } });
    expect(evaluateWinningMarginBet({ market_id: 'winning_margin', selection_id: 'WM:6-10' }, match).outcome).toBe('WON');
    expect(evaluateWinningMarginBet({ market_id: 'winning_margin', selection_id: 'WM:1-5' }, match).outcome).toBe('LOST');
  });

  it('correct set score counts completed sets only', () => {
    const match = finalMatch({
      liveDetails: { sets1: [6, 3, 6], sets2: [4, 6, 2], score1: 2, score2: 1 },
    });
    expect(evaluateCorrectSetScoreBet({
      market_id: 'correct_set_score',
      selection_id: 'SS:2-1',
      selection_name: '2-1',
    }, match).outcome).toBe('WON');
  });

  it('first half winner/total require HT scores', () => {
    const withHt = finalMatch({ liveDetails: { htScore1: 55, htScore2: 48, score1: 100, score2: 98 } });
    expect(evaluateFirstHalfWinnerBet({ market_id: 'first_half_winner', selection_id: 'H1:1' }, withHt).outcome).toBe('WON');
    expect(evaluateFirstHalfTotalBet({
      market_id: 'first_half_total',
      selection_id: 'H1:Over 100.5',
      selection_name: 'Over 100.5',
    }, withHt).outcome).toBe('WON');
    const noHt = finalMatch();
    expect(evaluateFirstHalfWinnerBet({ market_id: 'first_half_winner', selection_id: 'H1:1' }, noHt).outcome).toBe('VOID');
  });

  it('evaluateBetForSettlement routes new markets end-to-end', async () => {
    const match = finalMatch({
      score1: 3,
      score2: 1,
      liveDetails: { score1: 3, score2: 1, firstGoalTeam: 'home' },
    });
    const result = await evaluateBetForSettlement({
      market_id: 'correct_score',
      selection_id: 'CS:3-1',
      selection_name: '3-1',
      match_id: 'm1',
    }, match);
    expect(result?.outcome).toBe('WON');
  });
});
