import { describe, it, expect, beforeEach } from 'vitest';
import {
  processReferralRegistration,
  qualifyReferralReward,
  ensureReferralCode,
  attributeReferralOnSignup,
  assertNoReferralPromoConflict,
  normalizeReferralCode,
  backfillReferralCodesForExistingUsers,
} from '../../lib/referralLoyaltyEngine.mjs';
import { query } from '../../db/pg.js';

describe('Referral program', () => {
  const referrer = 'usr_ref_a01';
  const referred = 'usr_ref_b02';

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash, first_name) VALUES ($1, $2, 'hash', 'Uday') ON CONFLICT (user_id) DO NOTHING;`, [referrer, `${referrer}@example.com`]);
    await query(`INSERT INTO users (user_id, email, password_hash, first_name) VALUES ($1, $2, 'hash', 'Rahul') ON CONFLICT (user_id) DO NOTHING;`, [referred, `${referred}@example.com`]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, freebet_balance, currency)
                 VALUES ($1, $2, 0, 0, 0, 'INR') ON CONFLICT (user_id) DO UPDATE SET freebet_balance = 0, balance = 0;`, [`wal_${referrer}`, referrer]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, freebet_balance, currency)
                 VALUES ($1, $2, 0, 0, 0, 'INR') ON CONFLICT (user_id) DO UPDATE SET freebet_balance = 0, balance = 0;`, [`wal_${referred}`, referred]);
    await query(`DELETE FROM referral_reward_events WHERE beneficiary_user_id IN ($1, $2);`, [referrer, referred]).catch(() => null);
    await query(`DELETE FROM referrals WHERE referrer_user_id IN ($1, $2) OR referred_user_id IN ($1, $2);`, [referrer, referred]);
    await query(`DELETE FROM referral_codes WHERE user_id IN ($1, $2);`, [referrer, referred]).catch(() => null);
    await query(`DELETE FROM signup_promo_redemptions WHERE user_id = $1;`, [referred]).catch(() => null);
  });

  it('normalizes referral codes to uppercase', () => {
    expect(normalizeReferralCode(' uday-123 ')).toBe('UDAY123');
  });

  it('CRITICAL: self-referral protection', async () => {
    await expect(processReferralRegistration({
      referrerUserId: referrer,
      referredUserId: referrer,
      referralCode: 'SELF100',
    })).rejects.toThrow('SELF_REFERRAL_NOT_ALLOWED');
  });

  it('allocates unique referral codes and attributes signup', async () => {
    const code = await ensureReferralCode(referrer, { firstName: 'Uday' });
    expect(code.code).toMatch(/^[A-Z0-9]+$/);

    const attr = await attributeReferralOnSignup({
      referredUserId: referred,
      referralCode: code.code,
    });
    expect(attr.success).toBe(true);
    expect(attr.status).toBe('REGISTERED');

    const conflict = await assertNoReferralPromoConflict(referred).then(() => null).catch((e) => e);
    expect(conflict?.code).toBe('REFERRAL_PROMO_CONFLICT');
  });

  it('grants freebets once and is idempotent', async () => {
    await processReferralRegistration({
      referrerUserId: referrer,
      referredUserId: referred,
      referralCode: 'FRIEND500',
    });

    const q1 = await qualifyReferralReward({ referredUserId: referred, depositAmount: 100 });
    expect(q1.success).toBe(true);
    expect(q1.rewardAmount).toBe(500);

    const wallets = await query(
      `SELECT user_id, freebet_balance FROM wallets WHERE user_id IN ($1, $2)`,
      [referrer, referred],
    );
    const byId = Object.fromEntries(wallets.rows.map((r) => [r.user_id, Number(r.freebet_balance)]));
    expect(byId[referred]).toBe(500);
    expect(byId[referrer]).toBe(500);

    const q2 = await qualifyReferralReward({ referredUserId: referred, depositAmount: 100 });
    expect(q2.qualified).toBe(false);

    const wallets2 = await query(
      `SELECT user_id, freebet_balance FROM wallets WHERE user_id IN ($1, $2)`,
      [referrer, referred],
    );
    const byId2 = Object.fromEntries(wallets2.rows.map((r) => [r.user_id, Number(r.freebet_balance)]));
    expect(byId2[referred]).toBe(500);
    expect(byId2[referrer]).toBe(500);
  });

  it('rejects duplicate referred user attribution', async () => {
    await processReferralRegistration({
      referrerUserId: referrer,
      referredUserId: referred,
      referralCode: 'ONCE',
    });
    const second = await processReferralRegistration({
      referrerUserId: referrer,
      referredUserId: referred,
      referralCode: 'ONCE2',
    });
    expect(second.duplicate).toBe(true);
  });

  it('blocks referral attribution after signup promo claim', async () => {
    const code = await ensureReferralCode(referrer, { firstName: 'Uday' });
    await query(
      `INSERT INTO signup_promo_codes (code_id, code, name, reward_type, amount, is_active)
       VALUES ('code_test_welcome', 'WELCOME_TEST', 'Welcome Test', 'freebet', 100, true)
       ON CONFLICT (code_id) DO NOTHING`,
    );
    await query(`DELETE FROM signup_promo_redemptions WHERE user_id = $1`, [referred]).catch(() => null);
    await query(
      `INSERT INTO signup_promo_redemptions (redemption_id, code_id, user_id, reward_type, amount)
       VALUES ($1, 'code_test_welcome', $2, 'freebet', 100)`,
      [`spr_${referred}`, referred],
    );

    await expect(attributeReferralOnSignup({
      referredUserId: referred,
      referralCode: code.code,
    })).rejects.toMatchObject({ code: 'REFERRAL_PROMO_CONFLICT' });
  });

  it('blocks signup promo when referral already attributed', async () => {
    await processReferralRegistration({
      referrerUserId: referrer,
      referredUserId: referred,
      referralCode: 'HASREF',
    });
    await expect(assertNoReferralPromoConflict(referred))
      .rejects.toMatchObject({ code: 'REFERRAL_PROMO_CONFLICT' });
  });

  it('blocks referral reward when signup promo already claimed', async () => {
    await processReferralRegistration({
      referrerUserId: referrer,
      referredUserId: referred,
      referralCode: 'THENPROMO',
    });
    await query(
      `INSERT INTO signup_promo_codes (code_id, code, name, reward_type, amount, is_active)
       VALUES ('code_test_welcome2', 'WELCOME_TEST2', 'Welcome Test 2', 'freebet', 100, true)
       ON CONFLICT (code_id) DO NOTHING`,
    );
    await query(`DELETE FROM signup_promo_redemptions WHERE user_id = $1`, [referred]).catch(() => null);
    await query(
      `INSERT INTO signup_promo_redemptions (redemption_id, code_id, user_id, reward_type, amount)
       VALUES ($1, 'code_test_welcome2', $2, 'freebet', 100)`,
      [`spr2_${referred}`, referred],
    );

    const q = await qualifyReferralReward({ referredUserId: referred, depositAmount: 100 });
    expect(q.qualified).toBe(false);
    expect(String(q.reason || '')).toMatch(/promo/i);
  });
});
