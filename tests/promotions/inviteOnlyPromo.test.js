import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { query } from '../../db/pg.js';
import {
  createSignupPromoCode,
  claimSignupPromo,
  sendSignupPromoInvites,
  normalizeInviteEmail,
} from '../../lib/signupPromoCodes.mjs';

describe('Invite-only signup promo codes', () => {
  const userId = 'usr_invite_promo_01';
  const email = 'invited.player@example.com';
  let codeId;

  beforeAll(async () => {
    await query(`ALTER TABLE signup_promo_codes ADD COLUMN IF NOT EXISTS is_invite_only BOOLEAN NOT NULL DEFAULT FALSE`).catch(() => null);
    await query(`
      CREATE TABLE IF NOT EXISTS signup_promo_invites (
        invite_id VARCHAR(64) PRIMARY KEY,
        code_id VARCHAR(64) NOT NULL REFERENCES signup_promo_codes(code_id) ON DELETE CASCADE,
        email_normalized VARCHAR(255) NOT NULL,
        user_id VARCHAR(64) REFERENCES users(user_id) ON DELETE SET NULL,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sent_by VARCHAR(64),
        provider_message_id VARCHAR(128),
        status VARCHAR(16) NOT NULL DEFAULT 'SENT',
        failure_reason TEXT,
        UNIQUE (code_id, email_normalized)
      )
    `).catch(() => null);
  });

  beforeEach(async () => {
    await query(
      `INSERT INTO users (user_id, email, password_hash, first_name, status)
       VALUES ($1, $2, 'hash', 'Invitee', 'ACTIVE')
       ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, status = 'ACTIVE'`,
      [userId, email],
    );
    await query(
      `INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, freebet_balance, currency)
       VALUES ($1, $2, 0, 0, 0, 'INR')
       ON CONFLICT (user_id) DO UPDATE SET freebet_balance = 0, bonus_balance = 0, balance = 0`,
      [`wal_${userId}`, userId],
    );
    await query(`DELETE FROM signup_promo_redemptions WHERE user_id = $1`, [userId]).catch(() => null);
    await query(`DELETE FROM referrals WHERE referred_user_id = $1`, [userId]).catch(() => null);
  });

  it('normalizes invite emails', () => {
    expect(normalizeInviteEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
  });

  it('blocks claim until email is invited', async () => {
    const created = await createSignupPromoCode({
      code: `PRIV${Date.now().toString().slice(-6)}`,
      name: 'Private freebet',
      rewardType: 'freebet',
      amount: 500,
      isActive: true,
      inviteOnly: true,
      maxPerUser: 1,
    });
    codeId = created.id;

    await expect(claimSignupPromo(userId, created.code)).rejects.toMatchObject({
      code: 'PROMO_INVITE_REQUIRED',
    });

    await query(
      `INSERT INTO signup_promo_invites (invite_id, code_id, email_normalized, user_id, status)
       VALUES ($1, $2, $3, $4, 'SENT')
       ON CONFLICT (code_id, email_normalized) DO UPDATE SET
         status = 'SENT',
         user_id = EXCLUDED.user_id`,
      [`spi_test_${userId}_${Date.now()}`, codeId, normalizeInviteEmail(email), userId],
    );

    const claimed = await claimSignupPromo(userId, created.code);
    expect(claimed.code).toBe(created.code);
    expect(Number(claimed.amount)).toBe(500);
    const wal = await query(`SELECT freebet_balance FROM wallets WHERE user_id = $1`, [userId]);
    expect(Number(wal.rows[0].freebet_balance)).toBe(500);
  });

  it('send invites records allowlist even if SMTP fails in test', async () => {
    const created = await createSignupPromoCode({
      code: `MAIL${Date.now().toString().slice(-6)}`,
      name: 'Mail test',
      rewardType: 'freebet',
      amount: 100,
      isActive: true,
      inviteOnly: true,
    });
    const result = await sendSignupPromoInvites({
      codeId: created.id,
      emails: [email, 'other@example.com'],
      adminId: 'admin_test',
    });
    expect(result.sent + result.failed).toBe(2);
    const invites = await query(
      `SELECT email_normalized FROM signup_promo_invites WHERE code_id = $1 ORDER BY email_normalized`,
      [created.id],
    );
    expect(invites.rows.map((r) => r.email_normalized)).toEqual([
      email,
      'other@example.com',
    ]);
  });
});
