import { Router } from 'express';
import { requireAuth } from '../middleware/userAuth.js';

const router = Router();
const isProduction = process.env.NODE_ENV === 'production';

if (!isProduction) {
  router.post('/api/create-order', async (req, res) => {
    const { amount, userId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid deposit amount' });
    }

    try {
      const mockOrder = {
        id: `order_${Math.random().toString(36).substring(2, 12)}`,
        entity: 'order',
        amount: amount * 100,
        amount_paid: 0,
        amount_due: amount * 100,
        currency: 'INR',
        receipt: `rcpt_${userId || 'user123'}_${Date.now()}`,
        status: 'created',
        notes: { userId: userId || 'user123' },
      };

      console.log(`[API] Dev mock order created: ${mockOrder.id} for ₹${amount}`);
      res.json(mockOrder);
    } catch (err) {
      console.error('[API Error] Failed to create order:', err);
      res.status(500).json({ error: 'Server error creating order' });
    }
  });
}

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
    const statusCode = err.message?.includes('INVALID_SIGNATURE') ? 400 : 500;
    res.status(statusCode).json({ error: err.message || 'Webhook processing failed' });
  }
});

router.post('/api/v1/payments/create-order', requireAuth, async (req, res) => {
  try {
    const { depositEngine } = await import('../../lib/depositEngine.mjs');
    const result = await depositEngine.createOrder(
      { ...req.body, userId: req.user.userId },
      req.correlationId,
    );
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message, code: err.code });
  }
});

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
