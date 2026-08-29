import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateTotalsMarketBet,
  evaluateTeamBoundaryMarketBet,
  evaluateMostBoundariesBet,
  evaluateMatchAggregateBet,
  evaluateSpecialMatchBet,
  evaluateOverOddEvenBet,
  evaluateMethodOfDismissalBet,
  evaluateTopBatterBet,
  evaluateBatterH2HBet,
  evaluateSoccerGoalsBet,
  evaluateBetForSettlement,
} from '../../lib/liveMatchSettlement.mjs';

import {
  resolveSettlementGrader,
  getSettlementBoundary,
  MARKET_SETTLEMENT_REGISTRY,
} from '../../lib/settlement/marketSettlementRegistry.mjs';

import {
  resolveMarketContract,
  validateMarketSettlementCompatibility,
  MARKET_SETTLEMENT_CONTRACTS,
} from '../../lib/settlement/marketSettlementContract.mjs';

describe('Phase 30 — Market Settlement Completeness & Financial Correctness Test Suite', () => {

  // =========================================================================
  // STEP 2: P0 FINANCIAL DEFECT VERIFICATION & REGRESSION TESTS
  // =========================================================================
  describe('Step 2: P0 Financial Defect — Team Total Fours & Sixes vs Generic Runs', () => {
    it('Matcher Ordering: team_total_fours resolves to teamBoundaryMarket, NOT totalsMarket', () => {
      const graderFours = resolveSettlementGrader('team_total_fours');
      assert.equal(graderFours, 'teamBoundaryMarket', 'team_total_fours must route to teamBoundaryMarket');

      const graderSixes = resolveSettlementGrader('team_total_sixes');
      assert.equal(graderSixes, 'teamBoundaryMarket', 'team_total_sixes must route to teamBoundaryMarket');

      const graderGeneric = resolveSettlementGrader('team_total');
      assert.equal(graderGeneric, 'totalsMarket', 'generic team_total must route to totalsMarket');
    });

    it('Fours Case 1: Over 14.5 Fours with 12 fours and 220 runs evaluates to LOST', () => {
      const bet = {
        bet_id: 'bet_fours_lost_1',
        market_id: 'team_total_fours',
        selection_id: 'sel_t_four_over',
        selection_name: 'Over 14.5',
      };
      const match = {
        status: 'COMPLETED',
        matchState: 'POST',
        team1: { runs: 220, fours: 12, sixes: 8 },
        team2: { runs: 180, fours: 14, sixes: 4 },
        liveDetails: {
          firstRuns: 220,
          chaseRuns: 180,
          team1: { fours: 12, sixes: 8 },
          team2: { fours: 14, sixes: 4 },
        },
      };

      const evalResult = evaluateTeamBoundaryMarketBet(bet, match);
      assert.ok(evalResult, 'Grader must return an evaluation result');
      assert.equal(evalResult.outcome, 'LOST', 'Over 14.5 Fours with 12 actual fours MUST be LOST even if team runs = 220');
      assert.ok(evalResult.reason.includes('team_boundary_final=12_line=14.5'));
    });

    it('Fours Case 2: Over 14.5 Fours with 16 fours and 140 runs evaluates to WON', () => {
      const bet = {
        bet_id: 'bet_fours_won_1',
        market_id: 'team_total_fours',
        selection_id: 'sel_t_four_over',
        selection_name: 'Over 14.5',
      };
      const match = {
        status: 'COMPLETED',
        matchState: 'POST',
        team1: { runs: 140, fours: 16, sixes: 2 },
        team2: { runs: 135, fours: 10, sixes: 1 },
        liveDetails: {
          firstRuns: 140,
          chaseRuns: 135,
          team1: { fours: 16, sixes: 2 },
          team2: { fours: 10, sixes: 1 },
        },
      };

      const evalResult = evaluateTeamBoundaryMarketBet(bet, match);
      assert.ok(evalResult);
      assert.equal(evalResult.outcome, 'WON', 'Over 14.5 Fours with 16 actual fours MUST be WON even if team runs = 140');
      assert.ok(evalResult.reason.includes('team_boundary_final=16_line=14.5'));
    });

    it('Sixes Case 1: Over 6.5 Sixes with 5 sixes and 210 runs evaluates to LOST', () => {
      const bet = {
        bet_id: 'bet_sixes_lost_1',
        market_id: 'team_total_sixes',
        selection_id: 'sel_t_six_over',
        selection_name: 'Over 6.5',
      };
      const match = {
        status: 'COMPLETED',
        matchState: 'POST',
        team1: { runs: 210, fours: 20, sixes: 5 },
        team2: { runs: 190, fours: 18, sixes: 4 },
        liveDetails: {
          firstRuns: 210,
          team1: { fours: 20, sixes: 5 },
        },
      };

      const evalResult = evaluateTeamBoundaryMarketBet(bet, match);
      assert.ok(evalResult);
      assert.equal(evalResult.outcome, 'LOST', 'Over 6.5 Sixes with 5 actual sixes MUST be LOST even if team runs = 210');
      assert.ok(evalResult.reason.includes('team_boundary_final=5_line=6.5'));
    });

    it('Sixes Case 2: Over 6.5 Sixes with 8 sixes and 130 runs evaluates to WON', () => {
      const bet = {
        bet_id: 'bet_sixes_won_1',
        market_id: 'team_total_sixes',
        selection_id: 'sel_t_six_over',
        selection_name: 'Over 6.5',
      };
      const match = {
        status: 'COMPLETED',
        matchState: 'POST',
        team1: { runs: 130, fours: 6, sixes: 8 },
        team2: { runs: 125, fours: 5, sixes: 3 },
        liveDetails: {
          firstRuns: 130,
          team1: { fours: 6, sixes: 8 },
        },
      };

      const evalResult = evaluateTeamBoundaryMarketBet(bet, match);
      assert.ok(evalResult);
      assert.equal(evalResult.outcome, 'WON', 'Over 6.5 Sixes with 8 actual sixes MUST be WON');
      assert.ok(evalResult.reason.includes('team_boundary_final=8_line=6.5'));
    });

    it('Defense-in-depth: evaluateTotalsMarketBet ignores boundary markets', () => {
      const betFours = { market_id: 'team_total_fours', selection_name: 'Over 14.5' };
      const res = evaluateTotalsMarketBet(betFours, { team1: { runs: 200 } });
      assert.equal(res, null, 'evaluateTotalsMarketBet must return null for fours/sixes markets');
    });
  });

  // =========================================================================
  // STEP 3 & 4: CENTRAL MARKET CONTRACT & ORPHAN PROTECTION
  // =========================================================================
  describe('Step 3 & 4: Central Market Contract & Orphan Protection', () => {
    it('All 38 cataloged market patterns have registered contracts', () => {
      const sampleMarketIds = [
        'match_winner',
        'match_winner_super_over',
        'will_there_be_a_tie',
        'double_chance',
        'most_sixes',
        'most_fours',
        'match_total',
        'match_total_alt',
        'total_match_sixes',
        'total_match_fours',
        'total_match_wickets',
        'match_run_range',
        'btts_score_x',
        'team_total',
        'team_total_alt_high',
        'team_total_alt_low',
        'team_total_fours',
        'team_total_sixes',
        'i1_next_over_5_total',
        'i1_overs_0_5_total',
        'current_over_4_odd_even',
        'next_over_5_odd_even',
        'i1_next_delivery_runs_4_2',
        'i1_next_delivery_ou_4_2',
        'i1_next_delivery_boundary_4_2',
        'i1_next_delivery_wicket_4_2',
        'i1_wicket_in_over_4',
        'i1_wicket_in_next_over_5',
        'i1_team_score_at_2_dismissal',
        'i1_method_of_next_wicket_2',
        'player_alt_virat_kohli',
        'player_25_virat_kohli',
        'player_50_virat_kohli',
        'player_100_virat_kohli',
        'top_batter',
        'batter_h2h_runs',
        'batter_h2h_sixes',
        'btts',
        'goals_line',
      ];

      for (const marketId of sampleMarketIds) {
        const contract = resolveMarketContract(marketId);
        assert.ok(contract, `Contract must exist for marketId '${marketId}'`);
        assert.equal(contract.supported, true, `Contract for '${marketId}' must be supported=true`);

        const grader = resolveSettlementGrader(marketId);
        assert.ok(grader, `Settlement grader must be resolved for '${marketId}'`);
      }
    });

    it('Orphan Market Protection: rejects un-contracted or unsupported markets', () => {
      const fakeMarket = { marketId: 'unknown_fake_fantasy_prop' };
      const compat = validateMarketSettlementCompatibility(fakeMarket);
      assert.equal(compat.compatible, false, 'Un-contracted market must be incompatible');
      assert.ok(compat.reason.includes('ORPHAN_MARKET'));
    });
  });

  // =========================================================================
  // STEP 5 & 6: DETERMINISTIC GRADERS FOR EXTENDED PROPOSITIONS
  // =========================================================================
  describe('Step 5 & 6: Deterministic Graders for Extended Proposition Markets', () => {

    it('Most Sixes / Most Fours: correctly grades team boundary lead at match end', () => {
      const match = {
        status: 'COMPLETED',
        matchState: 'POST',
        team1: { name: 'Mumbai', fours: 18, sixes: 10 },
        team2: { name: 'Chennai', fours: 22, sixes: 7 },
      };

      // Most Sixes -> Mumbai won (10 > 7)
      const betSixesT1 = { market_id: 'most_sixes', selection_id: 'sel_sixes_t1', selection_name: 'Mumbai' };
      const resSixesT1 = evaluateMostBoundariesBet(betSixesT1, match);
      assert.equal(resSixesT1.outcome, 'WON');

      const betSixesT2 = { market_id: 'most_sixes', selection_id: 'sel_sixes_t2', selection_name: 'Chennai' };
      const resSixesT2 = evaluateMostBoundariesBet(betSixesT2, match);
      assert.equal(resSixesT2.outcome, 'LOST');

      // Most Fours -> Chennai won (22 > 18)
      const betFoursT1 = { market_id: 'most_fours', selection_id: 'sel_fours_t1', selection_name: 'Mumbai' };
      const resFoursT1 = evaluateMostBoundariesBet(betFoursT1, match);
      assert.equal(resFoursT1.outcome, 'LOST');

      const betFoursT2 = { market_id: 'most_fours', selection_id: 'sel_fours_t2', selection_name: 'Chennai' };
      const resFoursT2 = evaluateMostBoundariesBet(betFoursT2, match);
      assert.equal(resFoursT2.outcome, 'WON');
    });

    it('Match Aggregate: Total Match Sixes / Wickets / Run Range', () => {
      const match = {
        status: 'COMPLETED',
        matchState: 'POST',
        team1: { runs: 185, wickets: 6, sixes: 8, fours: 15 },
        team2: { runs: 186, wickets: 4, sixes: 9, fours: 14 },
      };

      // Total Match Sixes: 8 + 9 = 17. Over 15.5 -> WON
      const betAggSixesOver = { market_id: 'total_match_sixes', selection_id: 'sel_six_over', selection_name: 'Over 15.5' };
      const resAggSixes = evaluateMatchAggregateBet(betAggSixesOver, match);
      assert.equal(resAggSixes.outcome, 'WON');

      // Total Match Wickets: 6 + 4 = 10. Over 11.5 -> LOST
      const betAggWktsOver = { market_id: 'total_match_wickets', selection_id: 'sel_wkt_over', selection_name: 'Over 11.5' };
      const resAggWkts = evaluateMatchAggregateBet(betAggWktsOver, match);
      assert.equal(resAggWkts.outcome, 'LOST');

      // Match Run Range: 185 + 186 = 371. Range 350-399 -> WON
      const betRangeWon = { market_id: 'match_run_range', selection_id: '350_399', selection_name: '350-399 Runs' };
      const resRange = evaluateMatchAggregateBet(betRangeWon, match);
      assert.equal(resRange.outcome, 'WON');
    });

    it('Special Match: Tie, Double Chance, and BTTS 150+', () => {
      const match = {
        status: 'COMPLETED',
        matchState: 'POST',
        winnerSide: 'home',
        team1: { name: 'India', runs: 190 },
        team2: { name: 'Australia', runs: 175 },
      };

      // Will there be a tie? -> No (190 != 175)
      const betTieNo = { market_id: 'will_there_be_a_tie', selection_id: 'sel_tie_no', selection_name: 'No' };
      assert.equal(evaluateSpecialMatchBet(betTieNo, match).outcome, 'WON');

      const betTieYes = { market_id: 'will_there_be_a_tie', selection_id: 'sel_tie_yes', selection_name: 'Yes' };
      assert.equal(evaluateSpecialMatchBet(betTieYes, match).outcome, 'LOST');

      // Double Chance 1X -> WON (India won)
      const betDC1X = { market_id: 'double_chance', selection_id: 'sel_dc_1x', selection_name: 'India or Tie' };
      assert.equal(evaluateSpecialMatchBet(betDC1X, match).outcome, 'WON');

      // BTTS 150+ -> Both 190 >= 150 and 175 >= 150 -> WON
      const betBttsYes = { market_id: 'btts_score_150', selection_id: 'sel_btts_yes', selection_name: 'Yes' };
      assert.equal(evaluateSpecialMatchBet(betBttsYes, match).outcome, 'WON');
    });

    it('Over Odd / Even: correctly evaluates from over snapshots', async () => {
      const match = {
        status: 'LIVE',
        overs: [
          { over: 4, runs: 7 }, // Odd
          { over: 5, runs: 12 }, // Even
        ],
      };

      // Over 4 (7 runs) -> Odd WON, Even LOST
      const betO4Odd = { market_id: 'current_over_4_odd_even', selection_id: 'sel_cov_odd', selection_name: 'Odd' };
      assert.equal((await evaluateOverOddEvenBet(betO4Odd, match)).outcome, 'WON');

      const betO4Even = { market_id: 'current_over_4_odd_even', selection_id: 'sel_cov_even', selection_name: 'Even' };
      assert.equal((await evaluateOverOddEvenBet(betO4Even, match)).outcome, 'LOST');

      // Over 5 (12 runs) -> Even WON, Odd LOST
      const betO5Even = { market_id: 'next_over_5_odd_even', selection_id: 'sel_nov_even', selection_name: 'Even' };
      assert.equal((await evaluateOverOddEvenBet(betO5Even, match)).outcome, 'WON');
    });

    it('Method of Dismissal: grades caught, bowled, lbw, run out', async () => {
      const match = {
        status: 'LIVE',
        liveDetails: { wickets: 2 },
        dismissals: [
          { wicketNumber: 1, type: 'bowled', score: 25 },
          { wicketNumber: 2, type: 'caught', score: 58 },
        ],
      };

      // 2nd Dismissal was Caught
      const betCaught = { market_id: 'i1_method_of_next_wicket_2', selection_id: 'sel_dis_caught', selection_name: 'Caught' };
      const resCaught = await evaluateMethodOfDismissalBet(betCaught, match);
      assert.equal(resCaught.outcome, 'WON');

      const betBowled = { market_id: 'i1_method_of_next_wicket_2', selection_id: 'sel_dis_bowled', selection_name: 'Bowled' };
      const resBowled = await evaluateMethodOfDismissalBet(betBowled, match);
      assert.equal(resBowled.outcome, 'LOST');
    });

    it('Top Batter & Batter H2H: grades player scorecard comparisons', () => {
      const match = {
        status: 'COMPLETED',
        matchState: 'POST',
        team1: {
          name: 'Royal Challengers',
          batters: [
            { name: 'Virat Kohli', runs: 82 },
            { name: 'Faf du Plessis', runs: 55 },
            { name: 'Glenn Maxwell', runs: 24 },
          ],
        },
        batter1: { name: 'Virat Kohli', runs: 82, sixes: 3 },
        batter2: { name: 'Faf du Plessis', runs: 55, sixes: 4 },
      };

      // Top Batter -> Virat Kohli WON
      const betTopVirat = { market_id: 'top_batter', selection_id: 'sel_tb_1', selection_name: 'Virat Kohli' };
      assert.equal(evaluateTopBatterBet(betTopVirat, match).outcome, 'WON');

      const betTopFaf = { market_id: 'top_batter', selection_id: 'sel_tb_2', selection_name: 'Faf du Plessis' };
      assert.equal(evaluateTopBatterBet(betTopFaf, match).outcome, 'LOST');

      // Batter H2H Runs -> Virat (82) > Faf (55) -> Virat WON
      const betH2HRuns = { market_id: 'batter_h2h_runs', selection_id: 'sel_h2h_b1', selection_name: 'Virat Kohli' };
      assert.equal(evaluateBatterH2HBet(betH2HRuns, match).outcome, 'WON');

      // Batter H2H Sixes -> Faf (4) > Virat (3) -> Faf WON
      const betH2HSixes = { market_id: 'batter_h2h_sixes', selection_id: 'sel_h2h_six_b2', selection_name: 'Faf du Plessis' };
      assert.equal(evaluateBatterH2HBet(betH2HSixes, match).outcome, 'WON');
    });

    it('Soccer: BTTS & Total Goals Line', () => {
      const match = {
        status: 'COMPLETED',
        matchState: 'POST',
        score1: 2,
        score2: 1,
      };

      // BTTS (2-1) -> Yes WON
      const betBttsYes = { market_id: 'btts', selection_id: 'BTTS:Yes', selection_name: 'Yes' };
      assert.equal(evaluateSoccerGoalsBet(betBttsYes, match).outcome, 'WON');

      // Goals Line Over 2.5 (3 goals > 2.5) -> WON
      const betGoalsOver = { market_id: 'goals_line', selection_id: 'Goals:Over 2.5', selection_name: 'Over 2.5' };
      assert.equal(evaluateSoccerGoalsBet(betGoalsOver, match).outcome, 'WON');
    });
  });

  // =========================================================================
  // STEP 8: END-TO-END SETTLEMENT INTEGRATION DISPATCH
  // =========================================================================
  describe('Step 8: End-To-End evaluateBetForSettlement Integration', () => {
    it('Seamlessly dispatches all market types through evaluateBetForSettlement()', async () => {
      const match = {
        status: 'COMPLETED',
        matchState: 'POST',
        team1: { name: 'India', runs: 200, fours: 18, sixes: 10 },
        team2: { name: 'England', runs: 160, fours: 12, sixes: 6 },
        liveDetails: {
          firstRuns: 200,
          chaseRuns: 160,
          team1: { fours: 18, sixes: 10 },
          team2: { fours: 12, sixes: 6 },
        },
      };

      const betFours = {
        bet_id: 'bet_e2e_fours',
        market_id: 'team_total_fours',
        selection_id: 'sel_t_four_over',
        selection_name: 'Over 15.5',
      };

      const evalRes = await evaluateBetForSettlement(betFours, match);
      assert.ok(evalRes);
      assert.equal(evalRes.outcome, 'WON');
    });
  });
});
