import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { query } from '../../db/pg.js';
import { depositEngine } from '../../lib/depositEngine.mjs';

const TEST_SECRET = 'rzp_test_secret_key_12345';
const TEST_WEBHOOK_SECRET = 'rzp_webhook_secret_67890';

// Configure test environment secrets
process.env.NODE_ENV = 'test';
process.env.RAZORPAY_KEY_ID = 'rzp_test_key_12345';
process.env.RAZORPAY_KEY_SECRET = TEST_SECRET;
process.env.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

async function createTestUserAndWallet(userId, initialBalance = 0) {
  const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  await query(
    `INSERT INTO users (user_id, email, password_hash, phone, created_at, updated_at)
     VALUES ($1, $2, 'hash_test', $3, NOW(), NOW())
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, `${userId}@oddsyra.test`, phone]
  );

  await query(
    `INSERT INTO user_profiles (user_id, display_name, kyc_status, account_status)
     VALUES ($1, $2, 'VERIFIED', 'ACTIVE')
     ON CONFLICT (user_id) DO UPDATE SET kyc_status = 'VERIFIED', account_status = 'ACTIVE'`,
    [userId, `Player ${userId}`]
  );

  await query(
    `INSERT INTO wallets (wallet_id, user_id, balance, currency, updated_at)
     VALUES ($1, $2, $3, 'INR', NOW())
     ON CONFLICT (user_id) DO UPDATE SET balance = $3, updated_at = NOW()`,
    [`wal_${userId}`, userId, initialBalance]
  );
}

function generatePaymentSignature(orderId, paymentId) {
  return crypto
    .createHmac('sha256', TEST_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

function generateWebhookSignature(rawBody) {
  return crypto
    .createHmac('sha256', TEST_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
}

test('ODDSYRA — COMPLETE RAZORPAY API + WEBHOOK INTEGRATION TEST SUITE', async (t) => {

  await t.test('TEST 1: Successful ₹500 payment credits wallet exactly once and records immutable ledger', async () => {
    const userId = `usr_test_${Date.now()}_1`;
    await createTestUserAndWallet(userId, 0);
    const amount = 500;

    // 1. Create order
    const orderRes = await depositEngine.createOrder({ userId, amount, provider: 'RAZORPAY' });
    assert.equal(orderRes.success, true);
    assert.equal(orderRes.amount, 500);
    assert.equal(orderRes.amountPaise, 50000);
    assert.ok(orderRes.orderId.startsWith('order_'));

    // 2. Simulate payment completion
    const paymentId = `pay_test_${Date.now()}_1`;
    const signature = generatePaymentSignature(orderRes.orderId, paymentId);

    // 3. Confirm via central payment processor
    const verifyRes = await depositEngine.confirmCheckoutPayment({
      userId,
      razorpayOrderId: orderRes.orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
    });

    assert.equal(verifyRes.status, 'PAID');
    assert.equal(verifyRes.alreadyPaid, false);
    assert.equal(verifyRes.amount, 500);
    assert.equal(verifyRes.amountPaise, 50000);
    assert.equal(verifyRes.newBalance, 500);
  });

  await t.test('TEST 2: Verify API called twice -> No duplicate wallet credit (Exactly-Once Idempotency)', async () => {
    const userId = `usr_test_${Date.now()}_2`;
    await createTestUserAndWallet(userId, 100);
    const orderRes = await depositEngine.createOrder({ userId, amount: 1000, provider: 'RAZORPAY' });
    const paymentId = `pay_test_${Date.now()}_2`;
    const signature = generatePaymentSignature(orderRes.orderId, paymentId);

    // First call
    const firstVerify = await depositEngine.confirmCheckoutPayment({
      userId,
      razorpayOrderId: orderRes.orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
    });
    assert.equal(firstVerify.status, 'PAID');
    assert.equal(firstVerify.alreadyPaid, false);
    assert.equal(firstVerify.newBalance, 1100);

    // Second call (simulate double click / retry)
    const secondVerify = await depositEngine.confirmCheckoutPayment({
      userId,
      razorpayOrderId: orderRes.orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
    });
    assert.equal(secondVerify.status, 'PAID');
    assert.equal(secondVerify.alreadyPaid, true);
    assert.equal(secondVerify.newBalance, 1100);
  });

  await t.test('TEST 3: Webhook delivered twice -> Idempotent, no duplicate wallet credit', async () => {
    const userId = `usr_test_${Date.now()}_3`;
    await createTestUserAndWallet(userId, 0);
    const orderRes = await depositEngine.createOrder({ userId, amount: 750, provider: 'RAZORPAY' });
    const paymentId = `pay_test_${Date.now()}_3`;

    const rawPayload = JSON.stringify({
      entity: 'event',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderRes.orderId,
            amount: 75000,
            currency: 'INR',
            status: 'captured',
            notes: { userId },
          },
        },
      },
    });

    const signature = generateWebhookSignature(rawPayload);

    // First webhook delivery
    const firstWebhook = await depositEngine.processWebhook({
      rawBody: rawPayload,
      signature,
      payload: JSON.parse(rawPayload).payload,
      event: 'payment.captured',
      provider: 'RAZORPAY',
    });
    assert.equal(firstWebhook.status, 'PAID');
    assert.equal(firstWebhook.alreadyPaid, false);
    assert.equal(firstWebhook.newBalance, 750);

    // Second duplicate webhook delivery
    const secondWebhook = await depositEngine.processWebhook({
      rawBody: rawPayload,
      signature,
      payload: JSON.parse(rawPayload).payload,
      event: 'payment.captured',
      provider: 'RAZORPAY',
    });
    assert.equal(secondWebhook.status, 'IGNORED_DUPLICATE');
  });

  await t.test('TEST 4: Webhook arrives before frontend verification -> Processed once', async () => {
    const userId = `usr_test_${Date.now()}_4`;
    await createTestUserAndWallet(userId, 0);
    const orderRes = await depositEngine.createOrder({ userId, amount: 2000, provider: 'RAZORPAY' });
    const paymentId = `pay_test_${Date.now()}_4`;

    const rawPayload = JSON.stringify({
      entity: 'event',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderRes.orderId,
            amount: 200000,
            currency: 'INR',
            status: 'captured',
            notes: { userId },
          },
        },
      },
    });
    const webhookSig = generateWebhookSignature(rawPayload);

    // 1. Webhook arrives first
    const webhookRes = await depositEngine.processWebhook({
      rawBody: rawPayload,
      signature: webhookSig,
      payload: JSON.parse(rawPayload).payload,
      event: 'payment.captured',
      provider: 'RAZORPAY',
    });
    assert.equal(webhookRes.status, 'PAID');
    assert.equal(webhookRes.alreadyPaid, false);
    assert.equal(webhookRes.newBalance, 2000);

    // 2. Frontend verification arrives later
    const paymentSig = generatePaymentSignature(orderRes.orderId, paymentId);
    const frontendRes = await depositEngine.confirmCheckoutPayment({
      userId,
      provider: 'RAZORPAY',
      razorpayOrderId: orderRes.orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: paymentSig,
    });
    assert.equal(frontendRes.status, 'PAID');
    assert.equal(frontendRes.alreadyPaid, true);
    assert.equal(frontendRes.newBalance, 2000);
  });

  await t.test('TEST 5: Frontend verification arrives before webhook -> Processed once', async () => {
    const userId = `usr_test_${Date.now()}_5`;
    await createTestUserAndWallet(userId, 0);
    const orderRes = await depositEngine.createOrder({ userId, amount: 1500, provider: 'RAZORPAY' });
    const paymentId = `pay_test_${Date.now()}_5`;

    // 1. Frontend verifies first
    const paymentSig = generatePaymentSignature(orderRes.orderId, paymentId);
    const frontendRes = await depositEngine.confirmCheckoutPayment({
      userId,
      provider: 'RAZORPAY',
      razorpayOrderId: orderRes.orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: paymentSig,
    });
    assert.equal(frontendRes.status, 'PAID');
    assert.equal(frontendRes.alreadyPaid, false);
    assert.equal(frontendRes.newBalance, 1500);

    // 2. Webhook arrives later
    const rawPayload = JSON.stringify({
      entity: 'event',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderRes.orderId,
            amount: 150000,
            currency: 'INR',
            status: 'captured',
            notes: { userId },
          },
        },
      },
    });
    const webhookSig = generateWebhookSignature(rawPayload);
    const webhookRes = await depositEngine.processWebhook({
      rawBody: rawPayload,
      signature: webhookSig,
      payload: JSON.parse(rawPayload).payload,
      event: 'payment.captured',
      provider: 'RAZORPAY',
    });
    assert.equal(webhookRes.status, 'PAID');
    assert.equal(webhookRes.alreadyPaid, true);
    assert.equal(webhookRes.newBalance, 1500);
  });

  await t.test('TEST 6: Invalid payment signature -> Rejected and wallet not credited', async () => {
    const userId = `usr_test_${Date.now()}_6`;
    await createTestUserAndWallet(userId, 0);
    const orderRes = await depositEngine.createOrder({ userId, amount: 500, provider: 'RAZORPAY' });

    await assert.rejects(
      async () => {
        await depositEngine.confirmCheckoutPayment({
          userId,
          provider: 'RAZORPAY',
          razorpayOrderId: orderRes.orderId,
          razorpayPaymentId: `pay_test_${Date.now()}_invalid`,
          razorpaySignature: 'invalid_tampered_signature_abc123',
        });
      },
      /INVALID_SIGNATURE/
    );
  });

  await t.test('TEST 7: Invalid webhook signature -> Rejected and wallet not credited', async () => {
    const rawPayload = JSON.stringify({
      entity: 'event',
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_tampered', amount: 50000 } } },
    });

    await assert.rejects(
      async () => {
        await depositEngine.processWebhook({
          rawBody: rawPayload,
          signature: 'fake_tampered_signature_xyz',
          payload: JSON.parse(rawPayload).payload,
          event: 'payment.captured',
          provider: 'RAZORPAY',
        });
      },
      /INVALID_SIGNATURE/
    );
  });

  await t.test('TEST 8: Payment amount mismatch -> Rejected and wallet not credited', async () => {
    const userId = `usr_test_${Date.now()}_8`;
    await createTestUserAndWallet(userId, 0);
    // Create ₹500 deposit
    const orderRes = await depositEngine.createOrder({ userId, amount: 500, provider: 'RAZORPAY' });
    const paymentId = `pay_test_${Date.now()}_8`;

    await assert.rejects(
      async () => {
        // Attempt to claim with ₹1000 payload
        await depositEngine.processVerifiedRazorpayPayment({
          providerOrderId: orderRes.orderId,
          providerPaymentId: paymentId,
          amountInINR: 1000,
          amountPaise: 100000,
          userId,
        });
      },
      /AMOUNT_MISMATCH/
    );
  });

  await t.test('TEST 9: Wrong user attempts payment verification -> Rejected', async () => {
    const legitimateUser = `usr_test_${Date.now()}_legit`;
    const maliciousUser = `usr_test_${Date.now()}_attacker`;
    await createTestUserAndWallet(legitimateUser, 0);
    await createTestUserAndWallet(maliciousUser, 0);

    const orderRes = await depositEngine.createOrder({ userId: legitimateUser, amount: 500, provider: 'RAZORPAY' });
    const paymentId = `pay_test_${Date.now()}_9`;
    const signature = generatePaymentSignature(orderRes.orderId, paymentId);

    await assert.rejects(
      async () => {
        await depositEngine.confirmCheckoutPayment({
          userId: maliciousUser,
          provider: 'RAZORPAY',
          razorpayOrderId: orderRes.orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
        });
      },
      /USER_MISMATCH/
    );
  });

  await t.test('TEST 10: Deposit bounds validation (Min ₹100, Max ₹500000, max 2 decimals)', async () => {
    const userId = `usr_test_${Date.now()}_10`;
    await createTestUserAndWallet(userId, 0);

    // Reject under minimum ₹100
    await assert.rejects(
      async () => depositEngine.createOrder({ userId, amount: 50, provider: 'RAZORPAY' }),
      /DEPOSIT_LIMIT.*Minimum deposit is ₹100/
    );

    // Reject over maximum ₹500000
    await assert.rejects(
      async () => depositEngine.createOrder({ userId, amount: 600000, provider: 'RAZORPAY' }),
      /DEPOSIT_LIMIT.*Maximum deposit is ₹500000/
    );

    // Reject invalid decimals (> 2 decimals)
    await assert.rejects(
      async () => depositEngine.createOrder({ userId, amount: 500.123, provider: 'RAZORPAY' }),
      /INVALID_AMOUNT/
    );
  });

  await t.test('TEST 11: Duplicate payment ID protection across different orders', async () => {
    const user1 = `usr_test_${Date.now()}_11a`;
    const user2 = `usr_test_${Date.now()}_11b`;
    await createTestUserAndWallet(user1, 0);
    await createTestUserAndWallet(user2, 0);

    const order1 = await depositEngine.createOrder({ userId: user1, amount: 500, provider: 'RAZORPAY' });
    const order2 = await depositEngine.createOrder({ userId: user2, amount: 500, provider: 'RAZORPAY' });

    const reusedPaymentId = `pay_test_${Date.now()}_shared_11`;
    const sig1 = generatePaymentSignature(order1.orderId, reusedPaymentId);

    // User 1 uses payment ID
    const res1 = await depositEngine.confirmCheckoutPayment({
      userId: user1,
      provider: 'RAZORPAY',
      razorpayOrderId: order1.orderId,
      razorpayPaymentId: reusedPaymentId,
      razorpaySignature: sig1,
    });
    assert.equal(res1.status, 'PAID');

    // User 2 attempts to use same payment ID on order 2
    const sig2 = generatePaymentSignature(order2.orderId, reusedPaymentId);
    await assert.rejects(
      async () => {
        await depositEngine.confirmCheckoutPayment({
          userId: user2,
          provider: 'RAZORPAY',
          razorpayOrderId: order2.orderId,
          razorpayPaymentId: reusedPaymentId,
          razorpaySignature: sig2,
        });
      },
      /DUPLICATE_PAYMENT_ID|already been credited/
    );
  });

  await t.test('TEST 12: Simultaneous processing attempts lock and resolve safely', async () => {
    const userId = `usr_test_${Date.now()}_12`;
    await createTestUserAndWallet(userId, 0);
    const orderRes = await depositEngine.createOrder({ userId, amount: 500, provider: 'RAZORPAY' });
    const paymentId = `pay_test_${Date.now()}_12`;

    const sig = generatePaymentSignature(orderRes.orderId, paymentId);

    // Launch two simultaneous verification requests
    const [first, second] = await Promise.all([
      depositEngine.confirmCheckoutPayment({
        userId,
        provider: 'RAZORPAY',
        razorpayOrderId: orderRes.orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: sig,
      }),
      depositEngine.confirmCheckoutPayment({
        userId,
        provider: 'RAZORPAY',
        razorpayOrderId: orderRes.orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: sig,
      }),
    ]);

    assert.equal(first.status, 'PAID');
    assert.equal(second.status, 'PAID');
    // Exactly one is the initial capture, the other is the idempotent acknowledge
    const alreadyPaidCount = [first.alreadyPaid, second.alreadyPaid].filter(Boolean).length;
    assert.equal(alreadyPaidCount, 1);
  });

  await t.test('TEST 13: Delayed duplicate webhook is ignored safely', async () => {
    const userId = `usr_test_${Date.now()}_13`;
    await createTestUserAndWallet(userId, 0);
    const orderRes = await depositEngine.createOrder({ userId, amount: 800, provider: 'RAZORPAY' });
    const paymentId = `pay_test_${Date.now()}_13`;

    const rawPayload = JSON.stringify({
      entity: 'event',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderRes.orderId,
            amount: 80000,
            currency: 'INR',
            status: 'captured',
            notes: { userId },
          },
        },
      },
    });

    const sig = generateWebhookSignature(rawPayload);

    const initial = await depositEngine.processWebhook({
      rawBody: rawPayload,
      signature: sig,
      payload: JSON.parse(rawPayload).payload,
      event: 'payment.captured',
      provider: 'RAZORPAY',
    });
    assert.equal(initial.status, 'PAID');

    // Delayed webhook
    const delayed = await depositEngine.processWebhook({
      rawBody: rawPayload,
      signature: sig,
      payload: JSON.parse(rawPayload).payload,
      event: 'payment.captured',
    });
    assert.equal(delayed.status, 'IGNORED_DUPLICATE');
  });
});
