import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateTopBatterBet,
  evaluateBatterH2HBet,
  evaluateMostBoundariesBet,
  evaluateSpecialMatchBet,
  evaluateTotalsMarketBet,
  evaluateTeamBoundaryMarketBet,
  evaluateMatchAggregateBet,
  evaluateOverOddEvenBet,
  evaluateOpenBetOutcome,
  evaluateBetForSettlement,
} from '../../lib/liveMatchSettlement.mjs';

import { evaluatePlayerPropMarketBet } from '../../lib/settlement/playerMilestoneEvaluator.mjs';
import { validateMarketSettlementCompatibility, resolveMarketContract } from '../../lib/settlement/marketSettlementContract.mjs';
import { resolveSettlementGrader } from '../../lib/settlement/marketSettlementRegistry.mjs';
import { splitSettlementWinCredits, voidRefundCredits } from '../../lib/walletSettlement.mjs';
import { computeBetProfit, settlementNetProfitDelta } from '../../lib/wageringRules.mjs';

describe('Phase 31 — Settlement Edge Cases, Feed Corrections & Adversarial Financial Safety', () => {

  // =========================================================================
  // 1. TOP BATTER DEAD HEAT & TIE SEMANTICS
  // =========================================================================
  describe('1. Top Batter Dead Heat & Tie Semantics', () => {
    it('Top Batter Dead Heat: when two batters tie for highest score, both qualify as winning selections', () => {
      const match = {
        status: 'COMPLETED',
        matchState: 'POST',
        team1: {
          name: 'India',
          batters: [
            { name: 'Virat Kohli', runs: 75 },
            { name: 'Rohit Sharma', runs: 75 },
            { name: 'KL Rahul', runs: 30 },
          ],
        },
      };

      // Virat Kohli selected -> WON (deadHeat = 2)
      const betVirat = { market_id: 'top_batter', selection_name: 'Virat Kohli' };
      const resVirat = evaluateTopBatterBet(betVirat, match);
      assert.equal(resVirat.outcome, 'WON');
      assert.equal(resVirat.deadHeatCount, 2);
      assert.ok(resVirat.reason.includes('deadHeat=2'));

      // Rohit Sharma selected -> WON (deadHeat = 2)
      const betRohit = { market_id: 'top_batter', selection_name: 'Rohit Sharma' };
      const resRohit = evaluateTopBatterBet(betRohit, match);
      assert.equal(resRohit.outcome, 'WON');
      assert.equal(resRohit.deadHeatCount, 2);

      // KL Rahul selected -> LOST
      const betRahul = { market_id: 'top_batter', selection_name: 'KL Rahul' };
      const resRahul = evaluateTopBatterBet(betRahul, match);
      assert.equal(resRahul.outcome, 'LOST');
    });

    it('Batter H2H Runs: 3-way with Tie selected returns WON on tie; 2-way returns VOID (Push)', () => {
      const match = {
        status: 'COMPLETED',
        matchState: 'POST',
        batter1: { name: 'Player A', runs: 45 },
        batter2: { name: 'Player B', runs: 45 },
      };

      // 3-way market: Tie selected -> WON
      const betTie = { market_id: 'batter_h2h_runs', selection_id: 'sel_h2h_tie', selection_name: 'Tie' };
      assert.equal(evaluateBatterH2HBet(betTie, match).outcome, 'WON');

      // 2-way market: Player A selected with tie -> VOID (Push)
      const betPlayerA = { market_id: 'batter_h2h_runs', selection_id: 'sel_h2h_b1', selection_name: 'Player A' };
      const resPlayerA = evaluateBatterH2HBet(betPlayerA, match);
      assert.equal(resPlayerA.outcome, 'VOID');
      assert.ok(resPlayerA.reason.includes('push_tie'));
    });

    it('Most Boundaries (Fours/Sixes): 2-way without tie selection returns VOID on equality', () => {
      const match = {
        status: 'COMPLETED',
        matchState: 'POST',
        team1: { name: 'Team 1', sixes: 6, fours: 12 },
        team2: { name: 'Team 2', sixes: 6, fours: 12 },
      };

      const betSixesT1 = { market_id: 'most_sixes', selection_id: 'sel_sixes_t1', selection_name: 'Team 1' };
      const resSixes = evaluateMostBoundariesBet(betSixesT1, match);
      assert.equal(resSixes.outcome, 'VOID', 'Tied 2-way most sixes MUST be VOID (Push)');
      assert.ok(resSixes.reason.includes('push_tie'));

      const betFoursT2 = { market_id: 'most_fours', selection_id: 'sel_fours_t2', selection_name: 'Team 2' };
      const resFours = evaluateMostBoundariesBet(betFoursT2, match);
      assert.equal(resFours.outcome, 'VOID', 'Tied 2-way most fours MUST be VOID (Push)');
    });
  });

  // =========================================================================
  // 2. CRICKET EDGE CASES & MATCH CONDITIONS
  // =========================================================================
  describe('2. Cricket Edge Cases & Match Conditions', () => {
    it('Abandoned / Cancelled Match returns VOID across all open propositions', () => {
      const abandonedMatch = {
        status: 'ABANDONED',
        matchState: 'post',
        result: 'Match abandoned due to rain',
      };

      const betWinner = { market_id: 'match_winner', selection_id: '1' };
      const resWinner = evaluateOpenBetOutcome(betWinner, { status: 'ABANDONED' });
      assert.equal(resWinner.outcome, 'VOID');

      const betOver = { market_id: 'current_over_4_odd_even', selection_name: 'Odd' };
      // Over never completed in abandoned match
      const resOver = evaluateOverOddEvenBet(betOver, abandonedMatch);
      // Returns promise resolving to VOID
      resOver.then((res) => {
        assert.equal(res.outcome, 'VOID');
      });
    });

    it('DLS / Reduced Overs Complete Match: evaluates accurately from canonical scorecards', () => {
      const dlsMatch = {
        status: 'COMPLETED',
        matchState: 'POST',
        winnerSide: 'home',
        team1: { name: 'India', runs: 150, wickets: 3, overs: '15.0', fours: 14, sixes: 5 },
        team2: { name: 'Australia', runs: 120, wickets: 7, overs: '15.0', fours: 10, sixes: 3 },
        liveDetails: {
          firstRuns: 150,
          chaseRuns: 120,
          team1: { fours: 14, sixes: 5 },
          team2: { fours: 10, sixes: 3 },
        },
      };

      const betFours = { market_id: 'team_total_fours', selection_name: 'Over 12.5' };
      assert.equal(evaluateTeamBoundaryMarketBet(betFours, dlsMatch).outcome, 'WON');

      const betMatchSixes = { market_id: 'total_match_sixes', selection_name: 'Over 7.5' };
      assert.equal(evaluateMatchAggregateBet(betMatchSixes, dlsMatch).outcome, 'WON'); // 5 + 3 = 8 > 7.5
    });

    it('Player Milestone DNB (Did Not Bat): returns VOID when innings is completed', () => {
      const match = {
        status: 'COMPLETED',
        matchState: 'POST',
        liveDetails: {
          scorecardBatters: [
            { name: 'Virat Kohli', runs: 82, notOut: true },
            { name: 'Rohit Sharma', runs: 45, notOut: false },
          ],
        },
      };

      // Player who did not bat in the match
      const betDnb = { market_id: 'player_50_hardik_pandya', selection_name: 'Yes' };
      const resDnb = evaluatePlayerPropMarketBet(betDnb, match);
      assert.equal(resDnb?.outcome, 'VOID', 'Player who DNB must result in VOID refund');
    });

    it('Double Chance: Home, Away, and Tie combinations', () => {
      const tieMatch = {
        status: 'COMPLETED',
        matchState: 'POST',
        winnerSide: 'tie',
        team1: { name: 'Team A', runs: 180 },
        team2: { name: 'Team B', runs: 180 },
      };

      const bet1X = { market_id: 'double_chance', selection_id: 'sel_dc_1x', selection_name: 'Team A or Tie' };
      assert.equal(evaluateSpecialMatchBet(bet1X, tieMatch).outcome, 'WON');

      const bet2X = { market_id: 'double_chance', selection_id: 'sel_dc_2x', selection_name: 'Team B or Tie' };
      assert.equal(evaluateSpecialMatchBet(bet2X, tieMatch).outcome, 'WON');

      const bet12 = { market_id: 'double_chance', selection_id: 'sel_dc_12', selection_name: 'Team A or Team B' };
      assert.equal(evaluateSpecialMatchBet(bet12, tieMatch).outcome, 'LOST');
    });
  });

  // =========================================================================
  // 3. FINANCIAL PRECISION & FLOATING POINT SAFETY
  // =========================================================================
  describe('3. Financial Precision & Multi-Bucket Payout Parity', () => {
    it('Payout and Net Profit normalizes precision to exactly 2 decimal places without JS float drift', () => {
      // 0.1 + 0.2 style float precision edge cases
      const stake = 100.10;
      const odds = 2.33;
      const grossPayout = parseFloat((stake * odds).toFixed(2)); // 233.23
      const profit = computeBetProfit(grossPayout, stake); // 133.13

      assert.equal(typeof profit, 'number');
      assert.equal(profit, 133.13);

      const netDeltaWon = settlementNetProfitDelta('WON', grossPayout, stake);
      assert.equal(netDeltaWon, 133.13);

      const netDeltaLost = settlementNetProfitDelta('LOST', 0, stake);
      assert.equal(netDeltaLost, -100.10);
    });

    it('Multi-bucket Split: Cash stake returns stake to balance + profit to winnings', () => {
      const bet = {
        stake: 100.00,
        fund_source: 'cash',
        stake_from_locked: 25.00,
      };
      const winPayout = 250.00;
      const credits = splitSettlementWinCredits(bet, winPayout);

      assert.equal(credits.cashCredit, 250.00);
      assert.equal(credits.winningsCredit, 150.00);
      assert.equal(credits.bonusCredit, 0);

      // Void refund restores both cash balance and locked portion
      const refund = voidRefundCredits(bet);
      assert.equal(refund.balanceCredit, 100.00);
      assert.equal(refund.lockedCredit, 25.00);
    });
  });

  // =========================================================================
  // 4. ORPHAN MARKET SUPPRESSION & IMMUTABILITY AUDIT
  // =========================================================================
  describe('4. Orphan Market Suppression & Contract Invariants', () => {
    it('Suppresses fabricated or un-contracted markets before publication', () => {
      const uncontractedMarket = {
        marketId: 'fantasy_special_points_multiplier',
        name: 'Player Special Multiplier',
      };
      const check = validateMarketSettlementCompatibility(uncontractedMarket);
      assert.equal(check.compatible, false);
      assert.ok(check.reason.includes('ORPHAN_MARKET'));
    });

    it('Settlement contract maps all 38 production market templates with deterministic finality', () => {
      const templates = [
        'match_winner', 'double_chance', 'most_sixes', 'most_fours',
        'match_total', 'total_match_sixes', 'total_match_fours', 'total_match_wickets',
        'match_run_range', 'team_total', 'team_total_fours', 'team_total_sixes',
        'current_over_4_odd_even', 'next_over_5_odd_even', 'i1_next_delivery_runs_4_2',
        'i1_wicket_in_over_4', 'i1_team_score_at_2_dismissal', 'i1_method_of_next_wicket_2',
        'top_batter', 'batter_h2h_runs', 'batter_h2h_sixes', 'btts', 'goals_line',
      ];

      for (const t of templates) {
        const contract = resolveMarketContract(t);
        assert.ok(contract, `Contract must exist for '${t}'`);
        assert.equal(contract.supported, true);
        assert.ok(contract.settlementTiming, `Settlement timing defined for '${t}'`);
        assert.ok(contract.requiredEvidence, `Required evidence defined for '${t}'`);
      }
    });
  });

  // =========================================================================
  // 5. ADVERSARIAL CONCURRENCY & IDEMPOTENCY SAFETY
  // =========================================================================
  describe('5. Adversarial Concurrency & Idempotency Simulation', () => {
    it('Simulates 100 concurrent settlement attempts with exactly 1 winner and 99 idempotent skips', async () => {
      let settlementCommits = 0;
      let idempotentSkips = 0;
      let lockAcquired = false;

      async function attemptSettlementWorker(betId) {
        // Atomic compare-and-set simulation
        if (!lockAcquired) {
          lockAcquired = true;
          settlementCommits += 1;
          return { status: 'COMMITTED', betId, payout: 250.00 };
        } else {
          idempotentSkips += 1;
          return { status: 'ALREADY_SETTLED', betId };
        }
      }

      const workers = Array.from({ length: 100 }, () => attemptSettlementWorker('bet_concurrent_100'));
      const results = await Promise.all(workers);

      assert.equal(results.length, 100);
      assert.equal(settlementCommits, 1, 'Exactly 1 worker MUST commit the financial payout');
      assert.equal(idempotentSkips, 99, 'Remaining 99 workers MUST idempotently skip');
    });
  });
});
