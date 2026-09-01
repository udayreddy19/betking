import { Router } from 'express';
import { requireAuth, requireVerified } from '../middleware/userAuth.js';

const router = Router();

// ── 1. WEBHOOK ENDPOINTS ──────────────────────────────────────────────────────

// Razorpay Webhook
router.post('/api/webhooks/razorpay', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  try {
    const { depositEngine } = await import('../../lib/depositEngine.mjs');
    const result = await depositEngine.processWebhook({
      rawBody: req.rawBody,
      headers: req.headers,
      signature,
      payload: req.body?.payload,
      event: req.body?.event,
      provider: 'RAZORPAY',
    }, req.correlationId);

    res.json(result);
  } catch (err) {
    const statusCode = err.message?.includes('INVALID_SIGNATURE') || err.message?.includes('MISSING_SIGNATURE') ? 400 : 500;
    res.status(statusCode).json({ error: err.message || 'Razorpay webhook processing failed' });
  }
});

// Cashfree Webhook
router.all('/api/webhooks/cashfree', async (req, res) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return res.status(200).json({ status: 'ok', message: 'Cashfree webhook endpoint active' });
  }

  const eventType = String(req.body?.event || req.body?.type || '');
  const isDashboardPing = eventType === 'TEST' || eventType === 'WEBHOOK_TEST';
  if (isDashboardPing && process.env.NODE_ENV !== 'production') {
    return res.status(200).json({ status: 'ok', message: 'Cashfree test webhook received' });
  }

  try {
    const { depositEngine } = await import('../../lib/depositEngine.mjs');
    const result = await depositEngine.processWebhook({
      rawBody: req.rawBody,
      headers: req.headers,
      provider: 'CASHFREE',
    }, req.correlationId);

    res.json(result);
  } catch (err) {
    const statusCode = err.message?.includes('INVALID_SIGNATURE') || err.message?.includes('MISSING_SIGNATURE') ? 400 : 500;
    res.status(statusCode).json({ error: err.message || 'Cashfree webhook processing failed' });
  }
});

// ── 2. PROVIDER CONFIG / AVAILABILITY ─────────────────────────────────────────

