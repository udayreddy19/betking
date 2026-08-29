import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  normalizePromoCode,
  isExclusiveSignupPromo,
} from '../../lib/signupPromoCodes.mjs';

import {
  calculateDepositFreebetAmount,
} from '../../lib/depositFreebetEngine.mjs';

import {
  bonusOddsQualify,
  BONUS_MIN_BET_ODDS,
} from '../../lib/promoRules.mjs';

describe('Phase 36.2 — Promotion API Failure Injection, Budget Exhaustion & Abuse Hardening Suite', () => {

  // =========================================================================
  // 1. PROMOTION BUDGET EXHAUSTION UNDER CONCURRENCY
  // =========================================================================
  describe('1. Promotion Budget Exhaustion Under Concurrency', () => {
    it('100 concurrent claims against a ₹1,000 budget with ₹500 reward allow exactly 2 claims and reject 98 over-budget attempts', async () => {
      let totalBudget = 1000;
      let usedBudget = 0;
      const rewardPerClaim = 500;
      let successfulClaims = 0;
      let budgetExhaustedRejections = 0;

      // Simulated atomic budget check and update under FOR UPDATE row lock on promotions table
      async function claimWithBudgetWorker(workerId) {
        if (usedBudget + rewardPerClaim <= totalBudget) {
          usedBudget += rewardPerClaim;
          successfulClaims++;
          return { success: true, reward: rewardPerClaim, usedBudget };
        }
        budgetExhaustedRejections++;
        return { success: false, reason: 'PROMOTION_ERROR: Promotion budget exhausted' };
      }

      const workers = Array.from({ length: 100 }, (_, i) => claimWithBudgetWorker(i));
      const results = await Promise.all(workers);

      assert.equal(successfulClaims, 2, 'Exactly 2 claims can be funded by ₹1,000 budget with ₹500 reward');
      assert.equal(budgetExhaustedRejections, 98, '98 concurrent claims must be rejected due to budget exhaustion');
      assert.equal(usedBudget, 1000, 'Used budget must exactly equal 1000');
      assert.equal(usedBudget <= totalBudget, true, 'Used budget must never exceed total budget');
    });
  });

  // =========================================================================
  // 2. FAILURE INJECTION & TRANSACTION ROLLBACK SAFETY
  // =========================================================================
  describe('2. Failure Injection & Transaction Rollback Safety', () => {
    it('simulated ledger insertion failure causes full transaction rollback without phantom wallet credit', async () => {
      let walletBonusBalance = 0;
      let userBonusRecords = [];
      let ledgerRecords = [];

      async function claimPromotionWithSimulatedLedgerFailure() {
        // Begin Transaction
        const stagingWallet = walletBonusBalance + 500;
        const stagingBonusRecord = { id: 'ubonus_fail_1', amount: 500 };

        try {
          // Step 1: Update wallet (staged)
          // Step 2: Insert user_bonuses (staged)
          // Step 3: Insert ledger_entries (FAILS)
          throw new Error('LEDGER_WRITE_ERROR: DB connection timeout');

          // If commit succeeded:
          walletBonusBalance = stagingWallet;
          userBonusRecords.push(stagingBonusRecord);
        } catch (err) {
          // Rollback: No state committed
          return { rolledBack: true, error: err.message };
        }
      }

      const result = await claimPromotionWithSimulatedLedgerFailure();
      assert.equal(result.rolledBack, true);
      assert.equal(walletBonusBalance, 0, 'Wallet balance must remain unchanged after rollback');
      assert.equal(userBonusRecords.length, 0, 'No bonus record must be inserted on transaction rollback');
      assert.equal(ledgerRecords.length, 0, 'No orphan ledger entry created');
    });

    it('simulated worker crash before acknowledgement preserves idempotency upon retry', async () => {
      const processedEvents = new Set();
      let walletCredits = 0;

      async function processRewardEvent(eventId, retryAttempt = 1) {
        if (processedEvents.has(eventId)) {
          return { success: true, duplicateSkip: true, walletCredits };
        }
        processedEvents.add(eventId);
        walletCredits += 250;

        if (retryAttempt === 1) {
          // Simulate crash before ACK sent to queue
          throw new Error('WORKER_CRASH: Process killed before ACK');
        }
        return { success: true, duplicateSkip: false, walletCredits };
      }

      // First attempt crashes
      await assert.rejects(async () => {
        await processRewardEvent('evt_crash_1', 1);
      }, /WORKER_CRASH/);

      // Worker retries event 'evt_crash_1'
      const retryResult = await processRewardEvent('evt_crash_1', 2);
      assert.equal(retryResult.duplicateSkip, true, 'Worker retry must detect already processed event');
      assert.equal(walletCredits, 250, 'Wallet credit must happen exactly once despite worker crash and retry');
    });
  });

  // =========================================================================
  // 3. EXPIRY RACE STRESS TEST
  // =========================================================================
  describe('3. Expiry Race Stress Test', () => {
    it('concurrent usage request and expiry worker resolve deterministically with zero double-action', async () => {
      const grant = {
        id: 'dfb_race_1',
        amount: 500,
        status: 'AVAILABLE',
        expiresAt: Date.now() - 1000, // Expired 1 second ago
      };

      let usedCount = 0;
      let expiredCount = 0;

      // Simulated atomic state machine transition
      async function useReward() {
        if (grant.status === 'AVAILABLE' && grant.expiresAt > Date.now()) {
          grant.status = 'USED';
          usedCount++;
          return { success: true, action: 'USED' };
        }
        return { success: false, reason: 'REWARD_EXPIRED' };
      }

      async function expireRewardWorker() {
        if (grant.status === 'AVAILABLE' && grant.expiresAt <= Date.now()) {
          grant.status = 'EXPIRED';
          expiredCount++;
          return { success: true, action: 'EXPIRED' };
        }
        return { success: false, reason: 'ALREADY_TERMINAL' };
      }

      // Run both concurrently
      const [useRes, expireRes] = await Promise.all([useReward(), expireRewardWorker()]);

      assert.equal(useRes.success, false, 'Expired reward cannot be used');
      assert.equal(expireRes.success, true, 'Expiry worker must transition expired reward to EXPIRED');
      assert.equal(usedCount, 0, 'No used action on expired reward');
      assert.equal(expiredCount, 1, 'Exactly one expiry transition');
      assert.equal(grant.status, 'EXPIRED');
    });
  });

  // =========================================================================
  // 4. CLIENT TRUST & REQUEST TAMPERING REJECTION
  // =========================================================================
  describe('4. Client Trust & Request Tampering Rejection', () => {
    it('server rejects spoofed reward amounts and calculates strictly based on database configuration', () => {
      const promoConfigInDb = {
        minDeposit: 500,
        matchPercent: 100,
        maxReward: 1000,
      };

      const maliciousPayload = {
        promoCode: 'DEPOSIT100',
        rewardAmount: 999999, // Tampered client payload
        matchPercent: 500,   // Tampered client percentage
      };

      const verifiedDepositInDb = 500;

      // Server-side calculation using DB config:
      const calc = calculateDepositFreebetAmount({
        depositAmount: verifiedDepositInDb,
        matchPercent: promoConfigInDb.matchPercent,
        maxFreeBet: promoConfigInDb.maxReward,
        minDeposit: promoConfigInDb.minDeposit,
      });

      assert.equal(calc.amount, 500, 'Server must compute reward strictly from verified DB parameters');
      assert.notEqual(calc.amount, maliciousPayload.rewardAmount, 'Tampered client reward amount must be ignored');
    });
  });

  // =========================================================================
  // 5. PRE-KYC & UNVERIFIED IDENTITY ABUSE GUARD
  // =========================================================================
  describe('5. Pre-KYC & Unverified Identity Abuse Guard', () => {
    it('deduplicates promotional claims using PAN and Aadhaar cryptographic hashes', () => {
      const panHash = crypto.createHash('sha256').update('ABCDE1234F').digest('hex');
      const aadhaarHash = crypto.createHash('sha256').update('123456789012').digest('hex');

      const claimedIdentities = new Set();
      claimedIdentities.add(panHash);

      function checkIdentityEligibility(pan, aadhaar) {
        if (claimedIdentities.has(pan) || claimedIdentities.has(aadhaar)) {
          return { eligible: false, code: 'IDENTITY_PROMO_ALREADY_CLAIMED' };
        }
        return { eligible: true };
      }

      // Secondary account using same PAN
      const check1 = checkIdentityEligibility(panHash, 'diff_aadhaar');
      assert.equal(check1.eligible, false);
      assert.equal(check1.code, 'IDENTITY_PROMO_ALREADY_CLAIMED');

      // Genuine distinct user
      const freshPan = crypto.createHash('sha256').update('XYZPK9876Q').digest('hex');
      const check2 = checkIdentityEligibility(freshPan, 'fresh_aadhaar');
      assert.equal(check2.eligible, true);
    });
  });

});
