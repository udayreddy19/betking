import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { depositEngine } from '../../lib/depositEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 6 Deposit & Webhook Security Tests', () => {
  const userId = 'usr_dep_101';
  const walletId = 'w_dep_101';
  const webhookSecret = 'test_webhook_secret';

  beforeEach(async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userId, `${userId}@example.com`]);
    await query(`DELETE FROM ledger_entries WHERE wallet_id IN (SELECT wallet_id FROM wallets WHERE user_id = $1);`, [userId]);
    await query(`DELETE FROM deposits WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM transactions WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM wallets WHERE user_id = $1;`, [userId]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, currency) VALUES ($1, $2, 500.00, 'INR');`, [walletId, userId]);
  });

  it('should create deposit order with valid amount and persistence', async () => {
    const res = await depositEngine.createOrder({ userId, amount: 1000.00 });
    expect(res.success).toBe(true);
    expect(res.amount).toBe(1000.00);
    expect(res.orderId).toBeDefined();

    const dbDep = await query('SELECT * FROM deposits WHERE order_id = $1', [res.orderId]);
    expect(dbDep.rows.length).toBe(1);
    expect(dbDep.rows[0].status).toBe('CREATED');
  });

  it('should reject deposit order with invalid amount (<= 0 or > 2 decimal places)', async () => {
    await expect(depositEngine.createOrder({ userId, amount: -100 })).rejects.toThrow('INVALID_AMOUNT');
    await expect(depositEngine.createOrder({ userId, amount: 50.123 })).rejects.toThrow('INVALID_AMOUNT');
  });

  it('should process verified webhook and credit wallet atomically', async () => {
    const paymentId = `pay_wh_${Date.now()}`;
    const payload = {
      payment: {
        entity: {
          id: paymentId,
          amount: 50000, // ₹500.00
          notes: { userId },
          method: 'upi',
          acquirer_data: { rrn: `utr_${paymentId}` },
        },
      },
    };

    const rawBody = Buffer.from(JSON.stringify({ event: 'payment.captured', payload }));
    const signature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

    const result = await depositEngine.processWebhook({
      rawBody,
      signature,
      payload,
      event: 'payment.captured',
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.newBalance).toBe(1000.00); // 500 + 500

    const wRes = await query('SELECT balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(1000.00);
  });

  it('CRITICAL: duplicate webhook must be IGNORED without double-crediting wallet', async () => {
    const paymentId = `pay_dup_${Date.now()}`;
    const payload = {
      payment: {
        entity: {
          id: paymentId,
          amount: 30000, // ₹300.00
          notes: { userId },
          method: 'upi',
        },
      },
    };

    const rawBody = Buffer.from(JSON.stringify({ event: 'payment.captured', payload }));
    const signature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

    // First webhook
    const res1 = await depositEngine.processWebhook({ rawBody, signature, payload, event: 'payment.captured' });
    expect(res1.status).toBe('SUCCESS');

    // Second duplicate webhook
    const res2 = await depositEngine.processWebhook({ rawBody, signature, payload, event: 'payment.captured' });
    expect(res2.status).toBe('IGNORED_DUPLICATE');

    // Verify balance is only credited ONCE (500 + 300 = 800)
    const wRes = await query('SELECT balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(800.00);
  });

  it('CRITICAL: invalid webhook HMAC signature must be REJECTED', async () => {
    const rawBody = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: {} }));
    const invalidSignature = 'deadbeef123456789';

    await expect(depositEngine.processWebhook({
      rawBody,
      signature: invalidSignature,
      payload: {},
      event: 'payment.captured',
    })).rejects.toThrow('INVALID_SIGNATURE');
  });
});
