/**
 * Admin Finance & Operational Router (server/routes/admin/finance.js)
 * Protected by Phase 2 RBAC (`requirePermission('finance')`).
 * Provides endpoints for wallet oversight, ledger audit logs, withdrawal reviews, financial adjustments, and reconciliation.
 */

import express from 'express';
import { query, queryRead, withTransaction } from '../../../db/pg.js';
import { requirePermission } from '../../middleware/adminAuth.js';
import { withdrawalEngine } from '../../../lib/withdrawalEngine.mjs';
import { financialReconciliationEngine } from '../../../lib/financialReconciliationEngine.mjs';

const router = express.Router();

/** GET /api/admin/finance/wallets */
router.get('/wallets', requirePermission('finance'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const result = await queryRead(
      `SELECT wallet_id, user_id, balance, COALESCE(reserved_balance, 0.00) as reserved_balance, currency, updated_at
       FROM wallets ORDER BY updated_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ wallets: result.rows, count: result.rows.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch wallets', message: err.message });
  }
});

/** GET /api/admin/finance/ledger */
router.get('/ledger', requirePermission('finance'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const result = await queryRead(
      `SELECT entry_id, wallet_id, transaction_id, type, amount, balance_after, description, created_at
       FROM ledger_entries ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ ledgerEntries: result.rows, count: result.rows.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ledger entries', message: err.message });
  }
});

/** GET /api/admin/finance/withdrawals */
router.get('/withdrawals', requirePermission('finance'), async (req, res) => {
  try {
    const status = req.query.status;
    let queryStr = 'SELECT * FROM withdrawals';
    const params = [];
    if (status) {
      queryStr += ' WHERE status = $1';
      params.push(status.toUpperCase());
    }
    queryStr += ' ORDER BY created_at DESC LIMIT 50';

    const result = await queryRead(queryStr, params);
    res.json({ withdrawals: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch withdrawals', message: err.message });
  }
});

/** POST /api/admin/finance/withdrawals/:id/review */
router.post('/withdrawals/:id/review', requirePermission('finance'), async (req, res) => {
  try {
    const { decision, reason, forceApprove } = req.body;
    const result = await withdrawalEngine.reviewWithdrawal({
      withdrawalId: req.params.id,
      adminId: req.admin?.id || req.user?.id || 'admin',
      decision,
      reason,
      forceApprove: Boolean(forceApprove),
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message, code: err.code });
  }
});

/** POST /api/admin/finance/reconcile */
router.post('/reconcile', requirePermission('finance'), async (req, res) => {
  try {
    const report = await financialReconciliationEngine.reconcileAllWallets();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: 'Reconciliation scan failed', message: err.message });
  }
});

