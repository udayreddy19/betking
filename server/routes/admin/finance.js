/**
 * Admin Finance & Operational Router (server/routes/admin/finance.js)
 * Protected by Phase 2 RBAC (`requirePermission('finance')`).
 * Provides endpoints for wallet oversight, ledger audit logs, withdrawal reviews, financial adjustments, and reconciliation.
 */

import express from 'express';
import { query, withTransaction } from '../../../db/pg.js';
import { adminAuth, requirePermission } from '../middleware/adminAuth.js';
import { withdrawalEngine } from '../../../lib/withdrawalEngine.mjs';
import { financialReconciliationEngine } from '../../../lib/financialReconciliationEngine.mjs';

const router = express.Router();
router.use(adminAuth);

/** GET /api/admin/finance/wallets */
router.get('/wallets', requirePermission('finance'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const result = await query(
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
    const result = await query(
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

    const result = await query(queryStr, params);
    res.json({ withdrawals: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch withdrawals', message: err.message });
  }
});

/** POST /api/admin/finance/withdrawals/:id/review */
router.post('/withdrawals/:id/review', requirePermission('finance'), async (req, res) => {
  try {
    const { decision, reason } = req.body;
    const result = await withdrawalEngine.reviewWithdrawal({
      withdrawalId: req.params.id,
      adminId: req.admin?.id || req.user?.id || 'admin',
      decision,
      reason,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
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

export default router;