router.get('/api/v1/payments/providers', async (req, res) => {
  try {
    const { paymentProviderService } = await import('../../lib/paymentProviders/paymentProviderService.mjs');
    const payload = await paymentProviderService.getPublicProvidersPayload();
    res.json(payload);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 3. ORDER CREATION ENDPOINTS ───────────────────────────────────────────────

const handleCreateOrder = async (req, res) => {
  try {
    const { depositEngine } = await import('../../lib/depositEngine.mjs');
    const provider = req.body?.provider || (req.path.includes('cashfree') ? 'CASHFREE' : (req.path.includes('razorpay') ? 'RAZORPAY' : undefined));
    const result = await depositEngine.createOrder(
      { ...req.body, userId: req.user.userId, provider },
      req.correlationId,
    );
    res.json(result);
  } catch (err) {
    const message = err?.message || err?.error?.description || 'Unable to create deposit order';
    res.status(err.status || err.statusCode || 400).json({
      success: false,
      error: message,
      code: err.code || err?.error?.code,
    });
  }
};

router.post('/api/payments/razorpay/create-order', requireAuth, requireVerified, handleCreateOrder);
router.post('/api/payments/cashfree/create-order', requireAuth, requireVerified, handleCreateOrder);
router.post('/api/v1/payments/cashfree/create-order', requireAuth, requireVerified, handleCreateOrder);
router.post('/api/v1/payments/create-order', requireAuth, requireVerified, handleCreateOrder);

// ── 4. PAYMENT VERIFICATION ENDPOINTS ─────────────────────────────────────────

const handleVerifyPayment = async (req, res) => {
  try {
    const { depositEngine } = await import('../../lib/depositEngine.mjs');
    const inferredProvider = req.body?.provider || (req.path.includes('cashfree') ? 'CASHFREE' : (req.path.includes('razorpay') ? 'RAZORPAY' : undefined));
    const result = await depositEngine.confirmCheckoutPayment(
      {
        userId: req.user.userId,
        provider: inferredProvider,
        depositId: req.body?.depositId || req.body?.deposit_id,
        orderId: req.body?.orderId || req.body?.order_id || req.body?.razorpayOrderId || req.body?.cfOrderId,
        paymentId: req.body?.paymentId || req.body?.payment_id || req.body?.razorpayPaymentId || req.body?.cfPaymentId,
        razorpayOrderId: req.body?.razorpay_order_id || req.body?.orderId || req.body?.razorpayOrderId,
        razorpayPaymentId: req.body?.razorpay_payment_id || req.body?.paymentId || req.body?.razorpayPaymentId,
        razorpaySignature: req.body?.razorpay_signature || req.body?.signature || req.body?.razorpaySignature,
        cfOrderId: req.body?.cfOrderId || req.body?.cf_order_id,
        cfPaymentId: req.body?.cfPaymentId || req.body?.cf_payment_id,
      },
      req.correlationId,
    );
    res.json({ success: true, ...result });
  } catch (err) {
    const message = err?.message || 'Unable to confirm deposit payment';
    res.status(err.status || err.statusCode || 400).json({
      success: false,
      error: message,
      code: err.code || err?.error?.code,
    });
  }
};

router.post('/api/payments/razorpay/verify', requireAuth, handleVerifyPayment);
router.post('/api/payments/cashfree/verify', requireAuth, handleVerifyPayment);
router.post('/api/v1/payments/cashfree/verify', requireAuth, handleVerifyPayment);
router.post('/api/v1/payments/confirm', requireAuth, handleVerifyPayment);

// ── 5. WITHDRAWALS & WALLET LEDGER ────────────────────────────────────────────

router.post('/api/v1/withdrawals/request', requireAuth, async (req, res) => {
  try {
    const { withdrawalEngine } = await import('../../lib/withdrawalEngine.mjs');
    const result = await withdrawalEngine.requestWithdrawal(
      { ...req.body, userId: req.user.userId },
      req.correlationId,
    );
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({ success: false, error: err.message, code: err.code });
  }
});

router.get('/api/v1/withdrawals/pending', requireAuth, async (req, res) => {
  try {
    const { withdrawalEngine } = await import('../../lib/withdrawalEngine.mjs');
    const result = await withdrawalEngine.listCancellableWithdrawals(req.user.userId, {
      limit: Number(req.query.limit) || 50,
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message, code: err.code });
  }
});

router.post('/api/v1/withdrawals/:id/cancel', requireAuth, async (req, res) => {
  try {
    const { withdrawalEngine } = await import('../../lib/withdrawalEngine.mjs');
    const result = await withdrawalEngine.cancelWithdrawal({
      userId: req.user.userId,
      withdrawalId: req.params.id,
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({ success: false, error: err.message, code: err.code });
  }
});

router.get('/api/v1/user/bonuses', requireAuth, async (req, res) => {
  try {
    const { query } = await import('../../db/pg.js');
    const bonusesRes = await query(`
      SELECT ub.id, ub.bonus_amount, ub.wagering_required, ub.wagering_completed, ub.status, ub.expires_at,
             p.name AS promo_name, p.code
      FROM user_bonuses ub
      JOIN promotions p ON ub.promotion_id = p.id
      WHERE ub.user_id = $1
      ORDER BY ub.created_at DESC;
    `, [req.user.userId]);
    res.json({ success: true, count: bonusesRes.rows.length, bonuses: bonusesRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/v1/user/transactions', requireAuth, async (req, res) => {
  try {
    const { fetchUserTransactions } = await import('../../lib/userTransactions.mjs');
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const transactions = await fetchUserTransactions(req.user.userId, { limit, offset });
    res.json({ success: true, count: transactions.length, transactions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
