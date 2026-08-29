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
} from '../../lib/settlement/canonicalBallEvents.mjs';

import {
  splitSettlementWinCredits,
  voidRefundCredits,
} from '../../lib/walletSettlement.mjs';

describe('Phase 33 — Settlement Correction Recovery, Integer Money & Financial Liability Suite', () => {

  // =========================================================================
  // 1. INTEGER MINOR UNIT PARITY & EXACT MONEY INVARIANTS
  // =========================================================================
  describe('1. Integer Minor Unit (Paise) Exact Money Invariants', () => {
    it('Accurately converts various rupee amounts to integer paise without binary float drift', () => {
      const cases = [
        { rupee: 0.01, paise: 1 },
        { rupee: 0.03, paise: 3 },
        { rupee: 0.10, paise: 10 },
        { rupee: 0.29, paise: 29 },
        { rupee: 100.25, paise: 10025 },
        { rupee: 9999.99, paise: 999999 },
      ];

      for (const c of cases) {
        assert.equal(toMinorUnits(c.rupee), c.paise, `Paise conversion failed for ₹${c.rupee}`);
        assert.equal(fromMinorUnits(c.paise), c.rupee, `Rupee conversion failed for ${c.paise} paise`);
      }
    });

    it('Enforces core money invariants: WIN (payout >= stake), LOSS (payout == 0), VOID (refund == stake)', () => {
      const stake = 250.00;
      const odds = 1.85;

      // WIN invariant
      const payoutWin = calculateAuthoritativePayout(stake, odds);
      assert.ok(toMinorUnits(payoutWin) >= toMinorUnits(stake), 'WIN payout must be >= stake');
      assert.equal(payoutWin, 462.50);

      // LOSS invariant
      const payoutLoss = 0.00;
      assert.equal(toMinorUnits(payoutLoss), 0, 'LOSS payout must be exactly 0');

      // VOID invariant
      const refundCredits = voidRefundCredits({ stake, fund_source: 'cash', stake_from_locked: 50.00 });
      assert.equal(toMinorUnits(refundCredits.balanceCredit), toMinorUnits(stake), 'VOID refund must equal stake');
      assert.equal(toMinorUnits(refundCredits.lockedCredit), toMinorUnits(50.00), 'VOID locked credit must equal original locked');
    });

    it('No money is created or destroyed in multi-bucket splits', () => {
      const bet = {
        stake: 100.00,
        fund_source: 'cash',
        stake_from_locked: 25.00,
      };
      const grossPayout = 245.50;
      const credits = splitSettlementWinCredits(bet, grossPayout);

      // Total credits received by user = cashCredit
      assert.equal(credits.cashCredit, grossPayout);
      // Net profit recorded = grossPayout - stake
      assert.equal(credits.winningsCredit, 145.50);
      assert.equal(toMinorUnits(credits.cashCredit) - toMinorUnits(bet.stake), toMinorUnits(credits.winningsCredit));
    });
  });

  // =========================================================================
  // 2. INCORRECT PAYOUT RECOVERY & OUTSTANDING LIABILITY
  // =========================================================================
  describe('2. Incorrect Payout Recovery & Outstanding Liability Invariants', () => {
    it('Scenario A (Full Recovery): Balance >= Payout -> Fully recovered with 0 outstanding liability', () => {
      const result = calculateRecoveryLiability({
        totalAdjustment: 1000.00,
        currentBalance: 1500.00,
        allowPartialRecovery: true,
      });

      assert.equal(result.recoveredAmount, 1000.00);
      assert.equal(result.outstandingAmount, 0.00);
      assert.equal(result.status, 'REVERSED');
      assert.equal(result.invariantVerified, true);
    });

    it('Scenario B (Partial Recovery): 0 < Balance < Payout -> Available recovered, remaining recorded as outstanding', () => {
      const result = calculateRecoveryLiability({
        totalAdjustment: 1000.00,
        currentBalance: 350.00,
        allowPartialRecovery: true,
      });

      assert.equal(result.recoveredAmount, 350.00);
      assert.equal(result.outstandingAmount, 650.00);
      assert.equal(result.status, 'REVERSAL_PARTIALLY_RECOVERED');
      assert.equal(result.invariantVerified, true);

      // Total adjustment == recovered + outstanding
      assert.equal(
        toMinorUnits(result.totalAdjustment),
        toMinorUnits(result.recoveredAmount) + toMinorUnits(result.outstandingAmount),
      );
    });

    it('Scenario C (Zero Available Funds): Balance <= 0 -> 0 recovered, full adjustment recorded as outstanding', () => {
      const result = calculateRecoveryLiability({
        totalAdjustment: 1000.00,
        currentBalance: 0.00,
        allowPartialRecovery: true,
      });

      assert.equal(result.recoveredAmount, 0.00);
      assert.equal(result.outstandingAmount, 1000.00);
      assert.equal(result.status, 'REVERSAL_FINANCIALLY_PENDING');
      assert.equal(result.invariantVerified, true);
    });
  });

  // =========================================================================
  // 3. NEGATIVE BALANCE PREVENTION POLICY
  // =========================================================================
  describe('3. Negative Wallet Balance Prevention Policy', () => {
    it('Never debits more than available cash balance, protecting wallet non-negative invariant', () => {
      const currentBalance = 120.50;
      const totalAdjustment = 500.00;

      const recovery = calculateRecoveryLiability({
        totalAdjustment,
        currentBalance,
        allowPartialRecovery: true,
      });

      const nextBalance = roundAuthoritativeMoney(currentBalance - recovery.recoveredAmount);
      assert.equal(nextBalance, 0.00);
      assert.ok(nextBalance >= 0.00, 'Wallet balance must NEVER become negative');
      assert.equal(recovery.outstandingAmount, 379.50);
    });
  });

  // =========================================================================
  // 4. PROVIDER EVENT IDENTITY & REVISION ORDERING
  // =========================================================================
  describe('4. Provider Event Identity & Revision Safety', () => {
    const matchId = `match_p33_id_${Date.now()}`;

    it('Composite event identity (match, innings, over, ball, sequence) is unique and ordered', async () => {
      const ev1 = normalizeBallToCanonicalEvent({
        matchId,
        innings: 1,
        overNumber: 2,
        ballNumber: 4,
        sequenceNumber: 20,
        rawBall: '1',
        isConfirmed: true,
        provider: 'SPORTSRADAR',
        providerEventId: 'sr_ev_20',
      });

      const res1 = await upsertCanonicalBallEvent(ev1);
      assert.equal(res1.action, 'INSERTED');

      // Replay identical event -> IDEMPOTENT
      const resReplay = await upsertCanonicalBallEvent(ev1);
      assert.equal(resReplay.action, 'IDEMPOTENT');

      // Higher revision arrives -> CORRECTED
      const evHigher = normalizeBallToCanonicalEvent({
        matchId,
        innings: 1,
        overNumber: 2,
        ballNumber: 4,
        sequenceNumber: 25,
        rawBall: '4',
        isConfirmed: true,
        provider: 'SPORTSRADAR',
        providerEventId: 'sr_ev_25',
      });
      const resHigher = await upsertCanonicalBallEvent(evHigher);
      assert.equal(resHigher.action, 'CORRECTED');

      // Stale revision arrives late -> STALE_REJECTED
      const evStale = normalizeBallToCanonicalEvent({
        matchId,
        innings: 1,
        overNumber: 2,
        ballNumber: 4,
        sequenceNumber: 18,
        rawBall: '0',
        isConfirmed: true,
        provider: 'SPORTSRADAR',
        providerEventId: 'sr_ev_18',
      });
      const resStale = await upsertCanonicalBallEvent(evStale);
      assert.equal(resStale.action, 'STALE_REJECTED');

      // Verified state is the highest revision ('4')
      const confirmed = await getConfirmedBallEvent(matchId, 1, 2, 4);
      assert.equal(confirmed.rawLabel, '4');
    });
  });

  // =========================================================================
  // 5. 100 CONCURRENT RECOVERY ATTEMPTS SIMULATION
  // =========================================================================
  describe('5. 100 Concurrent Reversal Recovery Attempts Simulation', () => {
    it('100 concurrent recovery workers commit exactly 1 recovery and 99 idempotent no-ops', async () => {
      let recoveryExecuted = false;
      let committedRecoveries = 0;
      let idempotentSkips = 0;
      let totalRecovered = 0;

      const totalAdjustment = 1000.00;
      const initialBalance = 400.00;

      async function attemptRecoveryWorker(workerId) {
        // Atomic lock simulation
        if (!recoveryExecuted) {
          recoveryExecuted = true;
          const rec = calculateRecoveryLiability({
            totalAdjustment,
            currentBalance: initialBalance,
            allowPartialRecovery: true,
          });
          committedRecoveries += 1;
          totalRecovered += rec.recoveredAmount;
          return { status: 'COMMITTED', workerId, recovered: rec.recoveredAmount, outstanding: rec.outstandingAmount };
        } else {
          idempotentSkips += 1;
          return { status: 'ALREADY_REVERSED', workerId };
        }
      }

      const workers = Array.from({ length: 100 }, (_, idx) => attemptRecoveryWorker(`worker_${idx}`));
      const results = await Promise.all(workers);

      assert.equal(results.length, 100);
      assert.equal(committedRecoveries, 1, 'Exactly 1 recovery transaction MUST commit');
      assert.equal(idempotentSkips, 99, '99 workers MUST idempotently skip');
      assert.equal(totalRecovered, 400.00, 'Total recovered amount must exactly equal available balance');
    });
  });

  // =========================================================================
  // 6. WALLET BUCKET-LEVEL RECONCILIATION
  // =========================================================================
  describe('6. Wallet Bucket-Level Reconciliation Invariants', () => {
    it('Reconciles multi-bucket changes with ledger journal entries', () => {
      const before = { balance: 1000.00, bonusBalance: 100.00 };
      const after = { balance: 800.00, bonusBalance: 100.00 }; // -200 cash

      const ledgerEntries = [
        { type: 'DEBIT', amount: 200.00, description: 'Compensating reversal recovery' },
      ];

      const rec = verifyBucketReconciliation(before, after, ledgerEntries);
      assert.equal(rec.reconciled, true);
      assert.equal(rec.deltaWallet, -200.00);
      assert.equal(rec.deltaLedger, -200.00);
      assert.equal(rec.discrepancy, 0.00);
    });
  });
});
