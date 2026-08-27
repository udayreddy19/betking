import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { query } from '../../db/pg.js';
import {
  calculateDepositFreebetAmount,
  createTargetedDepositFreebetCampaign,
  assignUsersToDepositFreebetCampaign,
  setTargetedDepositFreebetStatus,
  tryGrantDepositFreebet,
  ensureDepositFreebetCampaign,
  upsertDepositFreebetCampaign,
} from '../../lib/depositFreebetEngine.mjs';

describe('Targeted deposit free bet', () => {
  const userA = 'usr_tdfb_a';
  const userB = 'usr_tdfb_b';
  const userD = 'usr_tdfb_d';
  let campaignId;

  beforeAll(async () => {
    await query(`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS is_targeted BOOLEAN NOT NULL DEFAULT FALSE`).catch(() => null);
    await query(`
      CREATE TABLE IF NOT EXISTS deposit_freebet_campaign_users (
        assignment_id VARCHAR(64) PRIMARY KEY,
        promotion_id VARCHAR(64) NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
        user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        assigned_by VARCHAR(64),
        offer_email_status VARCHAR(16) NOT NULL DEFAULT 'NONE',
        offer_email_sent_at TIMESTAMPTZ,
        offer_email_message_id VARCHAR(128),
        offer_email_error TEXT,
        UNIQUE (promotion_id, user_id)
      )
    `).catch(() => null);
    await query(`
      CREATE TABLE IF NOT EXISTS deposit_freebet_grants (
        grant_id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        promotion_id VARCHAR(64) NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
        deposit_id VARCHAR(64) NOT NULL,
        deposit_amount NUMERIC(14,2) NOT NULL,
        freebet_amount NUMERIC(14,2) NOT NULL,
        remaining_amount NUMERIC(14,2) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'AVAILABLE',
        email_status VARCHAR(16) NOT NULL DEFAULT 'NONE',
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT deposit_freebet_grants_deposit_unique UNIQUE (deposit_id)
      )
    `).catch(() => null);
  });

  async function ensureUser(userId) {
    await query(
      `INSERT INTO users (user_id, email, password_hash, first_name, status)
       VALUES ($1, $2, 'hash', 'T', 'ACTIVE')
       ON CONFLICT (user_id) DO UPDATE SET status = 'ACTIVE'`,
      [userId, `${userId}@example.com`],
    );
    await query(
      `INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, freebet_balance, currency)
       VALUES ($1, $2, 0, 0, 0, 'INR')
       ON CONFLICT (user_id) DO UPDATE SET freebet_balance = 0, balance = 0`,
      [`wal_${userId}`, userId],
    );
  }

  beforeEach(async () => {
    for (const u of [userA, userB, userD]) await ensureUser(u);
    await query(`DELETE FROM deposit_freebet_grants WHERE user_id IN ($1,$2,$3)`, [userA, userB, userD]);
    await query(`DELETE FROM deposit_freebet_campaign_users WHERE user_id IN ($1,$2,$3)`, [userA, userB, userD]).catch(() => null);
    await query(`DELETE FROM deposits WHERE user_id IN ($1,$2,$3)`, [userA, userB, userD]).catch(() => null);

    // Isolate from global deposit freebet campaign (sibling test suite)
    await ensureDepositFreebetCampaign();
    await upsertDepositFreebetCampaign({
      enabled: false,
      name: 'Deposit 100% Free Bet',
      minDeposit: 10000,
      matchPercent: 100,
      maxFreeBet: 10000,
      eligibility: 'ALL',
      onePerUser: true,
      emailOnGrant: false,
      freebetExpiryDays: 7,
    });
    // Hard-pause every non-targeted auto-grant freebet so unselected users cannot fall through
    await query(
      `UPDATE promotions SET status = 'PAUSED'
       WHERE COALESCE(reward_bucket, 'bonus') = 'freebet'
         AND COALESCE(auto_grant_on_deposit, false) = true
         AND COALESCE(is_targeted, false) = false`,
    ).catch(() => null);
    await query(`UPDATE promotions SET status = 'PAUSED' WHERE COALESCE(is_targeted, false) = true`).catch(() => null);

    const campaign = await createTargetedDepositFreebetCampaign({
      name: 'VIP 100% Deposit Offer',
      minDeposit: 10000,
      matchPercent: 100,
      maxFreeBet: 10000,
      onePerUser: true,
      emailOnGrant: false,
      freebetExpiryDays: 7,
      userIds: [userA, userB],
    }, { adminId: 'admin_test' });
    campaignId = campaign.id;
    await setTargetedDepositFreebetStatus(campaignId, 'ACTIVE');
  });

  async function seedDeposit(userId, depositId, amount) {
    await query(
      `INSERT INTO deposits (id, deposit_id, user_id, order_id, amount, currency, status, created_at)
       VALUES ($1, $1, $2, $3, $4, 'INR', 'CAPTURED', NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'CAPTURED', amount = EXCLUDED.amount`,
      [depositId, userId, `ord_${depositId}`, amount],
    );
  }

  it('selected user deposits ₹10,000 → ₹10,000 free bet', async () => {
    await seedDeposit(userA, 'dep_tdfb_a10k', 10000);
    const r = await tryGrantDepositFreebet({
      userId: userA,
      depositId: 'dep_tdfb_a10k',
      amount: 10000,
      autoEmail: false,
    });
    expect(r.granted).toBe(true);
    expect(r.amount).toBe(10000);
    expect(r.targeted).toBe(true);
    const wal = await query(`SELECT freebet_balance FROM wallets WHERE user_id = $1`, [userA]);
    expect(Number(wal.rows[0].freebet_balance)).toBe(10000);
  });

  it('selected user deposits ₹15,000 → capped at ₹10,000', async () => {
    await seedDeposit(userA, 'dep_tdfb_a15k', 15000);
    const r = await tryGrantDepositFreebet({
      userId: userA,
      depositId: 'dep_tdfb_a15k',
      amount: 15000,
      autoEmail: false,
    });
    expect(r.granted).toBe(true);
    expect(r.amount).toBe(10000);
  });

  it('selected user deposits ₹8,000 → no reward', async () => {
    await seedDeposit(userA, 'dep_tdfb_a8k', 8000);
    const r = await tryGrantDepositFreebet({
      userId: userA,
      depositId: 'dep_tdfb_a8k',
      amount: 8000,
      autoEmail: false,
    });
    expect(r.granted).toBe(false);
    expect(r.reason).toBe('MINIMUM_DEPOSIT_NOT_MET');
  });

  it('unselected user deposits ₹10,000 → no reward', async () => {
    await seedDeposit(userD, 'dep_tdfb_d10k', 10000);
    const r = await tryGrantDepositFreebet({
      userId: userD,
      depositId: 'dep_tdfb_d10k',
      amount: 10000,
      autoEmail: false,
    });
    expect(r.granted).toBe(false);
    expect(r.reason).toBe('USER_NOT_ELIGIBLE');
  });

  it('duplicate deposit event → one reward only', async () => {
    await seedDeposit(userA, 'dep_tdfb_dup', 10000);
    const r1 = await tryGrantDepositFreebet({
      userId: userA, depositId: 'dep_tdfb_dup', amount: 10000, autoEmail: false,
    });
    const r2 = await tryGrantDepositFreebet({
      userId: userA, depositId: 'dep_tdfb_dup', amount: 10000, autoEmail: false,
    });
    expect(r1.granted).toBe(true);
    expect(r2.granted).toBe(false);
    expect(r2.reason).toBe('ALREADY_REWARDED');
    const wal = await query(`SELECT freebet_balance FROM wallets WHERE user_id = $1`, [userA]);
    expect(Number(wal.rows[0].freebet_balance)).toBe(10000);
  });

  it('paused campaign → no reward', async () => {
    await setTargetedDepositFreebetStatus(campaignId, 'PAUSED');
    await seedDeposit(userA, 'dep_tdfb_paused', 10000);
    const r = await tryGrantDepositFreebet({
      userId: userA, depositId: 'dep_tdfb_paused', amount: 10000, autoEmail: false,
    });
    expect(r.granted).toBe(false);
  });

  it('one claim per user on campaign', async () => {
    await seedDeposit(userA, 'dep_tdfb_once1', 10000);
    await tryGrantDepositFreebet({
      userId: userA, depositId: 'dep_tdfb_once1', amount: 10000, autoEmail: false,
    });
    await seedDeposit(userA, 'dep_tdfb_once2', 10000);
    const r2 = await tryGrantDepositFreebet({
      userId: userA, depositId: 'dep_tdfb_once2', amount: 10000, autoEmail: false,
    });
    expect(r2.granted).toBe(false);
    expect(r2.reason).toBe('ALREADY_REWARDED');
  });

  it('assignUsers adds more selected users', async () => {
    await assignUsersToDepositFreebetCampaign({
      promotionId: campaignId,
      userIds: [userD],
      adminId: 'admin_test',
    });
    await seedDeposit(userD, 'dep_tdfb_d_now', 10000);
    const r = await tryGrantDepositFreebet({
      userId: userD, depositId: 'dep_tdfb_d_now', amount: 10000, autoEmail: false,
    });
    expect(r.granted).toBe(true);
  });

  it('calc helper still works for caps', () => {
    expect(calculateDepositFreebetAmount({
      depositAmount: 20000, matchPercent: 100, maxFreeBet: 10000, minDeposit: 10000,
    }).amount).toBe(10000);
  });
});
