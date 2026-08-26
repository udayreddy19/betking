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

  it('allocates referral codes for pre-existing users via backfill', async () => {
    const legacy = 'usr_ref_legacy01';
    await query(
      `INSERT INTO users (user_id, email, password_hash, first_name, status)
       VALUES ($1, $2, 'hash', 'Legacy', 'ACTIVE')
       ON CONFLICT (user_id) DO UPDATE SET status = 'ACTIVE', first_name = 'Legacy';`,
      [legacy, `${legacy}@example.com`],
    );
    await query(`DELETE FROM referral_codes WHERE user_id = $1;`, [legacy]);

    const before = await query(`SELECT 1 FROM referral_codes WHERE user_id = $1`, [legacy]);
    expect(before.rows.length).toBe(0);

    const backfill = await backfillReferralCodesForExistingUsers({ batchSize: 50 });
    expect(backfill.success).toBe(true);
    expect(backfill.created).toBeGreaterThanOrEqual(1);

    const codeInfo = await ensureReferralCode(legacy, { firstName: 'Legacy' });
    expect(codeInfo?.code).toMatch(/^[A-Z0-9]+$/);
    expect(codeInfo?.link).toContain('/register?ref=');
  });
});
