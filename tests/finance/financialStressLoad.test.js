import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { depositEngine } from '../../lib/depositEngine.mjs';
import { withdrawalEngine } from '../../lib/withdrawalEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 6 Financial Concurrency & Load Tests', () => {
  const userId = 'usr_fstress_100';
  const walletId = 'w_fstress_100';
  const webhookSecret = 'test_webhook_secret';

  beforeEach(async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
    process.env.NODE_ENV = 'test';
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userId, `${userId}@example.com`]);
    await query(`DELETE FROM financial_discrepancies WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM ledger_entries WHERE wallet_id IN (SELECT wallet_id FROM wallets WHERE user_id = $1);`, [userId]);
    await query(`DELETE FROM deposits WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM withdrawals WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM transactions WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM wallets WHERE user_id = $1;`, [userId]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, reserved_balance, currency) VALUES ($1, $2, 1000.00, 0.00, 'INR');`, [walletId, userId]);
  });

  it('CONCURRENCY: 100 concurrent deposits (₹100 each) -> exact balance ₹11,000.00 & 100 ledger entries', async () => {
    const runTag = Date.now();
    const reqPromises = [];

    for (let i = 0; i < 100; i++) {
      const paymentId = `pay_stress_${runTag}_${i}`;
      const orderId = `order_stress_${runTag}_${i}`;
      const depositId = `dep_stress_${runTag}_${i}`;
      await query(
        `INSERT INTO deposits (id, deposit_id, user_id, order_id, amount, currency, status, created_at)
         VALUES ($1, $2, $3, $4, 100, 'INR', 'CREATED', NOW())`,
        [depositId, depositId, userId, orderId],
      );
      const payload = {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            amount: 10000, // ₹100.00
            notes: { userId },
            method: 'upi',
          },
        },
      };
      const rawBody = Buffer.from(JSON.stringify({ event: 'payment.captured', payload }));
      const signature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

      reqPromises.push(
        depositEngine.processWebhook({ rawBody, signature, payload, event: 'payment.captured' })
      );
    }

    const results = await Promise.allSettled(reqPromises);
    const fulfilled = results.filter(r => r.status === 'fulfilled');

    expect(fulfilled.length).toBe(100);

    // Verify DB balance is EXACTLY ₹11,000.00 (1000 + 100 * 100)
    const wRes = await query('SELECT balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(11000.00);

    // Verify 100 CREDIT ledger entries created
    const lRes = await query('SELECT COUNT(*) FROM ledger_entries WHERE wallet_id = $1 AND type = \'CREDIT\'', [walletId]);
    expect(parseInt(lRes.rows[0].count)).toBe(100);
  });
});
