import { describe, it, expect, beforeEach } from 'vitest';
import {
  processReferralRegistration,
  qualifyReferralReward,
  adminApproveReferral,
  adminRejectReferral,
  clawbackReferralRewards,
  __resetReferralConfigCacheForTests,
  __setReferralConfigForTests,
} from '../../lib/referralLoyaltyEngine.mjs';
import { query } from '../../db/pg.js';

describe('Referral gates + fraud + clawback', () => {
  const referrer = 'usr_gate_ref_a';
  const referred = 'usr_gate_ref_b';

  beforeEach(async () => {
    __resetReferralConfigCacheForTests();
    __setReferralConfigForTests({
      requireKyc: true,
      minDeposit: 100,
      requireFirstBet: false,
      playCommissionEnabled: false,
    });
    await query(`INSERT INTO users (user_id, email, password_hash, first_name) VALUES ($1, $2, 'hash', 'A') ON CONFLICT (user_id) DO NOTHING;`, [referrer, `${referrer}@example.com`]);
    await query(`INSERT INTO users (user_id, email, password_hash, first_name) VALUES ($1, $2, 'hash', 'B') ON CONFLICT (user_id) DO NOTHING;`, [referred, `${referred}@example.com`]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, freebet_balance, currency)
                 VALUES ($1, $2, 0, 0, 0, 'INR') ON CONFLICT (user_id) DO UPDATE SET freebet_balance = 0, balance = 0, bonus_balance = 0;`, [`wal_${referrer}`, referrer]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, freebet_balance, currency)
                 VALUES ($1, $2, 0, 0, 0, 'INR') ON CONFLICT (user_id) DO UPDATE SET freebet_balance = 0, balance = 0, bonus_balance = 0;`, [`wal_${referred}`, referred]);
    await query(`DELETE FROM referral_reward_events WHERE beneficiary_user_id IN ($1, $2);`, [referrer, referred]).catch(() => null);
    await query(`DELETE FROM referrals WHERE referrer_user_id IN ($1, $2) OR referred_user_id IN ($1, $2);`, [referrer, referred]);
    await query(`DELETE FROM deposits WHERE user_id = $1`, [referred]).catch(() => null);
    await query(`DELETE FROM user_profiles WHERE user_id = $1`, [referred]).catch(() => null);
  });

  it('blocks qualify until KYC + min deposit', async () => {
    const reg = await processReferralRegistration({
      referrerUserId: referrer,
      referredUserId: referred,
      referralCode: 'GATE100',
    });
    expect(reg.reward?.qualified).not.toBe(true);

    let q = await qualifyReferralReward({ referredUserId: referred });
    expect(q.qualified).toBe(false);
    expect(['KYC required', 'min_deposit']).toContain(q.reason);

    await query(
      `INSERT INTO user_profiles (user_id, kyc_status) VALUES ($1, 'VERIFIED')
       ON CONFLICT (user_id) DO UPDATE SET kyc_status = 'VERIFIED'`,
      [referred],
    ).catch(async () => {
      await query(`UPDATE user_profiles SET kyc_status = 'VERIFIED' WHERE user_id = $1`, [referred]);
    });

    q = await qualifyReferralReward({ referredUserId: referred });
    expect(q.qualified).toBe(false);
    expect(q.reason).toBe('min_deposit');

    await query(
      `INSERT INTO deposits (id, deposit_id, user_id, order_id, amount, status)
       VALUES ($1, $2, $3, $4, 150, 'PAID')
       ON CONFLICT DO NOTHING`,
      [`dep_${referred}`, `dep_${referred}`, referred, `ord_${referred}`],
    );

    __setReferralConfigForTests({
      requireKyc: true,
      minDeposit: 100,
      requireFirstBet: false,
    });
    q = await qualifyReferralReward({ referredUserId: referred });
    expect(q.success || q.qualified).toBe(true);
  });

  it('rejects and clawbacks rewarded referral', async () => {
    __setReferralConfigForTests({ requireKyc: false, minDeposit: 0 });
    const reg = await processReferralRegistration({
      referrerUserId: referrer,
      referredUserId: referred,
      referralCode: 'CLAW1',
    });
    expect(reg.reward?.success).toBe(true);
    const referralId = reg.referralId;

    const claw = await clawbackReferralRewards({
      referralId,
      reason: 'test_clawback',
      adminId: 'test',
    });
    expect(claw.success).toBe(true);
    expect(claw.count).toBeGreaterThan(0);

    const wallets = await query(`SELECT freebet_balance FROM wallets WHERE user_id = $1`, [referrer]);
    expect(Number(wallets.rows[0]?.freebet_balance || 0)).toBe(0);
  });

  it('admin approve clears fraud hold path', async () => {
    __setReferralConfigForTests({ requireKyc: false, minDeposit: 0 });
    const reg = await processReferralRegistration({
      referrerUserId: referrer,
      referredUserId: referred,
      referralCode: 'APR1',
    });
    await query(`UPDATE referrals SET status = 'FRAUD_REVIEW' WHERE id = $1`, [reg.referralId]);
    const ap = await adminApproveReferral({ referralId: reg.referralId, adminId: 'test' });
    expect(ap.success).toBe(true);
  });
});
