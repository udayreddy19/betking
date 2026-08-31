import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../lib/oddsQuoteService.mjs', () => ({
  resolveServerOdds: vi.fn(async ({ selectionId }) => {
    if (selectionId === 'sel_acca_d_1') return 2.00;
    if (selectionId === 'sel_acca_d_2') return 3.00;
    return 2.00;
  }),
  unwrapServerOddsQuote: (quote) => (quote?.odds != null ? Number(quote.odds) : Number(quote)),
  loadLiveOddsSnapshot: vi.fn(async () => ({ status: 'OK', markets: [] })),
}));

import { query } from '../../db/pg.js';
import { getSupportUserFinancialSummary } from '../../lib/supportEngine.mjs';
import { createSignupPromoCode, claimSignupPromo, revokeSignupPromoRedemption } from '../../lib/signupPromoCodes.mjs';
import { createPromotion, claimPromotionBonus, processBonusWageringProgress, releaseCompletedBonus, expireStaleBonuses } from '../../lib/promotionsEngine.mjs';
import { betPlacementEngine } from '../../lib/betPlacementEngine.mjs';

describe('ODDSYRA VERIFIED FIXES TEST SUITE (FIN-001, FIN-002, FIN-003, BET-001, PROMO-001)', () => {

  // ==========================================
  // FIX 1: FIN-001 — SUPPORT FINANCIAL SUMMARY
  // ==========================================
  describe('FIN-001: Support User Financial Summary', () => {
    const userWithTx = 'usr_sup_fin_01';
    const userNoTx = 'usr_sup_fin_02';

    beforeEach(async () => {
      await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userWithTx, `${userWithTx}@example.com`]);
      await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userNoTx, `${userNoTx}@example.com`]);

      await query(`INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, freebet_balance, currency)
                   VALUES ($1, $2, 1500.00, 200.00, 100.00, 'INR')
                   ON CONFLICT (wallet_id) DO UPDATE SET balance = 1500.00, bonus_balance = 200.00, freebet_balance = 100.00;`,
                   [`w_${userWithTx}`, userWithTx]);

      await query(`INSERT INTO transactions (transaction_id, user_id, type, method, amount, status, created_at)
                   VALUES ($1, $2, 'DEPOSIT', 'UPI', 1000.00, 'SUCCESS', NOW())
                   ON CONFLICT (transaction_id) DO NOTHING;`,
                   [`tx_${userWithTx}_1`, userWithTx]);

      await query(`INSERT INTO deposits (id, deposit_id, user_id, order_id, amount, status, created_at)
                   VALUES ($1, $1, $2, $3, 1000.00, 'PAID', NOW())
                   ON CONFLICT (id) DO NOTHING;`,
                   [`dep_${userWithTx}_1`, userWithTx, `ord_${userWithTx}_1`]);
    });

    it('returns structured financial summary for user with transactions', async () => {
      const summary = await getSupportUserFinancialSummary(userWithTx);
      expect(summary).toBeDefined();
      expect(summary.userId).toBe(userWithTx);
      expect(summary.wallet.balance).toBe(1500.00);
      expect(summary.wallet.bonusBalance).toBe(200.00);
      expect(summary.wallet.freebetBalance).toBe(100.00);
      expect(summary.lifetime.totalDeposited).toBe(1000.00);
      expect(summary.lifetime.depositCount).toBe(1);
      expect(summary.recentTransactions.length).toBeGreaterThanOrEqual(1);
      expect(summary.recentTransactions[0].transactionId).toBe(`tx_${userWithTx}_1`);
      expect(summary.recentTransactions[0].type).toBe('DEPOSIT');
    });

    it('safely handles user with zero transactions without throwing', async () => {
      const summary = await getSupportUserFinancialSummary(userNoTx);
      expect(summary).toBeDefined();
      expect(summary.userId).toBe(userNoTx);
      expect(summary.recentTransactions).toEqual([]);
      expect(summary.lifetime.totalDeposited).toBe(0);
      expect(summary.lifetime.totalWithdrawn).toBe(0);
    });
  });

  // ========================================================
  // FIX 2: FIN-002 — SIGNUP PROMO REVOCATION AUDIT TRAIL
  // ========================================================
  describe('FIN-002: Signup Promo Revocation Auditing & Idempotency', () => {
    const promoUser = 'usr_promo_rev_01';
    let codeName;

    beforeEach(async () => {
      codeName = `REVOKECODE_${Date.now()}`;
      await query(`DELETE FROM ledger_entries WHERE wallet_id = $1;`, [`w_${promoUser}`]);
      await query(`DELETE FROM transactions WHERE user_id = $1;`, [promoUser]);
      await query(`DELETE FROM signup_promo_redemptions WHERE user_id = $1;`, [promoUser]);
      await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [promoUser, `${promoUser}@example.com`]);
      await query(`INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, freebet_balance, currency)
                   VALUES ($1, $2, 0.00, 0.00, 0.00, 'INR')
                   ON CONFLICT (wallet_id) DO UPDATE SET balance = 0.00, bonus_balance = 0.00, freebet_balance = 0.00;`,
                   [`w_${promoUser}`, promoUser]);

      await createSignupPromoCode({
        code: codeName,
        name: 'Revoke Test Code',
        rewardType: 'cash',
        amount: 250.00,
        isActive: true,
        maxRedemptions: 100,
      });
    });

    it('revokes promo redemption atomically, creates DEBIT ledger entry, and prevents double-debit', async () => {
      // 1. Redeem
      const redeemRes = await claimSignupPromo(promoUser, codeName);
      expect(redeemRes.rewardType).toBe('cash');

      const wAfterRedeem = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [promoUser]);
      expect(Number(wAfterRedeem.rows[0].balance)).toBe(250.00);

      // 2. Revoke First Time
      const rRes = await query(`SELECT redemption_id FROM signup_promo_redemptions WHERE user_id = $1`, [promoUser]);
      const redemptionId = rRes.rows[0].redemption_id;

      const revRes = await revokeSignupPromoRedemption({ redemptionId, adminId: 'adm_sec_01', reason: 'Abuse detected' });
      expect(revRes.success).toBe(true);
      expect(revRes.alreadyRevoked).toBeFalsy();

      // Verify wallet debited
      const wAfterRevoke = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [promoUser]);
      expect(Number(wAfterRevoke.rows[0].balance)).toBe(0.00);

      // Verify transaction and ledger entry created
      const txRes = await query(`SELECT * FROM transactions WHERE transaction_id = $1`, [`tx_promo_rev_${redemptionId}`]);
      expect(txRes.rows.length).toBe(1);
      expect(txRes.rows[0].type).toBe('PROMO_REVOKED');
      expect(Number(txRes.rows[0].amount)).toBe(250.00);

      const ledRes = await query(`SELECT * FROM ledger_entries WHERE transaction_id = $1`, [`tx_promo_rev_${redemptionId}`]);
      expect(ledRes.rows.length).toBe(1);
      expect(ledRes.rows[0].type).toBe('DEBIT');
      expect(Number(ledRes.rows[0].amount)).toBe(250.00);

      // 3. Revoke Second Time (Idempotency check: MUST NOT deduct again)
      const revRes2 = await revokeSignupPromoRedemption({ redemptionId, adminId: 'adm_sec_01' });
      expect(revRes2.alreadyRevoked).toBe(true);

      const wAfterRevoke2 = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [promoUser]);
      expect(Number(wAfterRevoke2.rows[0].balance)).toBe(0.00);
    });
  });

  // ========================================================
  // FIX 3: FIN-003 — ATOMIC & AUDITABLE BONUS EXPIRY
  // ========================================================
  describe('FIN-003: Atomic Bonus Expiry & Ledger Logging', () => {
    const expUser = 'usr_exp_bn_01';
    let promoId;

    beforeEach(async () => {
      await query(`DELETE FROM user_bonuses WHERE user_id = $1;`, [expUser]);
      await query(`DELETE FROM ledger_entries WHERE wallet_id = $1;`, [`w_${expUser}`]);
      await query(`DELETE FROM transactions WHERE user_id = $1;`, [expUser]);
      await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [expUser, `${expUser}@example.com`]);
      await query(`INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, currency)
                   VALUES ($1, $2, 500.00, 300.00, 'INR')
                   ON CONFLICT (wallet_id) DO UPDATE SET balance = 500.00, bonus_balance = 300.00;`,
                   [`w_${expUser}`, expUser]);

      const promoRes = await createPromotion({
        name: 'Expiry Test Promo',
        code: `EXP_PROMO_${Date.now()}`,
        type: 'WELCOME_BONUS',
        budget: 50000.00,
        maxReward: 300.00,
        wageringMultiplier: 5.0,
      });
      promoId = promoRes.promoId;

      // Insert an expired active bonus
      await query(`
        INSERT INTO user_bonuses (id, user_id, promotion_id, bonus_amount, wagering_required, wagering_completed, status, expires_at, created_at)
        VALUES ('ub_exp_test_01', $1, $2, 300.00, 1500.00, 0.00, 'ACTIVE', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '2 days')
      `, [expUser, promoId]);
    });

    it('expires stale bonus atomically, deducts bonus balance, logs ledger DEBIT, and is idempotent', async () => {
      // 1. Run expiry worker
      const res1 = await expireStaleBonuses();
      expect(res1.success).toBe(true);

      // Verify bonus balance was deducted to 0
      const wRes = await query(`SELECT balance, bonus_balance FROM wallets WHERE user_id = $1`, [expUser]);
      expect(Number(wRes.rows[0].bonus_balance)).toBe(0.00);
      expect(Number(wRes.rows[0].balance)).toBe(500.00); // Cash balance untouched

      // Verify transaction & ledger entry
      const tx = await query(`SELECT * FROM transactions WHERE transaction_id = 'tx_bn_exp_ub_exp_test_01'`);
      expect(tx.rows.length).toBe(1);
      expect(tx.rows[0].type).toBe('BONUS_EXPIRED');

      const led = await query(`SELECT * FROM ledger_entries WHERE transaction_id = 'tx_bn_exp_ub_exp_test_01'`);
      expect(led.rows.length).toBe(1);
      expect(led.rows[0].type).toBe('DEBIT');
      expect(Number(led.rows[0].amount)).toBe(300.00);

      // 2. Run worker again (Idempotent: 0 newly expired)
      const res2 = await expireStaleBonuses();
      expect(res2.countExpired).toBe(0);

      const wRes2 = await query(`SELECT bonus_balance FROM wallets WHERE user_id = $1`, [expUser]);
      expect(Number(wRes2.rows[0].bonus_balance)).toBe(0.00);
    });
  });

  // ========================================================
  // FIX 4: BET-001 — ACCUMULATOR ODDS CHANGE 409 CONFIRMATION
  // ========================================================
  describe('BET-001: Accumulator Odds Change Confirmation & 409 Rejection', () => {
    const accaUser = 'usr_acca_drift_01';
    const match1 = 'm_acca_d_1';
    const match2 = 'm_acca_d_2';
    const market1 = 'mkt_acca_d_1';
    const market2 = 'mkt_acca_d_2';
    const sel1 = 'sel_acca_d_1';
    const sel2 = 'sel_acca_d_2';

    beforeEach(async () => {
      await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [accaUser, `${accaUser}@example.com`]);
      await query(`INSERT INTO wallets (wallet_id, user_id, balance, currency)
                   VALUES ($1, $2, 1000.00, 'INR')
                   ON CONFLICT (wallet_id) DO UPDATE SET balance = 1000.00;`,
                   [`w_${accaUser}`, accaUser]);

      await query(`DELETE FROM bets WHERE user_id = $1;`, [accaUser]);
      await query(`INSERT INTO matches (match_id, status) VALUES ($1, 'LIVE'), ($2, 'LIVE') ON CONFLICT (match_id) DO NOTHING;`, [match1, match2]);
      await query(`INSERT INTO markets (market_id, match_id, name, status) VALUES ($1, $2, 'Match Winner', 'OPEN'), ($3, $4, 'Match Winner', 'OPEN')
                   ON CONFLICT (market_id) DO UPDATE SET status = 'OPEN';`, [market1, match1, market2, match2]);
      await query(`INSERT INTO selections (selection_id, market_id, name, odds, status) VALUES ($1, $2, 'Team 1', 2.00, 'OPEN'), ($3, $4, 'Team 2', 3.00, 'OPEN')
                   ON CONFLICT (selection_id) DO UPDATE SET odds = EXCLUDED.odds, status = 'OPEN';`, [sel1, market1, sel2, market2]);
    });

    it('rejects accumulator placement with 409 ODDS_CHANGED when leg odds drift, without debiting wallet', async () => {
      // User saw leg1 = 2.10 (server is 2.00) and leg2 = 3.00
      let caughtErr = null;
      try {
        await betPlacementEngine.placeBet({
          userId: accaUser,
          stake: 200.00,
          selections: [
            { matchId: match1, marketId: market1, selectionId: sel1, odds: 2.10 },
            { matchId: match2, marketId: market2, selectionId: sel2, odds: 3.00 },
          ],
        });
      } catch (err) {
        caughtErr = err;
      }

      expect(caughtErr).toBeDefined();
      expect(caughtErr.code).toBe('ODDS_CHANGED');
      expect(caughtErr.httpStatus).toBe(409);
      expect(caughtErr.requiresAcceptance).toBe(true);
      expect(caughtErr.changedSelections).toBeDefined();
      expect(caughtErr.changedSelections.length).toBeGreaterThan(0);

      // Verify wallet was NOT debited
      const wal = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [accaUser]);
      expect(Number(wal.rows[0].balance)).toBe(1000.00);

      // Verify no bet was placed in bets table
      const bets = await query(`SELECT * FROM bets WHERE user_id = $1`, [accaUser]);
      expect(bets.rows.length).toBe(0);
    });

    it('places accumulator cleanly when submitted with accepted matching server odds', async () => {
      const res = await betPlacementEngine.placeBet({
        userId: accaUser,
        stake: 200.00,
        selections: [
          { matchId: match1, marketId: market1, selectionId: sel1, odds: 2.00 },
          { matchId: match2, marketId: market2, selectionId: sel2, odds: 3.00 },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('ACCEPTED');
      expect(res.betId).toBeDefined();
      expect(res.acceptedOdds).toBe(6.00); // 2.00 * 3.00
      expect(res.potentialPayout).toBe(1200.00);

      // Verify wallet was debited exactly ₹200.00
      const wal = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [accaUser]);
      expect(Number(wal.rows[0].balance)).toBe(800.00);
    });
  });

  // ========================================================
  // FIX 5: PROMO-001 — COMPLETED BONUS RELEASE IDEMPOTENCY
  // ========================================================
  describe('PROMO-001: Completed Bonus Release Lifecycle', () => {
    const promoUser = 'usr_rel_bn_01';
    let promoCode;

    beforeEach(async () => {
      promoCode = `RELPROMO_${Date.now()}`;
      await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [promoUser, `${promoUser}@example.com`]);
      await query(`INSERT INTO user_profiles (user_id, account_status, kyc_status) VALUES ($1, 'ACTIVE', 'VERIFIED') ON CONFLICT (user_id) DO NOTHING;`, [promoUser]);
      await query(`INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, currency)
                   VALUES ($1, $2, 2000.00, 0.00, 'INR')
                   ON CONFLICT (wallet_id) DO UPDATE SET balance = 2000.00, bonus_balance = 0.00;`,
                   [`w_${promoUser}`, promoUser]);

      await query(
        `INSERT INTO transactions (transaction_id, user_id, type, amount, status)
         VALUES ($1, $2, 'DEPOSIT', 100.00, 'SUCCESS')`,
        [`tx_dep_${promoUser}_${Date.now()}`, promoUser],
      );

      await createPromotion({
        name: 'Release Test Promo',
        code: promoCode,
        type: 'WELCOME_BONUS',
        budget: 50000.00,
        maxReward: 100.00,
        wageringMultiplier: 5.0,
      });
    });

    it('rejects release when turnover is incomplete, releases once completed, and is idempotent', async () => {
      const claim = await claimPromotionBonus({ userId: promoUser, promoCode, depositAmount: 100.00 });
      const bonusId = claim.bonusId;

      // 1. Partial turnover (₹200 / ₹500) -> Must reject release
      await processBonusWageringProgress({ userId: promoUser, betStake: 200.00, betOdds: 1.80 });
      await expect(releaseCompletedBonus({ userId: promoUser, bonusId })).rejects.toThrow('INCOMPLETE_WAGERING');

      // 2. Complete remaining turnover (₹300) -> Total ₹500 / ₹500
      await processBonusWageringProgress({ userId: promoUser, betStake: 300.00, betOdds: 1.80 });

      // 3. Release succeeds
      const relRes = await releaseCompletedBonus({ userId: promoUser, bonusId });
      expect(relRes.success).toBe(true);
      expect(relRes.status).toBe('RELEASED');

      // 4. Repeated release call is idempotent
      const relRes2 = await releaseCompletedBonus({ userId: promoUser, bonusId });
      expect(relRes2.status).toBe('ALREADY_RELEASED');
    });
  });
});
