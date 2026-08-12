import { describe, it, expect, beforeEach } from 'vitest';
import { processReferralRegistration, qualifyReferralReward } from '../../lib/referralLoyaltyEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 10 Referral Fraud Guard & Self-Referral Protection Tests', () => {
  const referrer = 'usr_ref_101';
  const referred = 'usr_ref_102';

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [referrer, `${referrer}@example.com`]);
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [referred, `${referred}@example.com`]);
    await query(`DELETE FROM referrals WHERE referrer_user_id IN ($1, $2) OR referred_user_id IN ($1, $2);`, [referrer, referred]);
  });

  it('CRITICAL: self-referral protection -> referrer = referred user throws SELF_REFERRAL_NOT_ALLOWED', async () => {
    await expect(processReferralRegistration({
      referrerUserId: referrer,
      referredUserId: referrer,
      referralCode: 'SELF100',
    })).rejects.toThrow('SELF_REFERRAL_NOT_ALLOWED');
  });

  it('should process referral registration and qualify reward idempotently', async () => {
    const regRes = await processReferralRegistration({
      referrerUserId: referrer,
      referredUserId: referred,
      referralCode: 'FRIEND500',
    });

    expect(regRes.success).toBe(true);
    expect(regRes.status).toBe('REGISTERED');

    const qualRes1 = await qualifyReferralReward({ referredUserId: referred });
    expect(qualRes1.success).toBe(true);
    expect(qualRes1.rewardAmount).toBe(500.00);

    // Second qualification attempt returns qualified: false without duplicating rewards
    const qualRes2 = await qualifyReferralReward({ referredUserId: referred });
    expect(qualRes2.qualified).toBe(false);
  });
});
