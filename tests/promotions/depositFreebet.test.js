import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { query } from '../../db/pg.js';
import {
  calculateDepositFreebetAmount,
  ensureDepositFreebetCampaign,
  upsertDepositFreebetCampaign,
  tryGrantDepositFreebet,
  sendDepositFreebetGrantEmail,
  expireDepositFreebetGrants,
  DEPOSIT_FREEBET_CODE,
} from '../../lib/depositFreebetEngine.mjs';

describe('Deposit free bet calculation', () => {
  it('rejects below minimum', () => {
    const r = calculateDepositFreebetAmount({
      depositAmount: 9999,
      matchPercent: 100,
      maxFreeBet: 10000,
      minDeposit: 10000,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('MINIMUM_DEPOSIT_NOT_MET');
  });

  it('grants 100% up to max', () => {
    expect(calculateDepositFreebetAmount({
      depositAmount: 10000,
      matchPercent: 100,
      maxFreeBet: 10000,
      minDeposit: 10000,
    }).amount).toBe(10000);

    expect(calculateDepositFreebetAmount({
      depositAmount: 15000,
      matchPercent: 100,
      maxFreeBet: 10000,
      minDeposit: 10000,
    }).amount).toBe(10000);
  });

  it('applies percentage then max', () => {
    expect(calculateDepositFreebetAmount({
      depositAmount: 20000,
      matchPercent: 50,
      maxFreeBet: 10000,
      minDeposit: 10000,
    }).amount).toBe(10000);

    expect(calculateDepositFreebetAmount({
      depositAmount: 10000,
      matchPercent: 50,
      maxFreeBet: 5000,
      minDeposit: 10000,
    }).amount).toBe(5000);
  });

  it('caps deposit used when maxEligibleDeposit set', () => {
    expect(calculateDepositFreebetAmount({
      depositAmount: 20000,
      matchPercent: 100,
      maxFreeBet: 50000,
      maxEligibleDeposit: 10000,
      minDeposit: 10000,
    }).amount).toBe(10000);
  });
});

describe('Deposit free bet grants', () => {
  const userId = 'usr_dfb_test_01';
  const depositA = 'dep_dfb_a01';
  const depositB = 'dep_dfb_b02';

  beforeAll(async () => {
    await query(`
      ALTER TABLE promotions
        ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS reward_bucket VARCHAR(16) DEFAULT 'bonus',
        ADD COLUMN IF NOT EXISTS auto_grant_on_deposit BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS eligibility VARCHAR(16) DEFAULT 'ALL',
        ADD COLUMN IF NOT EXISTS email_on_grant BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS freebet_expiry_days INT DEFAULT 7,
        ADD COLUMN IF NOT EXISTS max_eligible_deposit NUMERIC(14,2),
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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
        email_sent_at TIMESTAMPTZ,
        email_message_id VARCHAR(128),
        email_error TEXT,
        email_admin_id VARCHAR(64),
        skip_reason VARCHAR(64),
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT deposit_freebet_grants_deposit_unique UNIQUE (deposit_id)
      )
    `).catch(() => null);
    await query(`
      CREATE TABLE IF NOT EXISTS deposit_freebet_email_log (
        log_id VARCHAR(64) PRIMARY KEY,
        grant_id VARCHAR(64) NOT NULL REFERENCES deposit_freebet_grants(grant_id) ON DELETE CASCADE,
        user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        promotion_id VARCHAR(64) NOT NULL,
        email_to VARCHAR(255),
        template VARCHAR(64) NOT NULL DEFAULT 'deposit_freebet_ready',
        status VARCHAR(16) NOT NULL,
        provider_message_id VARCHAR(128),
        failure_reason TEXT,
        admin_id VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).catch(() => null);
  });

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash, first_name, status)
                 VALUES ($1, $2, 'hash', 'Test', 'ACTIVE')
                 ON CONFLICT (user_id) DO UPDATE SET status = 'ACTIVE'`, [userId, `${userId}@example.com`]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, freebet_balance, currency)
                 VALUES ($1, $2, 0, 0, 0, 'INR')
                 ON CONFLICT (user_id) DO UPDATE SET freebet_balance = 0, balance = 0`, [`wal_${userId}`, userId]);
    await query(`DELETE FROM deposit_freebet_email_log WHERE user_id = $1`, [userId]).catch(() => null);
    await query(`DELETE FROM deposit_freebet_grants WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM deposits WHERE user_id = $1`, [userId]).catch(() => null);
    await query(`UPDATE promotions SET status = 'PAUSED' WHERE COALESCE(is_targeted, false) = true`).catch(() => null);
    await ensureDepositFreebetCampaign();
    await upsertDepositFreebetCampaign({
      enabled: true,
      name: 'Deposit 100% Free Bet',
      minDeposit: 10000,
      matchPercent: 100,
      maxFreeBet: 10000,
      maxEligibleDeposit: 10000,
      eligibility: 'ALL',
      onePerUser: true,
      emailOnGrant: false,
      freebetExpiryDays: 7,
    });
  });

  async function seedCapturedDeposit(depositId, amount) {
    await query(
      `INSERT INTO deposits (id, deposit_id, user_id, order_id, amount, currency, status, created_at)
       VALUES ($1, $1, $2, $3, $4, 'INR', 'CAPTURED', NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'CAPTURED', amount = EXCLUDED.amount`,
      [depositId, userId, `ord_${depositId}`, amount],
    );
  }

  it('does not grant below minimum deposit', async () => {
    await seedCapturedDeposit(depositA, 9999);
    const r = await tryGrantDepositFreebet({ userId, depositId: depositA, amount: 9999, autoEmail: false });
    expect(r.granted).toBe(false);
    expect(r.reason).toBe('MINIMUM_DEPOSIT_NOT_MET');
  });

  it('grants ₹10,000 freebet on ₹10,000 deposit', async () => {
    await seedCapturedDeposit(depositA, 10000);
    const r = await tryGrantDepositFreebet({ userId, depositId: depositA, amount: 10000, autoEmail: false });
    expect(r.granted).toBe(true);
    expect(r.amount).toBe(10000);
    const wal = await query(`SELECT freebet_balance FROM wallets WHERE user_id = $1`, [userId]);
    expect(Number(wal.rows[0].freebet_balance)).toBe(10000);
  });

  it('caps at max freebet for larger deposits', async () => {
    await seedCapturedDeposit(depositA, 15000);
    const r = await tryGrantDepositFreebet({ userId, depositId: depositA, amount: 15000, autoEmail: false });
    expect(r.granted).toBe(true);
    expect(r.amount).toBe(10000);
  });

  it('is idempotent for the same deposit', async () => {
    await seedCapturedDeposit(depositA, 10000);
    const r1 = await tryGrantDepositFreebet({ userId, depositId: depositA, amount: 10000, autoEmail: false });
    const r2 = await tryGrantDepositFreebet({ userId, depositId: depositA, amount: 10000, autoEmail: false });
    expect(r1.granted).toBe(true);
    expect(r2.granted).toBe(false);
    expect(r2.reason).toBe('ALREADY_REWARDED');
    const wal = await query(`SELECT freebet_balance FROM wallets WHERE user_id = $1`, [userId]);
    expect(Number(wal.rows[0].freebet_balance)).toBe(10000);
  });

  it('blocks second grant when one-per-user', async () => {
    await seedCapturedDeposit(depositA, 10000);
    await tryGrantDepositFreebet({ userId, depositId: depositA, amount: 10000, autoEmail: false });
    await seedCapturedDeposit(depositB, 10000);
    const r2 = await tryGrantDepositFreebet({ userId, depositId: depositB, amount: 10000, autoEmail: false });
    expect(r2.granted).toBe(false);
    expect(r2.reason).toBe('ALREADY_REWARDED');
  });

  it('does not grant when promotion disabled', async () => {
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
    await seedCapturedDeposit(depositA, 10000);
    const r = await tryGrantDepositFreebet({ userId, depositId: depositA, amount: 10000, autoEmail: false });
    expect(r.granted).toBe(false);
    expect(['PROMOTION_INACTIVE', 'USER_NOT_ELIGIBLE']).toContain(r.reason);
  });

  it('uses updated percentage for new grants', async () => {
    await upsertDepositFreebetCampaign({
      enabled: true,
      name: 'Deposit 50% Free Bet',
      minDeposit: 10000,
      matchPercent: 50,
      maxFreeBet: 5000,
      maxEligibleDeposit: null,
      eligibility: 'ALL',
      onePerUser: true,
      emailOnGrant: false,
      freebetExpiryDays: 7,
    });
    await seedCapturedDeposit(depositA, 10000);
    const r = await tryGrantDepositFreebet({ userId, depositId: depositA, amount: 10000, autoEmail: false });
    expect(r.granted).toBe(true);
    expect(r.amount).toBe(5000);
  });

  it('expires unused freebet and claws back balance', async () => {
    await seedCapturedDeposit(depositA, 10000);
    const r = await tryGrantDepositFreebet({ userId, depositId: depositA, amount: 10000, autoEmail: false });
    expect(r.granted).toBe(true);
    await query(
      `UPDATE deposit_freebet_grants SET expires_at = NOW() - INTERVAL '1 minute' WHERE grant_id = $1`,
      [r.grantId],
    );
    const exp = await expireDepositFreebetGrants(query, userId);
    expect(exp.expiredFreebet).toBeGreaterThan(0);
    const wal = await query(`SELECT freebet_balance FROM wallets WHERE user_id = $1`, [userId]);
    expect(Number(wal.rows[0].freebet_balance)).toBe(0);
    const g = await query(`SELECT status FROM deposit_freebet_grants WHERE grant_id = $1`, [r.grantId]);
    expect(g.rows[0].status).toBe('EXPIRED');
  });

  it('email failure does not remove the reward', async () => {
    await seedCapturedDeposit(depositA, 10000);
    const r = await tryGrantDepositFreebet({ userId, depositId: depositA, amount: 10000, autoEmail: false });
    expect(r.granted).toBe(true);
    // send may fail without SMTP — reward must remain
    try {
      await sendDepositFreebetGrantEmail({ grantId: r.grantId, adminId: 'admin_test' });
    } catch {
      /* ignore */
    }
    const wal = await query(`SELECT freebet_balance FROM wallets WHERE user_id = $1`, [userId]);
    expect(Number(wal.rows[0].freebet_balance)).toBe(10000);
    const g = await query(`SELECT freebet_amount, status FROM deposit_freebet_grants WHERE grant_id = $1`, [r.grantId]);
    expect(Number(g.rows[0].freebet_amount)).toBe(10000);
    expect(g.rows[0].status).toBe('AVAILABLE');
  });

  it('campaign code is stable', async () => {
    const c = await ensureDepositFreebetCampaign();
    expect(c.code).toBe(DEPOSIT_FREEBET_CODE);
  });
});
