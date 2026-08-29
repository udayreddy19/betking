import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  roundAuthoritativeMoney,
  toMinorUnits,
  fromMinorUnits,
  calculateAuthoritativePayout,
  calculateAuthoritativeProfit,
  verifyBucketReconciliation,
} from '../../lib/settlement/financialPrecision.mjs';

import {
  normalizeBallToCanonicalEvent,
  upsertCanonicalBallEvent,
  getConfirmedBallEvent,
  confirmOverBallEvents,
} from '../../lib/settlement/canonicalBallEvents.mjs';

import {
  buildSettlementDecisionTrace,
  formatDecisionTraceSummary,
} from '../../lib/settlement/settlementDecisionTrace.mjs';

import {
  evaluateTopBatterBet,
  evaluateBatterH2HBet,
  evaluateMostBoundariesBet,
} from '../../lib/liveMatchSettlement.mjs';

describe('Phase 32 — Financial Precision, Finality & Provider Correction Hardening Suite', () => {

  // =========================================================================
  // 1. AUTHORITATIVE MONEY PRECISION & BOUNDARY ROUNDING
  // =========================================================================
  describe('1. Authoritative Money Precision & Rounding Policy', () => {
    it('0.1 + 0.2 precision drift is eliminated in authoritative money operations', () => {
      const a = 0.1;
      const b = 0.2;
      assert.notEqual(a + b, 0.3); // Demonstrating standard IEEE 754 drift
      const exactSum = roundAuthoritativeMoney(a + b);
      assert.equal(exactSum, 0.3);
      assert.equal(toMinorUnits(a + b), 30);
    });

    it('Half-up rounding boundary at .005: 1.005 rounds to 1.01 and 1.004 rounds to 1.00', () => {
      assert.equal(roundAuthoritativeMoney(1.005), 1.01);
      assert.equal(roundAuthoritativeMoney(1.004), 1.00);
      assert.equal(roundAuthoritativeMoney(233.225), 233.23);
      assert.equal(roundAuthoritativeMoney(233.224), 233.22);
    });

    it('Repeating decimal odds produce deterministic, exact payouts', () => {
      const stake = 100.00;
      const repeatingOdds = 10 / 3; // 3.3333333333333335
      const payout = calculateAuthoritativePayout(stake, repeatingOdds);
      assert.equal(payout, 333.33);

      const profit = calculateAuthoritativeProfit(payout, stake);
      assert.equal(profit, 233.33);
    });

    it('Micro-stake (₹0.01) and VIP mega-stake (₹1,000,000.00) calculations remain exact', () => {
      const microStake = 0.01;
      const microOdds = 2.50;
      const microPayout = calculateAuthoritativePayout(microStake, microOdds);
      assert.equal(microPayout, 0.03); // 0.025 rounds to 0.03

      const vipStake = 1000000.00;
      const vipOdds = 1.95;
      const vipPayout = calculateAuthoritativePayout(vipStake, vipOdds, 5); // 5% boost
      assert.equal(vipPayout, 2047500.00);
    });
  });

  // =========================================================================
  // 2. DELIVERY / BALL FINALITY & SAFE PROVISIONAL BARRIER
  // =========================================================================
  describe('2. Delivery / Ball Finality & Provisional Barrier', () => {
    const matchId = `match_fin_${Date.now()}`;

    it('Provisional unconfirmed ball cannot be fetched by getConfirmedBallEvent', async () => {
      const unconfirmedEvent = normalizeBallToCanonicalEvent({
        matchId,
        innings: 1,
        overNumber: 12,
        ballNumber: 3,
        sequenceNumber: 101,
        rawBall: '4',
        isConfirmed: false,
      });

      await upsertCanonicalBallEvent(unconfirmedEvent);

      const confirmed = await getConfirmedBallEvent(matchId, 1, 12, 3);
      assert.equal(confirmed, null, 'Unconfirmed provisional delivery MUST NOT be returned for settlement');
    });

    it('confirmOverBallEvents promotes deliveries in completed over to confirmed state', async () => {
      const confirmedCount = await confirmOverBallEvents(matchId, 1, 12);
      assert.ok(confirmedCount >= 1);

      const confirmed = await getConfirmedBallEvent(matchId, 1, 12, 3);
      assert.ok(confirmed);
      assert.equal(confirmed.rawLabel, '4');
      assert.equal(confirmed.isConfirmed, true);
    });
  });

  // =========================================================================
  // 3. PROVIDER REVISIONS & EVENT ORDERING
  // =========================================================================
  describe('3. Provider Revision Handling & Ordering Safety', () => {
    const matchId = `match_rev_${Date.now()}`;

    it('Higher sequence revision updates ball outcome and marks previous superseded', async () => {
      const initialBall = normalizeBallToCanonicalEvent({
        matchId,
        innings: 1,
        overNumber: 5,
        ballNumber: 1,
        sequenceNumber: 10,
        rawBall: '4',
        isConfirmed: true,
      });
      const res1 = await upsertCanonicalBallEvent(initialBall);
      assert.equal(res1.action, 'INSERTED');

      // Provider issues revision: 4 runs changed to Wicket
      const revisedBall = normalizeBallToCanonicalEvent({
        matchId,
        innings: 1,
        overNumber: 5,
        ballNumber: 1,
        sequenceNumber: 15, // Higher sequence
        rawBall: 'W',
        isConfirmed: true,
      });
      const res2 = await upsertCanonicalBallEvent(revisedBall);
      assert.equal(res2.action, 'CORRECTED');

      const confirmed = await getConfirmedBallEvent(matchId, 1, 5, 1);
      assert.equal(confirmed.rawLabel, 'W');
      assert.equal(confirmed.parsed.kind, 'wicket');
    });

    it('Older sequence revision arriving late is safely rejected (STALE_REJECTED)', async () => {
      const staleBall = normalizeBallToCanonicalEvent({
        matchId,
        innings: 1,
        overNumber: 5,
        ballNumber: 1,
        sequenceNumber: 8, // Lower sequence than current (15)
        rawBall: '0',
        isConfirmed: true,
      });

      const resStale = await upsertCanonicalBallEvent(staleBall);
      assert.equal(resStale.action, 'STALE_REJECTED');

      // Canonical event state remains the latest revision ('W')
      const confirmed = await getConfirmedBallEvent(matchId, 1, 5, 1);
      assert.equal(confirmed.rawLabel, 'W');
    });
  });

  // =========================================================================
  // 4. BUCKET-LEVEL WALLET & LEDGER RECONCILIATION
  // =========================================================================
  describe('4. Bucket-Level Wallet & Ledger Invariant Reconciliation', () => {
    it('Accurately reconciles wallet balance changes against matching ledger credits and debits', () => {
      const beforeWallet = { balance: 500.00, bonusBalance: 50.00 };
      const afterWallet = { balance: 650.00, bonusBalance: 50.00 }; // +150 cash delta

      const ledgerEntries = [
        { type: 'CREDIT', amount: 250.00, description: 'Bet payout' },
        { type: 'DEBIT', amount: 100.00, description: 'Bet stake' },
      ]; // Net ledger delta = +150.00

      const rec = verifyBucketReconciliation(beforeWallet, afterWallet, ledgerEntries);
      assert.equal(rec.reconciled, true);
      assert.equal(rec.deltaWallet, 150.00);
      assert.equal(rec.deltaLedger, 150.00);
      assert.equal(rec.discrepancy, 0.00);
    });

    it('Detects un-journaled wallet discrepancies and flags reconciliation mismatch', () => {
      const beforeWallet = { balance: 500.00, bonusBalance: 0.00 };
      const afterWallet = { balance: 700.00, bonusBalance: 0.00 }; // +200 wallet delta

      const ledgerEntries = [
        { type: 'CREDIT', amount: 150.00, description: 'Incomplete ledger entry' },
      ]; // Net ledger delta = +150

      const rec = verifyBucketReconciliation(beforeWallet, afterWallet, ledgerEntries);
      assert.equal(rec.reconciled, false);
      assert.equal(rec.discrepancy, 50.00);
    });
  });

  // =========================================================================
  // 5. SETTLEMENT DECISION TRACE & EXPLAINABILITY
  // =========================================================================
  describe('5. Per-Bet Settlement Decision Trace & Forensic Explainability', () => {
    it('Generates a complete, un-fabricated decision trace with placement snapshot and evidence', () => {
      const bet = {
        bet_id: 'bet_trace_123',
        user_id: 'user_456',
        market_id: 'top_batter',
        selection_id: 'sel_vk',
        selection_name: 'Virat Kohli',
        stake: 200.00,
        accepted_odds: 2.75,
        fund_source: 'cash',
      };

      const match = {
        id: 'match_ind_aus',
        status: 'COMPLETED',
        team1: { name: 'India', runs: 185, batters: [{ name: 'Virat Kohli', runs: 85 }] },
        team2: { name: 'Australia', runs: 170 },
      };

      const evaluatedLeg = {
        outcome: 'WON',
        reason: 'top_batter_Virat Kohli_runs=85',
        deadHeatCount: 1,
      };

      const financialResult = {
        payout: 550.00,
        cashCredit: 550.00,
        winningsCredit: 350.00,
      };

      const trace = buildSettlementDecisionTrace({ bet, match, evaluatedLeg, financialResult });

      assert.ok(trace.traceId.startsWith('trc_bet_trace_123'));
      assert.equal(trace.bet.betId, 'bet_trace_123');
      assert.equal(trace.contract.settlementTiming, 'INNINGS_COMPLETE');
      assert.equal(trace.ruleEvaluation.outcome, 'WON');
      assert.equal(trace.financialExecution.grossPayout, 550.00);
      assert.equal(trace.financialExecution.netProfit, 350.00);

      const summary = formatDecisionTraceSummary(trace);
      assert.ok(summary.includes('Virat Kohli'));
      assert.ok(summary.includes('Gross Payout ₹550.00'));
    });
  });

  // =========================================================================
  // 6. DEAD HEAT & COMMERCIAL RULE SPECIFICATION
  // =========================================================================
  describe('6. Commercial Dead Heat & Tie Specification Verification', () => {
    it('Top Batter dead heat notes deadHeatCount > 1 for commercial rule transparency', () => {
      const match = {
        status: 'COMPLETED',
        team1: {
          name: 'India',
          batters: [
            { name: 'Player A', runs: 60 },
            { name: 'Player B', runs: 60 },
          ],
        },
      };

      const betA = { market_id: 'top_batter', selection_name: 'Player A' };
      const resA = evaluateTopBatterBet(betA, match);
      assert.equal(resA.outcome, 'WON');
      assert.equal(resA.deadHeatCount, 2);
    });

    it('2-way H2H on tie evaluates to VOID (Push) for commercial fairness', () => {
      const match = {
        status: 'COMPLETED',
        batter1: { name: 'Player 1', runs: 40 },
        batter2: { name: 'Player 2', runs: 40 },
      };

      const bet2Way = { market_id: 'batter_h2h_runs', selection_id: 'sel_b1', selection_name: 'Player 1' };
      const res = evaluateBatterH2HBet(bet2Way, match);
      assert.equal(res.outcome, 'VOID');
      assert.ok(res.reason.includes('push'));
    });
  });
});
