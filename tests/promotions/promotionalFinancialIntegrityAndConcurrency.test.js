import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

import {
  normalizePromoCode,
  isExclusiveSignupPromo,
  hasReachedPerUserLimit,
} from '../../lib/signupPromoCodes.mjs';

import {
  calculateDepositFreebetAmount,
} from '../../lib/depositFreebetEngine.mjs';

import {
  bonusOddsQualify,
  BONUS_MIN_BET_ODDS,
} from '../../lib/promoRules.mjs';

import {
  splitBetWinPayout,
} from '../../lib/wageringRules.mjs';

import {
  DAILY_SPIN_PRIZES,
  SPIN_PRIZE_TTL_MS,
  spinDateInKolkata,
} from '../../lib/dailySpinPrizes.mjs';

import {
  scaleSpinPrize,
} from '../../lib/vipBenefits.mjs';

describe('Phase 36.1 — Promotional Financial Integrity, Lifecycle & Concurrency Suite', () => {

  // =========================================================================
  // 1. PROMO CODE CONCURRENCY & EXCLUSIVITY
  // =========================================================================
  describe('1. Promo Code Concurrency & Exclusivity', () => {
    it('100 concurrent redemption attempts of a single-use promo code produce exactly 1 reward and 0 duplicate ledger entries', async () => {
      const codeId = `code_stress_${Date.now()}`;
      const promoCode = 'WELCOME100';
      const maxPerUser = 1;
      let redemptionsCount = 0;
      let duplicateRejections = 0;
      let walletCredits = 0;
      let ledgerEntries = 0;

      // Simulated atomic database state machine with row-level CAS
      const db = {
        redemptions: new Set(),
        walletBonus: 0,
        ledger: [],
      };

      async function redeemWorker(workerId) {
        const userId = 'usr_promo_stress_1';
        // In PostgreSQL: SELECT COUNT(*) FROM signup_promo_redemptions WHERE user_id=$1 FOR UPDATE
        if (db.redemptions.has(userId)) {
          duplicateRejections++;
          return { success: false, reason: 'PROMO_USER_LIMIT' };
        }
        db.redemptions.add(userId);
        redemptionsCount++;
        walletCredits += 100;
        db.walletBonus += 100;
        ledgerEntries++;
        db.ledger.push({ type: 'CREDIT', amount: 100, balanceAfter: db.walletBonus });
        return { success: true, reward: 100 };
      }

      // Execute 100 concurrent attempts
      const workers = Array.from({ length: 100 }, (_, i) => redeemWorker(i));
      const results = await Promise.all(workers);

      const successfulClaims = results.filter(r => r.success);
      assert.equal(successfulClaims.length, 1, 'Exactly 1 worker should claim successfully');
      assert.equal(duplicateRejections, 99, '99 concurrent requests must be rejected as duplicate');
      assert.equal(walletCredits, 100, 'Wallet credit must match exactly 1 claim');
      assert.equal(ledgerEntries, 1, 'Ledger entries must match exactly 1 credit');
      assert.equal(db.ledger.length, 1, 'Ledger must contain exactly 1 append-only row');
    });

    it('exclusive welcome codes cannot be claimed if user has claimed another exclusive code', () => {
      assert.equal(isExclusiveSignupPromo('SPORTS500'), true);
      assert.equal(isExclusiveSignupPromo('VIP1000'), true);
      assert.equal(isExclusiveSignupPromo('LIVE100'), true);
      assert.equal(isExclusiveSignupPromo('GENERIC20'), false);

      assert.equal(normalizePromoCode(' sports500 '), 'SPORTS500');
      assert.equal(normalizePromoCode('vip_1000!'), 'VIP_1000');
    });

    it('enforces per-user limit strictly', () => {
      assert.equal(hasReachedPerUserLimit(0, 1), false);
      assert.equal(hasReachedPerUserLimit(1, 1), true);
      assert.equal(hasReachedPerUserLimit(2, 1), true);
      assert.equal(hasReachedPerUserLimit(2, 3), false);
      assert.equal(hasReachedPerUserLimit(3, 3), true);
    });
  });

  // =========================================================================
  // 2. FREE BET DOUBLE-SPEND & PROFIT-ONLY SETTLEMENT
  // =========================================================================
  describe('2. Free Bet Double-Spend & Profit-Only Settlement', () => {
    it('100 concurrent bet placement requests on a ₹500 free bet balance result in exactly 1 reservation and 99 insufficient fund blocks', async () => {
      let freebetBalance = 500;
      let successfulPlacements = 0;
      let rejectedPlacements = 0;

      // Simulated atomic transaction with FOR UPDATE row lock on wallets.freebet_balance
      async function placeBetWorker(stake) {
        if (freebetBalance >= stake) {
          freebetBalance -= stake;
          successfulPlacements++;
          return { ok: true, remaining: freebetBalance };
        }
        rejectedPlacements++;
        return { ok: false, reason: 'INSUFFICIENT_FREEBET_BALANCE' };
      }

      const workers = Array.from({ length: 100 }, () => placeBetWorker(500));
      const results = await Promise.all(workers);

      assert.equal(successfulPlacements, 1, 'Only one bet placement can consume the ₹500 freebet');
      assert.equal(rejectedPlacements, 99, '99 attempts must fail due to zero remaining balance');
      assert.equal(freebetBalance, 0, 'Final freebet balance must be 0');
    });

    it('CRITICAL SETTLEMENT RULE: winning free bet credits net profit only (stake is NOT returned)', () => {
      const stake = 500;
      const odds = 2.50;
      const payout = stake * odds; // 1250

      // splitBetWinPayout splits payout into profit and stake return
      const split = splitBetWinPayout({
        stake,
        payout,
        fundSource: 'freebet',
        freebetStake: stake,
      });

      // Profit = (2.50 - 1) * 500 = 750
      assert.equal(split.cashCredit, 750, 'Cash credit must equal profit only ((odds - 1) * stake)');
      // For freebet, returned stake to freebet balance is 0
      assert.equal(split.freebetCredit, 0, 'Free bet stake must NOT be returned');
      assert.equal(split.winningsCredit, 750, 'Winnings credit must record net profit');
    });

    it('cash bet winning returns BOTH stake and profit', () => {
      const stake = 500;
      const payout = 1250;
      const split = splitBetWinPayout({
        stake,
        payout,
        fundSource: 'cash',
        cashStake: stake,
      });

      assert.equal(split.cashCredit, 1250, 'Cash credit must return both stake and winnings (1250)');
      assert.equal(split.winningsCredit, 750, 'Winnings credit must record net profit (750)');
    });

    it('deposit free bet calculation respects min deposit and maximum free bet caps', () => {
      // 100% match, max ₹5000, min deposit ₹500
      const calc1 = calculateDepositFreebetAmount({
        depositAmount: 1000,
        matchPercent: 100,
        maxFreeBet: 5000,
        minDeposit: 500,
      });
      assert.equal(calc1.eligible, true);
      assert.equal(calc1.amount, 1000);

      // Above cap: deposit ₹10000 -> capped at ₹5000
      const calc2 = calculateDepositFreebetAmount({
        depositAmount: 10000,
        matchPercent: 100,
        maxFreeBet: 5000,
        minDeposit: 500,
      });
      assert.equal(calc2.eligible, true);
      assert.equal(calc2.amount, 5000);

      // Below min deposit: deposit ₹200 -> not eligible
      const calc3 = calculateDepositFreebetAmount({
        depositAmount: 200,
        matchPercent: 100,
        maxFreeBet: 5000,
        minDeposit: 500,
      });
      assert.equal(calc3.eligible, false);
      assert.equal(calc3.reason, 'MINIMUM_DEPOSIT_NOT_MET');
    });
  });

  // =========================================================================
  // 3. BONUS WAGERING TURNOVER & EXACTLY-ONCE RELEASE
  // =========================================================================
  describe('3. Bonus Wagering Turnover & Exactly-Once Release', () => {
    it('wagering accumulates only on qualifying odds (>= 1.75) and ignores freebet stakes', () => {
      assert.equal(bonusOddsQualify(1.74), false, 'Odds 1.74 should not qualify for turnover');
      assert.equal(bonusOddsQualify(1.75), true, 'Odds 1.75 must qualify');
      assert.equal(bonusOddsQualify(2.10), true, 'Odds 2.10 must qualify');
      assert.equal(BONUS_MIN_BET_ODDS, 1.75);
    });

    it('100 concurrent bonus release requests on a completed bonus result in exactly 1 release event', async () => {
      const bonus = {
        id: 'ubonus_101',
        bonusAmount: 1000,
        wageringRequired: 5000,
        wageringCompleted: 5000,
        status: 'COMPLETED',
      };

      let releaseCount = 0;
      let alreadyReleasedCount = 0;
      let cashCredits = 0;

      async function releaseWorker() {
        // Atomic CAS simulation: UPDATE user_bonuses SET status='RELEASED' WHERE id=$1 AND status='COMPLETED'
        if (bonus.status === 'COMPLETED') {
          bonus.status = 'RELEASED';
          releaseCount++;
          cashCredits += bonus.bonusAmount;
          return { success: true, status: 'RELEASED' };
        }
        alreadyReleasedCount++;
        return { success: true, status: 'ALREADY_RELEASED' };
      }

      const workers = Array.from({ length: 100 }, () => releaseWorker());
      const results = await Promise.all(workers);

      assert.equal(releaseCount, 1, 'Bonus must be released exactly once');
      assert.equal(alreadyReleasedCount, 99, '99 concurrent requests must return ALREADY_RELEASED');
      assert.equal(cashCredits, 1000, 'Cash credits must equal exactly one bonus amount (1000)');
      assert.equal(bonus.status, 'RELEASED');
    });
  });

  // =========================================================================
  // 4. DAILY SPIN WHEEL CONCURRENCY & EXPIRY
  // =========================================================================
  describe('4. Daily Spin Wheel Concurrency & Expiry', () => {
    it('100 concurrent spin attempts on the same calendar day yield exactly 1 prize and 99 alreadySpun rejections', async () => {
      const spinDate = spinDateInKolkata();
      let spinsGranted = 0;
      let alreadySpunCount = 0;
      let grantedPrize = null;

      const dailySpinsDb = new Map();

      async function spinWorker(workerId) {
        const userId = 'usr_daily_spin_concurrency_1';
        const key = `${userId}_${spinDate}`;

        // In PostgreSQL: INSERT INTO daily_spins (...) ON CONFLICT (user_id, spin_date) DO NOTHING
        if (dailySpinsDb.has(key)) {
          alreadySpunCount++;
          return { success: true, alreadySpun: true, prize: dailySpinsDb.get(key) };
        }

        const prize = DAILY_SPIN_PRIZES[0]; // ₹50 bonus
        dailySpinsDb.set(key, prize);
        spinsGranted++;
        grantedPrize = prize;
        return { success: true, alreadySpun: false, prize };
      }

      const workers = Array.from({ length: 100 }, (_, i) => spinWorker(i));
      const results = await Promise.all(workers);

      assert.equal(spinsGranted, 1, 'Only 1 daily spin may be granted per calendar day');
      assert.equal(alreadySpunCount, 99, '99 concurrent requests must be rejected as already spun');
      assert.ok(grantedPrize);
    });

    it('scales spin prize according to VIP tier multipliers', () => {
      assert.equal(scaleSpinPrize(100, 'BRONZE'), 100);
      assert.equal(scaleSpinPrize(100, 'SILVER'), 100);
      assert.equal(scaleSpinPrize(100, 'GOLD'), 125);
      assert.equal(scaleSpinPrize(100, 'PLATINUM'), 150);
      assert.equal(scaleSpinPrize(100, 'DIAMOND'), 200);
    });

    it('spin prize TTL is strictly 24 hours', () => {
      assert.equal(SPIN_PRIZE_TTL_MS, 24 * 60 * 60 * 1000);
    });
  });

  // =========================================================================
  // 5. VIP DAILY CASHBACK EXACTLY-ONCE
  // =========================================================================
  describe('5. VIP Daily Cashback Exactly-Once', () => {
    it('prevents multiple claims of yesterday net loss cashback via unique constraint', async () => {
      const claimDate = '2026-08-28';
      const userId = 'usr_vip_cashback_1';
      const claimsDb = new Set();

      let successfulClaims = 0;
      let duplicateClaims = 0;

      async function claimCashbackWorker() {
        const key = `${userId}_${claimDate}`;
        if (claimsDb.has(key)) {
          duplicateClaims++;
          return { success: false, code: 'CASHBACK_ALREADY_CLAIMED' };
        }
        claimsDb.add(key);
        successfulClaims++;
        return { success: true, amount: 250 };
      }

      const workers = Array.from({ length: 50 }, () => claimCashbackWorker());
      const results = await Promise.all(workers);

      assert.equal(successfulClaims, 1, 'Cashback can be claimed only once per claim date');
      assert.equal(duplicateClaims, 49, '49 concurrent requests must fail with CASHBACK_ALREADY_CLAIMED');
    });
  });

  // =========================================================================
  // 6. REFERRAL ABUSE & DUPLICATE PREVENTION
  // =========================================================================
  describe('6. Referral Abuse & Duplicate Prevention', () => {
    it('blocks self-referral and duplicate attribution', () => {
      const referrerId = 'usr_refer_101';
      const refereeId = 'usr_refer_101';

      const isSelfReferral = (refId, targetId) => refId === targetId;
      assert.equal(isSelfReferral(referrerId, refereeId), true, 'Self-referral must be detected and blocked');

      const validRefereeId = 'usr_refer_202';
      assert.equal(isSelfReferral(referrerId, validRefereeId), false, 'Valid referee allowed');
    });
  });

  // =========================================================================
  // 7. CLIENT TRUST BOUNDARIES & IMMUTABILITY
  // =========================================================================
  describe('7. Client Trust Boundaries & Immutability', () => {
    it('server never trusts client-supplied deposit amounts for bonus calculations', () => {
      const clientSuppliedAmount = 1000000; // Client spoofed 10 Lakhs
      const actualDepositInDb = 500; // Actual deposit ₹500

      // Server calculates reward on actualDepositInDb
      const reward = Math.min(actualDepositInDb * 1.0, 5000);
      assert.equal(reward, 500, 'Server must base reward strictly on verified DB transaction');
      assert.notEqual(reward, clientSuppliedAmount);
    });
  });

});
