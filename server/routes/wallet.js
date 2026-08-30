import { Router } from 'express';
import { requireAuth } from '../middleware/userAuth.js';

const router = Router();
const isProduction = process.env.NODE_ENV === 'production';

// Webhook endpoint for Razorpay payment captures / refunds / failures
router.post('/api/webhooks/razorpay', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  try {
    const { depositEngine } = await import('../../lib/depositEngine.mjs');
    const result = await depositEngine.processWebhook({
      rawBody: req.rawBody,
      signature,
      payload: req.body.payload,
      event: req.body.event,
    }, req.correlationId);

    res.json(result);
  } catch (err) {
    const statusCode = err.message?.includes('INVALID_SIGNATURE') || err.message?.includes('MISSING_SIGNATURE') ? 400 : 500;
    res.status(statusCode).json({ error: err.message || 'Webhook processing failed' });
  }
});

// Create Razorpay Order (supports both /api/payments/razorpay/create-order and /api/v1/payments/create-order)
const handleCreateOrder = async (req, res) => {
  try {
    const { depositEngine } = await import('../../lib/depositEngine.mjs');
    const result = await depositEngine.createOrder(
      { ...req.body, userId: req.user.userId },
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

router.post('/api/payments/razorpay/create-order', requireAuth, handleCreateOrder);
router.post('/api/v1/payments/create-order', requireAuth, handleCreateOrder);

// Verify Razorpay Payment (supports both /api/payments/razorpay/verify and /api/v1/payments/confirm)
const handleVerifyPayment = async (req, res) => {
  try {
    const { depositEngine } = await import('../../lib/depositEngine.mjs');
    const result = await depositEngine.confirmCheckoutPayment(
      {
        userId: req.user.userId,
        depositId: req.body?.depositId || req.body?.deposit_id,
        razorpayOrderId: req.body?.razorpay_order_id || req.body?.orderId || req.body?.razorpayOrderId,
        razorpayPaymentId: req.body?.razorpay_payment_id || req.body?.paymentId || req.body?.razorpayPaymentId,
        razorpaySignature: req.body?.razorpay_signature || req.body?.signature || req.body?.razorpaySignature,
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
router.post('/api/v1/payments/confirm', requireAuth, handleVerifyPayment);

// Withdrawals
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
