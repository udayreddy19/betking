import { describe, it, expect, beforeEach } from 'vitest';
import {
  processReferralRegistration,
  creditReferrerPlayCommission,
  computePlayCommissionAmount,
  __resetReferralConfigCacheForTests,
  __setReferralConfigForTests,
} from '../../lib/referralLoyaltyEngine.mjs';
import { query } from '../../db/pg.js';

describe('Referral play commission (5% of stake)', () => {
  const referrer = 'usr_play_ref_a';
  const referred = 'usr_play_ref_b';

  beforeEach(async () => {
    __resetReferralConfigCacheForTests();
    __setReferralConfigForTests({
      requireKyc: false,
      minDeposit: 0,
      requireFirstBet: false,
      playCommissionEnabled: true,
      playCommissionRate: 0.05,
    });
    await query(`INSERT INTO users (user_id, email, password_hash, first_name) VALUES ($1, $2, 'hash', 'Inviter') ON CONFLICT (user_id) DO NOTHING;`, [referrer, `${referrer}@example.com`]);
    await query(`INSERT INTO users (user_id, email, password_hash, first_name) VALUES ($1, $2, 'hash', 'Friend') ON CONFLICT (user_id) DO NOTHING;`, [referred, `${referred}@example.com`]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, freebet_balance, currency)
                 VALUES ($1, $2, 0, 0, 0, 'INR') ON CONFLICT (user_id) DO UPDATE SET freebet_balance = 0, balance = 0, bonus_balance = 0;`, [`wal_${referrer}`, referrer]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, freebet_balance, currency)
                 VALUES ($1, $2, 0, 0, 0, 'INR') ON CONFLICT (user_id) DO UPDATE SET freebet_balance = 0, balance = 0, bonus_balance = 0;`, [`wal_${referred}`, referred]);
    await query(`DELETE FROM referral_reward_events WHERE beneficiary_user_id IN ($1, $2);`, [referrer, referred]).catch(() => null);
    await query(`DELETE FROM referrals WHERE referrer_user_id IN ($1, $2) OR referred_user_id IN ($1, $2);`, [referrer, referred]);
    await query(`DELETE FROM referral_codes WHERE user_id IN ($1, $2);`, [referrer, referred]).catch(() => null);
  });

  it('computes 5% of stake to 2dp', () => {
    expect(computePlayCommissionAmount(1000, 0.05)).toBe(50);
    expect(computePlayCommissionAmount(33, 0.05)).toBe(1.65);
    expect(computePlayCommissionAmount(0, 0.05)).toBe(0);
  });

  it('credits referrer 5% freebet when referred friend settles a cash bet', async () => {
    await processReferralRegistration({
      referrerUserId: referrer,
      referredUserId: referred,
      referralCode: 'PLAY5PCT',
    });

    const before = await query(`SELECT freebet_balance FROM wallets WHERE user_id = $1`, [referrer]);
    const base = Number(before.rows[0]?.freebet_balance || 0);

    const res = await creditReferrerPlayCommission({
      betId: 'bet_play_comm_1',
      referredUserId: referred,
      stake: 1000,
      fundSource: 'cash',
      outcome: 'LOST',
    });
    expect(res.credited).toBe(true);
    expect(res.amount).toBe(50);

    const after = await query(`SELECT freebet_balance FROM wallets WHERE user_id = $1`, [referrer]);
    expect(Number(after.rows[0]?.freebet_balance)).toBe(base + 50);

    const dup = await creditReferrerPlayCommission({
      betId: 'bet_play_comm_1',
      referredUserId: referred,
      stake: 1000,
      fundSource: 'cash',
      outcome: 'WON',
    });
    expect(dup.duplicate || !dup.credited).toBe(true);

    const afterDup = await query(`SELECT freebet_balance FROM wallets WHERE user_id = $1`, [referrer]);
    expect(Number(afterDup.rows[0]?.freebet_balance)).toBe(base + 50);
  });

  it('skips freebet stakes and void outcomes', async () => {
    await processReferralRegistration({
      referrerUserId: referrer,
      referredUserId: referred,
      referralCode: 'PLAYSKIP',
    });

    const skipFreebet = await creditReferrerPlayCommission({
      betId: 'bet_play_fb',
      referredUserId: referred,
      stake: 500,
      fundSource: 'freebet',
      outcome: 'WON',
    });
    expect(skipFreebet.credited).toBe(false);
    expect(skipFreebet.reason).toBe('non_cash_stake');

    const skipVoid = await creditReferrerPlayCommission({
      betId: 'bet_play_void',
      referredUserId: referred,
      stake: 500,
      fundSource: 'cash',
      outcome: 'VOID',
    });
    expect(skipVoid.credited).toBe(false);
    expect(skipVoid.reason).toBe('outcome_not_play');
  });
});
