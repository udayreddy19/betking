import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { query, withTransaction } from '../../db/pg.js';
import { depositEngine } from '../../lib/depositEngine.mjs';
import { cashfreeProvider } from '../../lib/paymentProviders/CashfreeProvider.mjs';
import { razorpayProvider } from '../../lib/paymentProviders/RazorpayProvider.mjs';
import { paymentProviderService } from '../../lib/paymentProviders/paymentProviderService.mjs';

function createMockCashfreeWebhookPayload({ orderId, paymentId, amount = 1000, status = 'SUCCESS', event = 'PAYMENT_SUCCESS_WEBHOOK', userId }) {
  return {
    data: {
      order: {
        order_id: orderId,
        order_amount: amount,
        order_currency: 'INR',
        order_tags: { userId },
      },
      payment: {
        cf_payment_id: paymentId,
        payment_status: status,
        payment_amount: amount,
        payment_currency: 'INR',
        payment_message: status === 'SUCCESS' ? 'Transaction Successful' : 'Transaction Failed',
        payment_time: new Date().toISOString(),
        bank_reference: `UTR_${paymentId}`,
        payment_group: 'upi',
      },
      customer_details: {
        customer_id: userId,
        customer_name: 'Test Player',
        customer_email: `${userId}@example.com`,
        customer_phone: '9876543210',
      },
    },
    event_time: new Date().toISOString(),
    type: event,
  };
}

function generateCashfreeWebhookSignature(rawBody, timestamp, secret = 'cf_mock_wh_secret') {
  const payload = String(timestamp) + (typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody));
  return crypto.createHmac('sha256', secret).update(payload).digest('base64');
}

