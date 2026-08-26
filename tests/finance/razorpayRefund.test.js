import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { depositEngine } from '../../lib/depositEngine.mjs';
import { requestDepositRefund, processRefundWebhookEntity } from '../../lib/razorpayRefundEngine.mjs';
import { query } from '../../db/pg.js';
import { validateProductionEnvironment } from '../../lib/devopsEngine.mjs';

describe('Razorpay deposit refunds', () => {
  const userId = 'usr_refnd_101';
  const walletId = 'w_refnd_101';
  const webhookSecret = 'test_webhook_secret_refund';

  async function captureDeposit({ orderId, paymentId, amount }) {
    const depositId = `dep_${orderId}`;
    await query(
      `INSERT INTO deposits (id, deposit_id, user_id, order_id, amount, currency, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'INR', 'CREATED', NOW())
       ON CONFLICT (deposit_id) DO NOTHING`,
      [depositId, depositId, userId, orderId, amount],
    );
    const payload = {
      payment: {
        entity: {
          id: paymentId,
          order_id: orderId,
          amount: Math.round(amount * 100),
          notes: { userId },
          method: 'upi',
          acquirer_data: { rrn: `utr_${paymentId}` },
        },
      },
    };
    const rawBody = Buffer.from(JSON.stringify({ event: 'payment.captured', payload }));
    const signature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    await depositEngine.processWebhook({
      rawBody,
      signature,
      payload,
      event: 'payment.captured',
    });
    return depositId;
  }

  beforeEach(async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
    process.env.NODE_ENV = 'test';
    await query(
      `INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash')
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, `${userId}@example.com`],
    );
    await query(`DELETE FROM payment_refunds WHERE user_id = $1`, [userId]).catch(() => null);
    await query(`DELETE FROM ledger_entries WHERE wallet_id IN (SELECT wallet_id FROM wallets WHERE user_id = $1)`, [userId]);
    await query(`DELETE FROM deposits WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM transactions WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM wallets WHERE user_id = $1`, [userId]);
    await query(
      `INSERT INTO wallets (wallet_id, user_id, balance, locked_deposit_balance, currency)
       VALUES ($1, $2, 0, 0, 'INR')`,
      [walletId, userId],
    );
  });

  it('full refund reverses wallet + ledger once', async () => {
    const orderId = `order_rf_${Date.now()}`;
    const paymentId = `pay_rf_${Date.now()}`;
    const depositId = await captureDeposit({ orderId, paymentId, amount: 1000 });

    const before = await query(`SELECT balance, locked_deposit_balance FROM wallets WHERE user_id = $1`, [userId]);
    expect(Number(before.rows[0].balance)).toBe(1000);

    const r1 = await requestDepositRefund({
      depositId,
      amount: null,
      reason: 'test_full',
      actorId: 'admin_test',
      idempotencyKey: `full_${depositId}`,
    });
    expect(r1.success).toBe(true);
    expect(r1.amount).toBe(1000);
    expect(r1.depositStatus).toBe('REFUNDED');

    const after = await query(`SELECT balance, locked_deposit_balance FROM wallets WHERE user_id = $1`, [userId]);
    expect(Number(after.rows[0].balance)).toBe(0);

    const ledger = await query(
      `SELECT type, amount FROM ledger_entries WHERE wallet_id = $1 ORDER BY created_at`,
      [walletId],
    );
    const debit = ledger.rows.find((r) => r.type === 'DEBIT' && Number(r.amount) === 1000);
    expect(debit).toBeTruthy();

    const r2 = await requestDepositRefund({
      depositId,
      amount: null,
      reason: 'test_full_dup',
      actorId: 'admin_test',
      idempotencyKey: `full_${depositId}`,
    });
    expect(r2.duplicate).toBe(true);

    const afterDup = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [userId]);
    expect(Number(afterDup.rows[0].balance)).toBe(0);
  });

  it('partial refund leaves remaining deposit balance', async () => {
    const orderId = `order_rf_p_${Date.now()}`;
    const paymentId = `pay_rf_p_${Date.now()}`;
    const depositId = await captureDeposit({ orderId, paymentId, amount: 1000 });

    const r = await requestDepositRefund({
      depositId,
      amount: 400,
      reason: 'partial',
      actorId: 'admin_test',
      idempotencyKey: `partial_${depositId}`,
    });
    expect(r.amount).toBe(400);
    expect(r.depositStatus).toBe('PARTIALLY_REFUNDED');

    const w = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [userId]);
    expect(Number(w.rows[0].balance)).toBe(600);
  });

  it('webhook refund is idempotent', async () => {
    const orderId = `order_rf_wh_${Date.now()}`;
    const paymentId = `pay_rf_wh_${Date.now()}`;
    await captureDeposit({ orderId, paymentId, amount: 500 });

    const refundEntity = {
      id: `rfnd_${Date.now()}`,
      payment_id: paymentId,
      amount: 50000,
      status: 'processed',
      notes: { reason: 'webhook' },
    };
    const first = await processRefundWebhookEntity(refundEntity);
    expect(first.status).toBe('SUCCESS');
    const second = await processRefundWebhookEntity(refundEntity);
    expect(second.status).toBe('IGNORED_DUPLICATE');

    const w = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [userId]);
    expect(Number(w.rows[0].balance)).toBe(0);
  });

  it('queues MANUAL_REVIEW_REQUIRED when wallet lacks refundable funds', async () => {
    const orderId = `order_rf_mr_${Date.now()}`;
    const paymentId = `pay_rf_mr_${Date.now()}`;
    const depositId = await captureDeposit({ orderId, paymentId, amount: 1000 });

    // Spend the deposit so auto-reversal cannot proceed
    await query(`UPDATE wallets SET balance = 50, locked_deposit_balance = 0 WHERE user_id = $1`, [userId]);

    const r = await requestDepositRefund({
      depositId,
      amount: 1000,
      reason: 'spent_funds',
      actorId: 'admin_test',
      idempotencyKey: `mr_${depositId}`,
    });
    expect(r.success).toBe(false);
    expect(r.status).toBe('MANUAL_REVIEW_REQUIRED');
    expect(r.code).toBe('MANUAL_REVIEW_REQUIRED');

    const row = await query(
      `SELECT status, amount FROM payment_refunds WHERE idempotency_key = $1`,
      [`mr_${depositId}`],
    );
    expect(row.rows[0]?.status).toBe('MANUAL_REVIEW_REQUIRED');
    expect(Number(row.rows[0]?.amount)).toBe(1000);

    // Wallet unchanged (no invented funds)
    const w = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [userId]);
    expect(Number(w.rows[0].balance)).toBe(50);
  });

  it('rejects refund exceeding remaining', async () => {
    const orderId = `order_rf_x_${Date.now()}`;
    const paymentId = `pay_rf_x_${Date.now()}`;
    const depositId = await captureDeposit({ orderId, paymentId, amount: 1000 });
    await requestDepositRefund({
      depositId,
      amount: 700,
      reason: 'partial',
      actorId: 'admin_test',
      idempotencyKey: `p1_${depositId}`,
    });
    await expect(requestDepositRefund({
      depositId,
      amount: 400,
      reason: 'over',
      actorId: 'admin_test',
      idempotencyKey: `p2_${depositId}`,
    })).rejects.toMatchObject({ code: 'REFUND_EXCEEDS_REMAINING' });
  });
});

describe('DEMO_MODE production guard', () => {
  it('fails fast when DEMO_MODE is on in production', () => {
    expect(() => validateProductionEnvironment({
      NODE_ENV: 'production',
      DEMO_MODE: '1',
      DATABASE_URL: 'postgresql://prod:secret@db/oddsyra',
      JWT_SECRET: 'a'.repeat(40),
      FRONTEND_URL: 'https://oddsyra.com',
      CORS_ORIGIN: 'https://oddsyra.com',
      RAZORPAY_KEY_ID: 'rzp_live_x',
      RAZORPAY_KEY_SECRET: 'secret',
      RAZORPAY_WEBHOOK_SECRET: 'whsec_live_ok',
      SMTP_HOST: 'smtp.zoho.com',
      SMTP_USER: 'noreply@oddsyra.com',
      SMTP_PASSWORD: 'x',
    })).toThrow(/DEMO_MODE/);
  });

  it('allows production when DEMO_MODE is off', () => {
    const res = validateProductionEnvironment({
      NODE_ENV: 'production',
      DEMO_MODE: '0',
      VITE_DEMO_MODE: '0',
      DATABASE_URL: 'postgresql://prod:secret@db/oddsyra',
      JWT_SECRET: 'a'.repeat(40),
      FRONTEND_URL: 'https://oddsyra.com',
      CORS_ORIGIN: 'https://oddsyra.com',
      RAZORPAY_KEY_ID: 'rzp_live_x',
      RAZORPAY_KEY_SECRET: 'secret',
      RAZORPAY_WEBHOOK_SECRET: 'whsec_live_ok',
      SMTP_HOST: 'smtp.zoho.com',
      SMTP_USER: 'noreply@oddsyra.com',
      SMTP_PASSWORD: 'x',
    });
    expect(res.valid).toBe(true);
  });
});
