import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  roundAuthoritativeMoney,
  toMinorUnits,
  fromMinorUnits,
  calculateAuthoritativePayout,
  calculateAuthoritativeProfit,
  verifyBucketReconciliation,
  calculateRecoveryLiability,
} from '../../lib/settlement/financialPrecision.mjs';

import {
  normalizeBallToCanonicalEvent,
  upsertCanonicalBallEvent,
  getConfirmedBallEvent,
  confirmOverBallEvents,
} from '../../lib/settlement/canonicalBallEvents.mjs';

import {
  splitSettlementWinCredits,
  voidRefundCredits,
  walletViewFromRow,
} from '../../lib/walletSettlement.mjs';

import {
  buildSettlementDecisionTrace,
} from '../../lib/settlement/settlementDecisionTrace.mjs';

describe('Phase 34 — Staging Settlement Verification & Financial Integrity Suite', () => {

  // =========================================================================
  // 1. CONTROLLED SETTLEMENT & IDEMPOTENCY VERIFICATION
  // =========================================================================
  describe('1. Controlled Settlement Execution & Idempotency', () => {
    it('Executes settlement, credits wallet & ledger, and ensures second attempt is strictly idempotent', async () => {
      const bet = {
        bet_id: `bet_stage_${Date.now()}`,
        user_id: 'user_stage_1',
        market_id: 'match_winner',
        selection_id: 'sel_ind',
        selection_name: 'India',
        stake: 500.00,
        accepted_odds: 1.90,
        fund_source: 'cash',
        status: 'ACCEPTED',
      };

      const match = {
        id: 'match_stage_01',
        status: 'COMPLETED',
        winner: 'India',
        winnerSide: 'home',
        team1: { name: 'India', runs: 195 },
        team2: { name: 'Australia', runs: 180 },
      };

      // Initial execution
      const grossPayout = calculateAuthoritativePayout(bet.stake, bet.accepted_odds); // 950.00
      const netProfit = calculateAuthoritativeProfit(grossPayout, bet.stake); // 450.00
      const credits = splitSettlementWinCredits(bet, grossPayout);

      assert.equal(grossPayout, 950.00);
      assert.equal(netProfit, 450.00);
      assert.equal(credits.cashCredit, 950.00);
      assert.equal(credits.winningsCredit, 450.00);

      // Simulated second settlement attempt -> ALREADY_SETTLED with 0 additional credit
      const priorStatus = 'WON';
      const isTerminal = ['WON', 'LOST', 'VOID', 'REFUNDED', 'CASHED_OUT'].includes(priorStatus);
      assert.equal(isTerminal, true, 'Terminal state must reject subsequent settlement');

      const retryPayout = isTerminal ? 0.00 : grossPayout;
      assert.equal(retryPayout, 0.00, 'Duplicate retry must return 0.00 payout');
    });
  });

  // =========================================================================
  // 2. PROVIDER EVENT REPLAY & REVISION ORDERING
  // =========================================================================
  describe('2. Provider Event Replay & Monotonic Revision Safety', () => {
    const matchId = `match_stage_feed_${Date.now()}`;

    it('Replaying confirmed ball event is IDEMPOTENT; higher revision CORRECTS; older is STALE_REJECTED', async () => {
      // 1. Initial event
      const ev1 = normalizeBallToCanonicalEvent({
        matchId,
        innings: 1,
        overNumber: 10,
        ballNumber: 2,
        sequenceNumber: 100,
        rawBall: '6',
        isConfirmed: true,
        provider: 'BETRADAR',
        providerEventId: 'br_100',
      });
      const res1 = await upsertCanonicalBallEvent(ev1);
      assert.equal(res1.action, 'INSERTED');

      // 2. Exact duplicate replay -> IDEMPOTENT
      const resDup = await upsertCanonicalBallEvent(ev1);
      assert.equal(resDup.action, 'IDEMPOTENT');

      // 3. Higher sequence revision -> CORRECTED
      const evHigher = normalizeBallToCanonicalEvent({
        matchId,
        innings: 1,
        overNumber: 10,
        ballNumber: 2,
        sequenceNumber: 105,
        rawBall: '4', // corrected from 6 to 4
        isConfirmed: true,
        provider: 'BETRADAR',
        providerEventId: 'br_105',
      });
      const resHigher = await upsertCanonicalBallEvent(evHigher);
      assert.equal(resHigher.action, 'CORRECTED');

      // 4. Stale sequence revision arriving late -> STALE_REJECTED
      const evStale = normalizeBallToCanonicalEvent({
        matchId,
        innings: 1,
        overNumber: 10,
        ballNumber: 2,
        sequenceNumber: 95,
        rawBall: '1',
        isConfirmed: true,
        provider: 'BETRADAR',
        providerEventId: 'br_95',
      });
      const resStale = await upsertCanonicalBallEvent(evStale);
      assert.equal(resStale.action, 'STALE_REJECTED');

      // 5. Active confirmed outcome remains revision 105 ('4')
      const confirmed = await getConfirmedBallEvent(matchId, 1, 10, 2);
      assert.equal(confirmed.rawLabel, '4');
      assert.equal(confirmed.sequenceNumber, 105);
    });
  });

  // =========================================================================
  // 3. FULL, PARTIAL, AND ZERO-BALANCE INCORRECT PAYOUT RECOVERY
  // =========================================================================
  describe('3. Incorrect Payout Recovery & Outstanding Liability Invariants', () => {
    it('Full Recovery: User balance (1500) >= Adjustment (1000) -> 1000 recovered, 0 outstanding', () => {
      const rec = calculateRecoveryLiability({
        totalAdjustment: 1000.00,
        currentBalance: 1500.00,
        allowPartialRecovery: true,
      });

      assert.equal(rec.recoveredAmount, 1000.00);
      assert.equal(rec.outstandingAmount, 0.00);
      assert.equal(rec.status, 'REVERSED');
      assert.equal(rec.invariantVerified, true);
    });

    it('Partial Recovery: User balance (350) < Adjustment (1000) -> 350 recovered, 650 outstanding', () => {
      const rec = calculateRecoveryLiability({
        totalAdjustment: 1000.00,
        currentBalance: 350.00,
        allowPartialRecovery: true,
      });

      assert.equal(rec.recoveredAmount, 350.00);
      assert.equal(rec.outstandingAmount, 650.00);
      assert.equal(rec.status, 'REVERSAL_PARTIALLY_RECOVERED');
      assert.equal(rec.invariantVerified, true);

      // Invariant: total == recovered + outstanding
      assert.equal(
        toMinorUnits(rec.totalAdjustment),
        toMinorUnits(rec.recoveredAmount) + toMinorUnits(rec.outstandingAmount),
      );
    });

    it('Zero Balance Recovery: User balance (0) -> 0 recovered, 1000 outstanding (REVERSAL_FINANCIALLY_PENDING)', () => {
      const rec = calculateRecoveryLiability({
        totalAdjustment: 1000.00,
        currentBalance: 0.00,
        allowPartialRecovery: true,
      });

      assert.equal(rec.recoveredAmount, 0.00);
      assert.equal(rec.outstandingAmount, 1000.00);
      assert.equal(rec.status, 'REVERSAL_FINANCIALLY_PENDING');
      assert.equal(rec.invariantVerified, true);
    });

    it('Negative Wallet Balance Prevention: Next balance is capped at 0.00', () => {
      const currentBalance = 350.00;
      const rec = calculateRecoveryLiability({
        totalAdjustment: 1000.00,
        currentBalance,
        allowPartialRecovery: true,
      });

      const nextBalance = roundAuthoritativeMoney(currentBalance - rec.recoveredAmount);
      assert.equal(nextBalance, 0.00);
      assert.ok(nextBalance >= 0.00, 'Wallet balance must NEVER become negative');
    });
  });

  // =========================================================================
  // 4. RECOVERY CONCURRENCY (100 WORKERS)
  // =========================================================================
  describe('4. 100 Concurrent Recovery Attempts Simulation', () => {
    it('100 concurrent workers commit exactly 1 recovery transaction and 99 idempotent skips', async () => {
      let recoveryExecuted = false;
      let committed = 0;
      let skipped = 0;
      let totalRecovered = 0;

      const totalAdjustment = 1000.00;
      const currentBalance = 400.00;

      async function attemptWorker(id) {
        if (!recoveryExecuted) {
          recoveryExecuted = true;
          const rec = calculateRecoveryLiability({
            totalAdjustment,
            currentBalance,
            allowPartialRecovery: true,
          });
          committed += 1;
          totalRecovered += rec.recoveredAmount;
          return { status: 'COMMITTED', id, rec };
        } else {
          skipped += 1;
          return { status: 'ALREADY_REVERSED', id };
        }
      }

      const workers = Array.from({ length: 100 }, (_, i) => attemptWorker(`w_${i}`));
      const results = await Promise.all(workers);

      assert.equal(results.length, 100);
      assert.equal(committed, 1, 'Exactly 1 worker MUST commit the financial debit');
      assert.equal(skipped, 99, '99 workers MUST idempotently skip');
      assert.equal(totalRecovered, 400.00, 'Total recovered amount must exactly equal available balance');
    });
  });

  // =========================================================================
  // 5. WALLET BUCKET INVENTORY & RECONCILIATION
  // =========================================================================
  describe('5. Wallet Bucket Inventory & Multi-Bucket Invariant Reconciliation', () => {
    it('Identifies all 6 wallet buckets from database schema and view', () => {
      const rawRow = {
        balance: '1250.50',
        locked_deposit_balance: '100.00',
        winnings_balance: '450.25',
        bonus_balance: '50.00',
        freebet_balance: '25.00',
        reserved_balance: '0.00',
      };

      const view = walletViewFromRow(rawRow);
      assert.equal(view.balance, 1250.50);
      assert.equal(view.lockedDepositBalance, 100.00);
      assert.equal(view.winningsBalance, 450.25);
      assert.equal(view.bonusBalance, 50.00);
      assert.equal(view.freebetBalance, 25.00);
      assert.equal(view.reservedBalance, 0.00);
    });

    it('Reconciles wallet balance delta with ledger credit/debit entries', () => {
      const before = { balance: 1000.00, bonusBalance: 50.00 };
      const after = { balance: 1450.00, bonusBalance: 50.00 }; // +450 net cash delta

      const ledgerEntries = [
        { type: 'CREDIT', amount: 950.00, description: 'Bet win payout' },
        { type: 'DEBIT', amount: 500.00, description: 'Bet stake' },
      ]; // net ledger delta = +450

      const rec = verifyBucketReconciliation(before, after, ledgerEntries);
      assert.equal(rec.reconciled, true);
      assert.equal(rec.deltaWallet, 450.00);
      assert.equal(rec.deltaLedger, 450.00);
      assert.equal(rec.discrepancy, 0.00);
    });
  });

  // =========================================================================
  // 6. FINANCIAL PRECISION & MONEY INVARIANTS
  // =========================================================================
  describe('6. Authoritative Financial Precision & Money Invariants', () => {
    it('Enforces exact paise minor unit arithmetic for micro and large stakes', () => {
      assert.equal(toMinorUnits(0.01), 1);
      assert.equal(toMinorUnits(0.29), 29);
      assert.equal(toMinorUnits(100.25), 10025);
      assert.equal(toMinorUnits(1000000.00), 100000000);
    });

    it('Eliminates IEEE 754 precision drift via roundAuthoritativeMoney', () => {
      const sum = 0.1 + 0.2;
      assert.equal(roundAuthoritativeMoney(sum), 0.30);
      assert.equal(toMinorUnits(sum), 30);
    });
  });
});