/** GET /api/admin/finance/deposits — recent deposits for ops review */
router.get('/deposits', requirePermission('finance'), async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const status = req.query.status ? String(req.query.status).toUpperCase() : null;
    const params = [];
    let where = '';
    if (status) {
      params.push(status);
      where = `WHERE UPPER(COALESCE(status, '')) = $${params.length}`;
    }
    params.push(limit);
    const result = await queryRead(
      `SELECT deposit_id, user_id, amount, currency, status,
              payment_id, order_id, created_at, updated_at
       FROM deposits
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params,
    );
    res.json({
      deposits: (result.rows || []).map((r) => ({
        id: r.deposit_id,
        depositId: r.deposit_id,
        userId: r.user_id,
        amount: Number(r.amount || 0),
        currency: r.currency || 'INR',
        status: String(r.status || '').toUpperCase(),
        method: null,
        razorpayPaymentId: r.payment_id || null,
        razorpayOrderId: r.order_id || null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      count: (result.rows || []).length,
    });
  } catch (err) {
    res.status(500).json({ deposits: [], error: err.message });
  }
});

/** POST /api/admin/finance/deposits/:depositId/refund — Razorpay refund + ledger reversal */
router.post('/deposits/:depositId/refund', requirePermission('finance'), async (req, res) => {
  try {
    const { amount, reason, idempotencyKey } = req.body || {};
    const key = idempotencyKey
      || req.headers['x-idempotency-key']
      || `admin_refund:${req.params.depositId}:${amount ?? 'full'}:${req.admin?.id || 'unknown'}`;
    const { requestDepositRefund } = await import('../../../lib/razorpayRefundEngine.mjs');
    const result = await requestDepositRefund({
      depositId: req.params.depositId,
      amount: amount == null || amount === '' ? null : Number(amount),
      reason: reason || 'admin_refund',
      actorId: req.admin?.id || req.admin?.email || null,
      idempotencyKey: String(key),
      correlationId: req.correlationId || null,
    });
    if (result.status === 'MANUAL_REVIEW_REQUIRED') {
      return res.status(409).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message, code: err.code });
  }
});

/** GET /api/admin/finance/refunds/reconciliation */
router.get('/refunds/reconciliation', requirePermission('finance'), async (req, res) => {
  try {
    const { reconcileDepositRefunds } = await import('../../../lib/refundReconciliation.mjs');
    const result = await reconcileDepositRefunds({
      depositId: req.query.depositId || null,
      limit: Number(req.query.limit) || 50,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/admin/finance/refunds/manual-review */
router.get('/refunds/manual-review', requirePermission('finance'), async (req, res) => {
  try {
    const { listRefundManualReviews } = await import('../../../lib/refundReconciliation.mjs');
    const result = await listRefundManualReviews({ limit: Number(req.query.limit) || 50 });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/admin/finance/adjustments */
router.post('/adjustments', requirePermission('finance'), async (req, res) => {
  try {
    const { userId, type, amount, reason } = req.body;
    if (!userId || !type || !amount || !reason) {
      return res.status(400).json({ error: 'userId, type (CREDIT/DEBIT), amount, and reason are required' });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Invalid adjustment amount' });
    }

    const result = await withTransaction(async (client) => {
      const wRes = await client.query('SELECT wallet_id, balance FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
      if (wRes.rows.length === 0) throw new Error(`Wallet not found for user ${userId}`);

      const wallet = wRes.rows[0];
      const curBalance = parseFloat(wallet.balance);
      let newBalance = curBalance;

      if (type === 'CREDIT') {
        newBalance = curBalance + numAmount;
      } else if (type === 'DEBIT') {
        if (curBalance < numAmount) throw new Error('INSUFFICIENT_FUNDS for debit adjustment');
        newBalance = curBalance - numAmount;
      } else {
        throw new Error('Type must be CREDIT or DEBIT');
      }

      await client.query('UPDATE wallets SET balance = $1, updated_at = NOW() WHERE wallet_id = $2', [newBalance, wallet.wallet_id]);

      const txId = `tx_adj_${Date.now()}`;
      await client.query(
        `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
         VALUES ($1, $2, 'ADMIN_ADJUSTMENT', $3, 'SUCCESS', NOW())`,
        [txId, userId, numAmount]
      );

      await client.query(
        `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [wallet.wallet_id, txId, type, numAmount, newBalance, `Admin Adjustment by ${req.user.id}: ${reason}`]
      );

      return { userId, walletId: wallet.wallet_id, newBalance, type, amount: numAmount };
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** GET /api/admin/finance/control-center — KPI rollup (read-only) */
router.get('/control-center', requirePermission('finance'), async (req, res) => {
  try {
    const { getFinanceControlCenterKpis } = await import('../../../lib/financeDailyClosingEngine.mjs');
    res.json(await getFinanceControlCenterKpis());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/admin/finance/daily-closing?date=YYYY-MM-DD */
router.get('/daily-closing', requirePermission('finance'), async (req, res) => {
  try {
    const { getOrOpenDailyClosing, listDailyClosings, computeDailyClosingSnapshot } = await import(
      '../../../lib/financeDailyClosingEngine.mjs'
    );
    if (req.query.list === '1') {
      return res.json(await listDailyClosings({ limit: Number(req.query.limit) || 30 }));
    }
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    if (req.query.preview === '1') {
      return res.json({ success: true, snapshot: await computeDailyClosingSnapshot(date) });
    }
    const result = await getOrOpenDailyClosing(date, { adminId: req.admin?.id });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

/** POST /api/admin/finance/daily-closing/:action — review | sign-off | reopen */
router.post('/daily-closing/:action', requirePermission('finance'), async (req, res) => {
  try {
    const { transitionDailyClosing } = await import('../../../lib/financeDailyClosingEngine.mjs');
    const { logAdminAction } = await import('../../middleware/auditLogger.js');
    const action = String(req.params.action || '').toLowerCase();
    const date = req.body?.date || req.query.date;
    const result = await transitionDailyClosing({
      closingDate: date,
      action,
      adminId: req.admin?.id || 'admin',
      reason: req.body?.reason || null,
      notes: req.body?.notes || null,
    });
    await logAdminAction({
      actorId: req.admin?.id,
      targetId: result.closing?.closing_id,
      action: `FINANCE_DAILY_CLOSING_${action.toUpperCase().replace('-', '_')}`,
      details: { date, status: result.closing?.status, reason: req.body?.reason || null },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.correlationId || req.headers['x-request-id'] || null,
      riskLevel: action === 'reopen' ? 'HIGH' : 'MEDIUM',
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message, code: err.code });
  }
});

/** GET /api/admin/finance/anomalies */
router.get('/anomalies', requirePermission('finance'), async (req, res) => {
  try {
    const { listFinancialAnomalies } = await import('../../../lib/financialAnomalyEngine.mjs');
    res.json(await listFinancialAnomalies({
      limit: Number(req.query.limit) || 50,
      severity: req.query.severity || null,
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
