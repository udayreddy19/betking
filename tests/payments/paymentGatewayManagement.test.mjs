import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { query } from '../../db/pg.js';
import { depositEngine } from '../../lib/depositEngine.mjs';
import { paymentProviderService } from '../../lib/paymentProviders/paymentProviderService.mjs';

async function createTestUserAndWallet(userId, initialBalance = 0) {
  await query(
    `INSERT INTO users (user_id, email, role, kyc_status, created_at, updated_at)
     VALUES ($1, $2, 'USER', 'VERIFIED', NOW(), NOW())
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, `${userId}@test.com`]
  );

  await query(
    `INSERT INTO wallets (wallet_id, user_id, balance, locked_deposit_balance, currency, created_at, updated_at)
     VALUES ($1, $2, $3, 0, 'INR', NOW(), NOW())
     ON CONFLICT (wallet_id) DO UPDATE SET balance = $3`,
    [`wal_${userId}`, userId, initialBalance]
  );
}

function generateRazorpaySignature(orderId, paymentId, secret = 'rzp_test_webhook_secret') {
  return crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

test('ODDSYRA — PRODUCTION PAYMENT GATEWAY MANAGEMENT TEST SUITE', async (t) => {

  // Reset initial configs
  await query(`UPDATE payment_gateway_configs SET enabled = true, is_primary = true WHERE provider = 'CASHFREE'`);
  await query(`UPDATE payment_gateway_configs SET enabled = true, is_primary = false WHERE provider = 'RAZORPAY'`);

  await t.test('1. Default DB Configuration & Primary Resolution', async () => {
    const configs = await paymentProviderService.getGatewayConfigs();
    assert.equal(configs.length >= 2, true);
    
    const cashfree = configs.find(c => c.provider === 'CASHFREE');
    const razorpay = configs.find(c => c.provider === 'RAZORPAY');

    assert.equal(cashfree.enabled, true);
    assert.equal(cashfree.isPrimary, true);
    assert.equal(razorpay.enabled, true);
    assert.equal(razorpay.isPrimary, false);

    const target = await paymentProviderService.resolveTargetProvider();
    assert.equal(target, 'CASHFREE');
  });

  await t.test('2. Mode: CASHFREE ONLY (Razorpay Disabled) -> All new orders route to Cashfree', async () => {
    await paymentProviderService.updateGatewayConfig('RAZORPAY', { enabled: false });
    
    const target = await paymentProviderService.resolveTargetProvider();
    assert.equal(target, 'CASHFREE');

    const userId = `usr_gw_test_${Date.now()}_1`;
    await createTestUserAndWallet(userId, 0);

    const orderRes = await depositEngine.createOrder({ userId, amount: 500 });
    assert.equal(orderRes.success, true);
    assert.equal(orderRes.provider, 'CASHFREE');
    assert.ok(orderRes.orderId.startsWith('dep_'));
  });

  await t.test('3. Mode: RAZORPAY ONLY (Cashfree Disabled, Razorpay Primary) -> All new orders route to Razorpay', async () => {
    await paymentProviderService.updateGatewayConfig('CASHFREE', { enabled: false });
    await paymentProviderService.updateGatewayConfig('RAZORPAY', { enabled: true, isPrimary: true });

    const target = await paymentProviderService.resolveTargetProvider();
    assert.equal(target, 'RAZORPAY');

    const userId = `usr_gw_test_${Date.now()}_2`;
    await createTestUserAndWallet(userId, 0);

    const orderRes = await depositEngine.createOrder({ userId, amount: 1000 });
    assert.equal(orderRes.success, true);
    assert.equal(orderRes.provider, 'RAZORPAY');
    assert.ok(orderRes.orderId.startsWith('order_'));
  });

  await t.test('4. Mode: BOTH ENABLED -> Primary Gateway Switch dynamically changes new order routing', async () => {
    await paymentProviderService.updateGatewayConfig('CASHFREE', { enabled: true });
    await paymentProviderService.updateGatewayConfig('RAZORPAY', { enabled: true });

    // Switch Primary to CASHFREE
    await paymentProviderService.updateGatewayConfig('CASHFREE', { isPrimary: true });
    let resolved = await paymentProviderService.resolveTargetProvider();
    assert.equal(resolved, 'CASHFREE');

    // Switch Primary to RAZORPAY
    await paymentProviderService.updateGatewayConfig('RAZORPAY', { isPrimary: true });
    resolved = await paymentProviderService.resolveTargetProvider();
    assert.equal(resolved, 'RAZORPAY');
  });

  await t.test('5. Existing In-Flight Cashfree Order Settles Safely After Cashfree is Disabled', async () => {
    // 1. Enable Cashfree and create order
    await paymentProviderService.updateGatewayConfig('CASHFREE', { enabled: true, isPrimary: true });
    const userId = `usr_gw_test_${Date.now()}_5`;
    await createTestUserAndWallet(userId, 0);
    const orderRes = await depositEngine.createOrder({ userId, amount: 750, provider: 'CASHFREE' });
    assert.equal(orderRes.provider, 'CASHFREE');

    // 2. Admin now disables Cashfree
    await paymentProviderService.updateGatewayConfig('CASHFREE', { enabled: false });
    await paymentProviderService.updateGatewayConfig('RAZORPAY', { enabled: true, isPrimary: true });

    // 3. Incoming Webhook for the older Cashfree order arrives
    const paymentId = `cf_pay_${Date.now()}_5`;
    const webhookRes = await depositEngine.processWebhook({
      rawBody: JSON.stringify({
        event_time: new Date().toISOString(),
        type: 'PAYMENT_SUCCESS_WEBHOOK',
        data: {
          order: { order_id: orderRes.orderId, order_amount: 750, order_currency: 'INR' },
          payment: { cf_payment_id: paymentId, payment_status: 'SUCCESS', payment_amount: 750, payment_currency: 'INR' },
          customer_details: { customer_id: userId },
        },
      }),
      headers: {
        'x-webhook-signature': 'sig',
        'x-webhook-timestamp': String(Date.now()),
      },
      provider: 'CASHFREE',
    });

    assert.equal(webhookRes.status, 'PAID');
    assert.equal(webhookRes.provider, 'CASHFREE');
    assert.equal(webhookRes.newBalance, 750);
  });

  await t.test('6. Existing In-Flight Razorpay Order Settles Safely After Razorpay is Disabled', async () => {
    // 1. Enable Razorpay and create order
    await paymentProviderService.updateGatewayConfig('RAZORPAY', { enabled: true, isPrimary: true });
    const userId = `usr_gw_test_${Date.now()}_6`;
    await createTestUserAndWallet(userId, 100);
    const orderRes = await depositEngine.createOrder({ userId, amount: 600, provider: 'RAZORPAY' });
    assert.equal(orderRes.provider, 'RAZORPAY');

    // 2. Admin now disables Razorpay
    await paymentProviderService.updateGatewayConfig('RAZORPAY', { enabled: false });
    await paymentProviderService.updateGatewayConfig('CASHFREE', { enabled: true, isPrimary: true });

    // 3. Incoming Confirmation / Webhook for older Razorpay order
    const paymentId = `pay_rzp_${Date.now()}_6`;
    const signature = generateRazorpaySignature(orderRes.orderId, paymentId);
    const verifyRes = await depositEngine.confirmCheckoutPayment({
      userId,
      provider: 'RAZORPAY',
      razorpayOrderId: orderRes.orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
    });

    assert.equal(verifyRes.status, 'PAID');
    assert.equal(verifyRes.provider, 'RAZORPAY');
    assert.equal(verifyRes.newBalance, 700);
  });

  await t.test('7. Strict Provider Isolation: Cashfree Webhook Rejects Razorpay Order', async () => {
    // Create Razorpay order
    await paymentProviderService.updateGatewayConfig('RAZORPAY', { enabled: true });
    const userId = `usr_gw_test_${Date.now()}_7`;
    await createTestUserAndWallet(userId, 0);
    const orderRes = await depositEngine.createOrder({ userId, amount: 500, provider: 'RAZORPAY' });

    // Cashfree attempts to process Razorpay order -> Throws PROVIDER_MISMATCH
    await assert.rejects(
      async () => {
        await depositEngine.processVerifiedPayment({
          provider: 'CASHFREE',
          providerOrderId: orderRes.orderId,
          providerPaymentId: `cf_fake_${Date.now()}`,
          amountInINR: 500,
          userId,
        });
      },
      (err) => err.message.includes('PROVIDER_MISMATCH')
    );
  });

  await t.test('8. Strict Provider Isolation: Razorpay Webhook Rejects Cashfree Order', async () => {
    // Create Cashfree order
    await paymentProviderService.updateGatewayConfig('CASHFREE', { enabled: true });
    const userId = `usr_gw_test_${Date.now()}_8`;
    await createTestUserAndWallet(userId, 0);
    const orderRes = await depositEngine.createOrder({ userId, amount: 500, provider: 'CASHFREE' });

    // Razorpay attempts to process Cashfree order -> Throws PROVIDER_MISMATCH
    await assert.rejects(
      async () => {
        await depositEngine.processVerifiedPayment({
          provider: 'RAZORPAY',
          providerOrderId: orderRes.orderId,
          providerPaymentId: `rzp_fake_${Date.now()}`,
          amountInINR: 500,
          userId,
        });
      },
      (err) => err.message.includes('PROVIDER_MISMATCH')
    );
  });

  await t.test('9. Failsafe Mode: If All Gateways Disabled -> Clean Rejection with PAYMENTS_UNAVAILABLE', async () => {
    await paymentProviderService.updateGatewayConfig('CASHFREE', { enabled: false });
    await paymentProviderService.updateGatewayConfig('RAZORPAY', { enabled: false });

    const payload = await paymentProviderService.getPublicProvidersPayload();
    assert.equal(payload.paymentsAvailable, false);
    assert.equal(payload.providers.length, 0);

    const userId = `usr_gw_test_${Date.now()}_9`;
    await assert.rejects(
      async () => {
        await depositEngine.createOrder({ userId, amount: 500 });
      },
      (err) => err.code === 'PAYMENTS_UNAVAILABLE' || err.message.includes('PAYMENTS_UNAVAILABLE')
    );

    // Restore gateways
    await paymentProviderService.updateGatewayConfig('CASHFREE', { enabled: true, isPrimary: true });
    await paymentProviderService.updateGatewayConfig('RAZORPAY', { enabled: true, isPrimary: false });
  });

  await t.test('10. Admin Configuration Audit Logging in DB', async () => {
    await paymentProviderService.updateGatewayConfig(
      'RAZORPAY',
      { enabled: true, isPrimary: true },
      'admin_audit_tester'
    );

    const auditRes = await query(
      `SELECT * FROM audit_logs 
       WHERE action = 'PAYMENT_GATEWAY_CONFIG_CHANGED' AND actor_id = 'admin_audit_tester'
       ORDER BY created_at DESC LIMIT 1`
    );

    assert.equal(auditRes.rows.length, 1);
    assert.equal(auditRes.rows[0].entity_id, 'RAZORPAY');

    // Reset default
    await paymentProviderService.updateGatewayConfig('CASHFREE', { enabled: true, isPrimary: true });
  });

  await t.test('11. Safe Test Connection Execution Without Credential Leakage', async () => {
    const cfTest = await paymentProviderService.testGatewayConnection('CASHFREE');
    assert.equal(cfTest.provider, 'CASHFREE');
    assert.ok(typeof cfTest.healthy === 'boolean');
    assert.ok(typeof cfTest.latencyMs === 'number');
    assert.equal(cfTest.key_secret, undefined);
    assert.equal(cfTest.client_secret, undefined);

    const rzpTest = await paymentProviderService.testGatewayConnection('RAZORPAY');
    assert.equal(rzpTest.provider, 'RAZORPAY');
    assert.ok(typeof rzpTest.healthy === 'boolean');
    assert.ok(typeof rzpTest.latencyMs === 'number');
    assert.equal(rzpTest.key_secret, undefined);
  });
});
