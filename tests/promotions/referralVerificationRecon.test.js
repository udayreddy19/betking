import { describe, it, expect, beforeEach } from 'vitest';
import {
  processReferralRegistration,
  qualifyReferralReward,
  ensureReferralCode,
  attributeReferralOnSignup,
  tryQualifyReferralAfterVerification,
  reconcilePendingReferrals,
  getMyReferralDashboard,
} from '../../lib/referralLoyaltyEngine.mjs';
import { query } from '../../db/pg.js';

describe('Referral verification trigger & reconciliation fallback', () => {
  const referrer = 'usr_test_recon_a01';
  const referred = 'usr_test_recon_b02';

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash, first_name, status)
                 VALUES ($1, $2, 'hash', 'Uday', 'ACTIVE')
                 ON CONFLICT (user_id) DO UPDATE SET status = 'ACTIVE';`, [referrer, `${referrer}@example.com`]);
    await query(`INSERT INTO users (user_id, email, password_hash, first_name, status)
                 VALUES ($1, $2, 'hash', 'Faizu', 'ACTIVE')
                 ON CONFLICT (user_id) DO UPDATE SET status = 'ACTIVE';`, [referred, `${referred}@example.com`]);

    await query(`INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, freebet_balance, currency)
                 VALUES ($1, $2, 0, 0, 0, 'INR')
                 ON CONFLICT (user_id) DO UPDATE SET freebet_balance = 0, balance = 0;`, [`wal_${referrer}`, referrer]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, freebet_balance, currency)
                 VALUES ($1, $2, 0, 0, 0, 'INR')
                 ON CONFLICT (user_id) DO UPDATE SET freebet_balance = 0, balance = 0;`, [`wal_${referred}`, referred]);

    await query(`INSERT INTO user_profiles (user_id, kyc_status)
                 VALUES ($1, 'NOT_STARTED')
                 ON CONFLICT (user_id) DO UPDATE SET kyc_status = 'NOT_STARTED';`, [referred]);

    await query(`DELETE FROM referral_reward_events WHERE beneficiary_user_id IN ($1, $2);`, [referrer, referred]).catch(() => null);
    await query(`DELETE FROM referrals WHERE referrer_user_id IN ($1, $2) OR referred_user_id IN ($1, $2);`, [referrer, referred]);
    await query(`DELETE FROM referral_codes WHERE user_id IN ($1, $2);`, [referrer, referred]).catch(() => null);
  });

  it('TEST 1: KYC verification hook qualifies pending referral and credits dual ₹500 freebets', async () => {
    const code = await ensureReferralCode(referrer, { firstName: 'Uday' });
    expect(code?.code).toBeDefined();

    // Register referral
    const reg = await processReferralRegistration({
      referrerUserId: referrer,
      referredUserId: referred,
      referralCode: code.code,
    });
    expect(reg.success).toBe(true);

    // Reset referral to simulate registered pending verification
    await query(
      `UPDATE referrals SET status = 'REGISTERED', qualification_status = 'PENDING', reward_status = 'PENDING', rewarded_at = NULL WHERE id = $1`,
      [reg.referralId],
    );
    await query(
      `UPDATE wallets SET freebet_balance = 0 WHERE user_id IN ($1, $2)`,
      [referrer, referred],
    );
    await query(
      `DELETE FROM referral_reward_events WHERE referral_id = $1`,
      [reg.referralId],
    );

    // Update user profile to VERIFIED
    await query(`UPDATE user_profiles SET kyc_status = 'VERIFIED' WHERE user_id = $1`, [referred]);

    // Trigger verification hook
    const hookResult = await tryQualifyReferralAfterVerification({ userId: referred });
    expect(hookResult.success).toBe(true);
    expect(hookResult.qualified).toBe(true);

    // Verify wallets
    const wallets = await query(
      `SELECT user_id, freebet_balance FROM wallets WHERE user_id IN ($1, $2)`,
      [referrer, referred],
    );
    const byId = Object.fromEntries(wallets.rows.map((r) => [r.user_id, Number(r.freebet_balance)]));
    expect(byId[referrer]).toBe(500);
    expect(byId[referred]).toBe(500);

    // Verify referral status in DB
    const ref = await query(`SELECT * FROM referrals WHERE id = $1`, [reg.referralId]);
    expect(ref.rows[0].status).toBe('REWARDED');
    expect(ref.rows[0].qualification_status).toBe('QUALIFIED');
    expect(ref.rows[0].reward_status).toBe('GRANTED');
  });

  it('TEST 2: Repeated verification events are completely idempotent (no duplicate rewards)', async () => {
    const code = await ensureReferralCode(referrer, { firstName: 'Uday' });
    const reg = await processReferralRegistration({
      referrerUserId: referrer,
      referredUserId: referred,
      referralCode: code.code,
    });

    // Fire verification hook twice
    const res1 = await tryQualifyReferralAfterVerification({ userId: referred });
    const res2 = await tryQualifyReferralAfterVerification({ userId: referred });

    expect(res2.qualified).toBe(false);

    // Verify reward events count
    const events = await query(`SELECT * FROM referral_reward_events WHERE referral_id = $1`, [reg.referralId]);
    expect(events.rows.length).toBe(2); // 1 for referrer, 1 for referee

    // Wallets should still be 500
    const wallets = await query(`SELECT user_id, freebet_balance FROM wallets WHERE user_id IN ($1, $2)`, [referrer, referred]);
    const byId = Object.fromEntries(wallets.rows.map((r) => [r.user_id, Number(r.freebet_balance)]));
    expect(byId[referrer]).toBe(500);
    expect(byId[referred]).toBe(500);
  });

  it('TEST 3: Background reconciliation sweep picks up stuck referrals and rewards them', async () => {
    const code = await ensureReferralCode(referrer, { firstName: 'Uday' });
    const reg = await processReferralRegistration({
      referrerUserId: referrer,
      referredUserId: referred,
      referralCode: code.code,
    });

    // Put referral in stuck state
    await query(
      `UPDATE referrals SET status = 'REGISTERED', qualification_status = 'PENDING', reward_status = 'PENDING', rewarded_at = NULL WHERE id = $1`,
      [reg.referralId],
    );
    await query(
      `UPDATE wallets SET freebet_balance = 0 WHERE user_id IN ($1, $2)`,
      [referrer, referred],
    );
    await query(
      `DELETE FROM referral_reward_events WHERE referral_id = $1`,
      [reg.referralId],
    );

    // Run reconciliation sweep
    const recon = await reconcilePendingReferrals({ batchSize: 50 });
    expect(recon.success).toBe(true);
    expect(recon.qualified).toBeGreaterThanOrEqual(1);

    // Check dashboard
    const dashboard = await getMyReferralDashboard(referrer);
    expect(dashboard.stats.invited).toBe(1);
    expect(dashboard.stats.qualified).toBe(1);
    expect(dashboard.stats.pending).toBe(0);
    expect(dashboard.stats.rewardsEarned).toBe(500);
  });
});