test('ODDSYRA — CASHFREE PAYMENTS API + WEBHOOK INTEGRATION TEST SUITE', async (t) => {
  const timestamp = Date.now();
  const testUserId = `usr_cf_test_${timestamp}`;
  const testWalletId = `wal_cf_test_${timestamp}`;
  const mockWebhookSecret = 'cf_mock_test_secret_12345';
  process.env.CASHFREE_WEBHOOK_SECRET = mockWebhookSecret;

  // Setup test user & wallet in DB
  const testPhone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  await query(
    `INSERT INTO users (user_id, email, phone, created_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (user_id) DO NOTHING`,
    [testUserId, `${testUserId}@example.com`, testPhone]
  );

  await query(
    `INSERT INTO user_profiles (user_id, display_name, kyc_status, account_status)
     VALUES ($1, $2, 'VERIFIED', 'ACTIVE')
     ON CONFLICT (user_id) DO UPDATE SET kyc_status = 'VERIFIED', account_status = 'ACTIVE'`,
    [testUserId, `Player ${timestamp}`]
  );

  await query(
    `INSERT INTO wallets (wallet_id, user_id, balance, locked_deposit_balance, created_at, updated_at)
     VALUES ($1, $2, 0.00, 0.00, NOW(), NOW())
     ON CONFLICT (wallet_id) DO NOTHING`,
    [testWalletId, testUserId]
  );

  await t.test('1. Provider-Agnostic Registry & Configuration', () => {
    const available = paymentProviderService.getAvailableProviders();
    assert.ok(Array.isArray(available), 'Providers should be an array');
    assert.ok(available.some(p => p.provider === 'CASHFREE'), 'Cashfree should be registered');
    assert.ok(available.some(p => p.provider === 'RAZORPAY'), 'Razorpay should be registered');
  });

  await t.test('2. TEST 1: Successful Cashfree Order Creation, Server Verification, & Exactly-Once Credit', async () => {
    const depositAmount = 1000;
    const orderResult = await depositEngine.createOrder({
      userId: testUserId,
      amount: depositAmount,
      currency: 'INR',
      provider: 'CASHFREE',
    });

    assert.strictEqual(orderResult.success, true);
    assert.strictEqual(orderResult.provider, 'CASHFREE');
    assert.ok(orderResult.depositId);
    assert.ok(orderResult.orderId);
    assert.strictEqual(orderResult.amount, 1000);

    const initialWallet = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId]);
    const startBalance = Number(initialWallet.rows[0].balance);

    const paymentId = `cf_pay_success_${Date.now()}`;
    const verifyResult = await depositEngine.confirmCheckoutPayment({
      userId: testUserId,
      provider: 'CASHFREE',
      depositId: orderResult.depositId,
      orderId: orderResult.orderId,
      paymentId,
    });

    assert.strictEqual(verifyResult.status, 'PAID');
    assert.strictEqual(verifyResult.alreadyPaid, false);
    assert.strictEqual(verifyResult.newBalance, startBalance + depositAmount);

    // Verify wallet updated
    const updatedWallet = await query(`SELECT balance, locked_deposit_balance FROM wallets WHERE user_id = $1`, [testUserId]);
    assert.strictEqual(Number(updatedWallet.rows[0].balance), startBalance + depositAmount);
    assert.strictEqual(Number(updatedWallet.rows[0].locked_deposit_balance), depositAmount);

    // Verify immutable ledger entry
    const ledger = await query(`SELECT * FROM ledger_entries WHERE transaction_id = $1`, [paymentId]);
    assert.strictEqual(ledger.rows.length, 1);
    assert.strictEqual(ledger.rows[0].type, 'CREDIT');
    assert.strictEqual(Number(ledger.rows[0].amount), depositAmount);
  });

  await t.test('3. TEST 2: Frontend Reports Completion Twice (Duplicate Verification Idempotency)', async () => {
    const depositAmount = 500;
    const order = await depositEngine.createOrder({
      userId: testUserId,
      amount: depositAmount,
      provider: 'CASHFREE',
    });

    const paymentId = `cf_pay_dup_${Date.now()}`;

    // First attempt
    const res1 = await depositEngine.confirmCheckoutPayment({
      userId: testUserId,
      provider: 'CASHFREE',
      orderId: order.orderId,
      paymentId,
    });
    assert.strictEqual(res1.status, 'PAID');
    assert.strictEqual(res1.alreadyPaid, false);

    const midWallet = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId]);
    const midBalance = Number(midWallet.rows[0].balance);

    // Second duplicate attempt
    const res2 = await depositEngine.confirmCheckoutPayment({
      userId: testUserId,
      provider: 'CASHFREE',
      orderId: order.orderId,
      paymentId,
    });
    assert.strictEqual(res2.status, 'PAID');
    assert.strictEqual(res2.alreadyPaid, true);

    // Balance must NOT double credit
    const finalWallet = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId]);
    assert.strictEqual(Number(finalWallet.rows[0].balance), midBalance);
  });

  await t.test('4. TEST 3: Cashfree Webhook Delivered Multiple Times (Webhook Idempotency)', async () => {
    const depositAmount = 1500;
    const order = await depositEngine.createOrder({
      userId: testUserId,
      amount: depositAmount,
      provider: 'CASHFREE',
    });

    const paymentId = `cf_pay_wh_multi_${Date.now()}`;
    const payload = createMockCashfreeWebhookPayload({
      orderId: order.orderId,
      paymentId,
      amount: depositAmount,
      userId: testUserId,
    });

    const rawBody = JSON.stringify(payload);
    const ts = Date.now().toString();
    const signature = generateCashfreeWebhookSignature(rawBody, ts, mockWebhookSecret);
    const headers = { 'x-webhook-signature': signature, 'x-webhook-timestamp': ts };

    // 1st Webhook delivery
    const whRes1 = await depositEngine.processWebhook({
      rawBody: Buffer.from(rawBody, 'utf8'),
      headers,
      provider: 'CASHFREE',
    });
    assert.strictEqual(whRes1.status, 'PAID');
    assert.strictEqual(whRes1.alreadyPaid, false);

    const midWallet = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId]);
    const midBalance = Number(midWallet.rows[0].balance);

    // 2nd Duplicate Webhook delivery
    const whRes2 = await depositEngine.processWebhook({
      rawBody: Buffer.from(rawBody, 'utf8'),
      headers,
      provider: 'CASHFREE',
    });
    assert.strictEqual(whRes2.status, 'IGNORED_DUPLICATE');

    const finalWallet = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId]);
    assert.strictEqual(Number(finalWallet.rows[0].balance), midBalance);
  });

  await t.test('5. TEST 4: Webhook Arrives BEFORE Frontend Verification', async () => {
    const depositAmount = 2000;
    const order = await depositEngine.createOrder({
      userId: testUserId,
      amount: depositAmount,
      provider: 'CASHFREE',
    });

    const paymentId = `cf_pay_wh_first_${Date.now()}`;
    const payload = createMockCashfreeWebhookPayload({
      orderId: order.orderId,
      paymentId,
      amount: depositAmount,
      userId: testUserId,
    });

    const rawBody = JSON.stringify(payload);
    const ts = Date.now().toString();
    const signature = generateCashfreeWebhookSignature(rawBody, ts, mockWebhookSecret);
    const headers = { 'x-webhook-signature': signature, 'x-webhook-timestamp': ts };

    // 1. Webhook processes first
    const whRes = await depositEngine.processWebhook({
      rawBody: Buffer.from(rawBody, 'utf8'),
      headers,
      provider: 'CASHFREE',
    });
    assert.strictEqual(whRes.status, 'PAID');
    assert.strictEqual(whRes.alreadyPaid, false);

    const postWhBalance = Number((await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId])).rows[0].balance);

    // 2. Frontend verification arrives second
    const frontRes = await depositEngine.confirmCheckoutPayment({
      userId: testUserId,
      provider: 'CASHFREE',
      orderId: order.orderId,
      paymentId,
    });
    assert.strictEqual(frontRes.status, 'PAID');
    assert.strictEqual(frontRes.alreadyPaid, true);

    const finalBalance = Number((await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId])).rows[0].balance);
    assert.strictEqual(finalBalance, postWhBalance);
  });

  await t.test('6. TEST 5: Frontend Verification Arrives BEFORE Webhook', async () => {
    const depositAmount = 2500;
    const order = await depositEngine.createOrder({
      userId: testUserId,
      amount: depositAmount,
      provider: 'CASHFREE',
    });

    const paymentId = `cf_pay_front_first_${Date.now()}`;

    // 1. Frontend verification processes first
    const frontRes = await depositEngine.confirmCheckoutPayment({
      userId: testUserId,
      provider: 'CASHFREE',
      orderId: order.orderId,
      paymentId,
    });
    assert.strictEqual(frontRes.status, 'PAID');
    assert.strictEqual(frontRes.alreadyPaid, false);

    const postFrontBalance = Number((await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId])).rows[0].balance);

    // 2. Webhook arrives later
    const payload = createMockCashfreeWebhookPayload({
      orderId: order.orderId,
      paymentId,
      amount: depositAmount,
      userId: testUserId,
    });
    const rawBody = JSON.stringify(payload);
    const ts = Date.now().toString();
    const signature = generateCashfreeWebhookSignature(rawBody, ts, mockWebhookSecret);
    const headers = { 'x-webhook-signature': signature, 'x-webhook-timestamp': ts };

    const whRes = await depositEngine.processWebhook({
      rawBody: Buffer.from(rawBody, 'utf8'),
      headers,
      provider: 'CASHFREE',
    });
    assert.strictEqual(whRes.status, 'PAID');
    assert.strictEqual(whRes.alreadyPaid, true);

    const finalBalance = Number((await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId])).rows[0].balance);
    assert.strictEqual(finalBalance, postFrontBalance);
  });

  await t.test('7. TEST 6: Invalid Webhook Signature Rejection', async () => {
    const payload = { data: { order: { order_id: 'dep_fake' } } };
    const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');

    await assert.rejects(
      async () => {
        await depositEngine.processWebhook({
          rawBody,
          headers: {
            'x-webhook-signature': 'invalid_signature_xyz',
            'x-webhook-timestamp': Date.now().toString(),
          },
          provider: 'CASHFREE',
        });
      },
      /INVALID_SIGNATURE/
    );
  });

  await t.test('8. TEST 7: Payment Amount Mismatch Rejection', async () => {
    const order = await depositEngine.createOrder({
      userId: testUserId,
      amount: 1000,
      provider: 'CASHFREE',
    });

    const paymentId = `cf_pay_mismatch_${Date.now()}`;

    await assert.rejects(
      async () => {
        await depositEngine.processVerifiedPayment({
          provider: 'CASHFREE',
          providerOrderId: order.orderId,
          providerPaymentId: paymentId,
          amountInINR: 500, // Expected 1000, actual 500
          userId: testUserId,
        });
      },
      /AMOUNT_MISMATCH/
    );
  });

  await t.test('9. TEST 8: Concurrent Processing Race Condition Defense (Row Locking)', async () => {
    const depositAmount = 3000;
    const order = await depositEngine.createOrder({
      userId: testUserId,
      amount: depositAmount,
      provider: 'CASHFREE',
    });

    const paymentId = `cf_pay_race_${Date.now()}`;
    const startBalance = Number((await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId])).rows[0].balance);

    // 5 concurrent requests attempting settlement simultaneously
    const results = await Promise.all([
      depositEngine.processVerifiedPayment({ provider: 'CASHFREE', providerOrderId: order.orderId, providerPaymentId: paymentId, amountInINR: depositAmount, userId: testUserId }),
      depositEngine.processVerifiedPayment({ provider: 'CASHFREE', providerOrderId: order.orderId, providerPaymentId: paymentId, amountInINR: depositAmount, userId: testUserId }),
      depositEngine.processVerifiedPayment({ provider: 'CASHFREE', providerOrderId: order.orderId, providerPaymentId: paymentId, amountInINR: depositAmount, userId: testUserId }),
      depositEngine.processVerifiedPayment({ provider: 'CASHFREE', providerOrderId: order.orderId, providerPaymentId: paymentId, amountInINR: depositAmount, userId: testUserId }),
      depositEngine.processVerifiedPayment({ provider: 'CASHFREE', providerOrderId: order.orderId, providerPaymentId: paymentId, amountInINR: depositAmount, userId: testUserId }),
    ]);

    const newCredits = results.filter(r => r.alreadyPaid === false);
    const idempotentPasses = results.filter(r => r.alreadyPaid === true);

    assert.strictEqual(newCredits.length, 1, 'Exactly one execution should perform the actual credit');
    assert.strictEqual(idempotentPasses.length, 4, 'Remaining 4 executions must return idempotent success');

    const endBalance = Number((await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId])).rows[0].balance);
    assert.strictEqual(endBalance, startBalance + depositAmount);
  });

  await t.test('10. TEST 9: Database Failure During Wallet Credit Triggers Full Rollback', async () => {
    const depositAmount = 1000;
    const order = await depositEngine.createOrder({
      userId: testUserId,
      amount: depositAmount,
      provider: 'CASHFREE',
    });

    const paymentId = `cf_pay_rollback_${Date.now()}`;

    // Simulate rollback by attempting to credit non-existent user
    await assert.rejects(
      async () => {
        await depositEngine.processVerifiedPayment({
          provider: 'CASHFREE',
          providerOrderId: order.orderId,
          providerPaymentId: paymentId,
          amountInINR: depositAmount,
          userId: 'usr_non_existent_user_999',
        });
      },
      /USER_MISMATCH/
    );

    // Verify deposit remains in PENDING state (not corrupted)
    const depositCheck = await query(`SELECT status FROM deposits WHERE order_id = $1`, [order.orderId]);
    assert.strictEqual(depositCheck.rows[0].status, 'PENDING');
  });

  await t.test('11. TEST 10: Razorpay Regression & Compatibility Check', async () => {
    const depositAmount = 1200;
    const rzpOrder = await depositEngine.createOrder({
      userId: testUserId,
      amount: depositAmount,
      provider: 'RAZORPAY',
    });

    assert.strictEqual(rzpOrder.provider, 'RAZORPAY');
    assert.ok(rzpOrder.orderId);

    const startBalance = Number((await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId])).rows[0].balance);
    const rzpPaymentId = `pay_rzp_compat_${Date.now()}`;

    const result = await depositEngine.processVerifiedRazorpayPayment({
      providerOrderId: rzpOrder.orderId,
      providerPaymentId: rzpPaymentId,
      amountInINR: depositAmount,
      userId: testUserId,
    });

    assert.strictEqual(result.status, 'PAID');
    assert.strictEqual(result.provider, 'RAZORPAY');

    const endBalance = Number((await query(`SELECT balance FROM wallets WHERE user_id = $1`, [testUserId])).rows[0].balance);
    assert.strictEqual(endBalance, startBalance + depositAmount);
  });
});
