/**
 * Admin Finance & Operational Router (server/routes/admin/finance.js)
 * Protected by Phase 2 RBAC (`requirePermission('finance')`).
 * Provides endpoints for wallet oversight, ledger audit logs, withdrawal reviews, financial adjustments, and reconciliation.
 */

import express from 'express';
import { query, queryRead, withTransaction } from '../../../db/pg.js';
import { requirePermission } from '../../middleware/adminAuth.js';
import { randomUUID } from 'crypto';
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
    const { decision, reason, forceApprove, paidAmount, payoutRef, utr, referenceNumber } = req.body;
    const result = await withdrawalEngine.reviewWithdrawal({
      withdrawalId: req.params.id,
      adminId: req.admin?.id || req.user?.id || 'admin',
      decision,
      reason,
      forceApprove: Boolean(forceApprove),
      paidAmount,
      payoutRef,
      utr,
      referenceNumber,
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

    const paise = Math.round(Number(amount) * 100);
    if (!Number.isFinite(paise) || paise <= 0) {
      return res.status(400).json({ error: 'Invalid adjustment amount' });
    }
    const numAmount = (paise / 100).toFixed(2);
    const adminId = req.admin?.id || 'admin';

    const result = await withTransaction(async (client) => {
      const wRes = await client.query(
        `SELECT wallet_id, balance, COALESCE(reserved_balance, 0) AS reserved_balance
         FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      if (wRes.rows.length === 0) throw new Error(`Wallet not found for user ${userId}`);

      const wallet = wRes.rows[0];
      const txId = `tx_adj_${randomUUID()}`;
      let updated;

      if (type === 'CREDIT') {
        updated = await client.query(
          `UPDATE wallets SET balance = balance + $1::numeric, updated_at = NOW()
           WHERE wallet_id = $2
           RETURNING balance`,
          [numAmount, wallet.wallet_id],
        );
      } else if (type === 'DEBIT') {
        updated = await client.query(
          `UPDATE wallets SET balance = balance - $1::numeric, updated_at = NOW()
           WHERE wallet_id = $2
             AND (balance - COALESCE(reserved_balance, 0)) >= $1::numeric
           RETURNING balance`,
          [numAmount, wallet.wallet_id],
        );
        if (updated.rowCount === 0) throw new Error('INSUFFICIENT_FUNDS for debit adjustment');
      } else {
        throw new Error('Type must be CREDIT or DEBIT');
      }

      const newBalance = updated.rows[0].balance;

      await client.query(
        `INSERT INTO transactions (transaction_id, user_id, type, amount, status, created_at)
         VALUES ($1, $2, 'ADMIN_ADJUSTMENT', $3, 'SUCCESS', NOW())`,
        [txId, userId, numAmount],
      );

      await client.query(
        `INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [wallet.wallet_id, txId, type, numAmount, newBalance, `Admin Adjustment by ${adminId}: ${reason}`],
      );

      return { userId, walletId: wallet.wallet_id, newBalance, type, amount: Number(numAmount) };
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

/** GET /api/admin/finance/users/lookup — Search users by user_id, email, display_name, or phone for quick wallet investigation */
router.get('/users/lookup', requirePermission('finance'), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) {
      // Return 10 recent users by default
      const recent = await queryRead(
        `SELECT u.user_id, u.email, u.phone, u.created_at, up.display_name, up.kyc_status,
                COALESCE(w.balance, 0.00) as balance, COALESCE(w.currency, 'INR') as currency
         FROM users u
         LEFT JOIN user_profiles up ON u.user_id = up.user_id
         LEFT JOIN wallets w ON u.user_id = w.user_id
         ORDER BY u.created_at DESC
         LIMIT 10`
      );
      return res.json({
        users: recent.rows.map((r) => ({
          userId: r.user_id,
          email: r.email,
          phone: r.phone,
          displayName: r.display_name,
          kycStatus: r.kyc_status,
          balance: Number(r.balance),
          currency: r.currency,
          createdAt: r.created_at,
        })),
      });
    }

    const likeQ = `%${q.toLowerCase()}%`;
    const result = await queryRead(
      `SELECT u.user_id, u.email, u.phone, u.created_at, up.display_name, up.kyc_status,
              COALESCE(w.balance, 0.00) as balance, COALESCE(w.currency, 'INR') as currency
       FROM users u
       LEFT JOIN user_profiles up ON u.user_id = up.user_id
       LEFT JOIN wallets w ON u.user_id = w.user_id
       WHERE u.user_id = $1
          OR LOWER(u.email) = LOWER($1)
          OR u.phone = $1
          OR LOWER(u.email) LIKE $2
          OR LOWER(u.user_id) LIKE $2
          OR LOWER(COALESCE(up.display_name, '')) LIKE $2
          OR u.phone LIKE $2
       ORDER BY u.created_at DESC
       LIMIT 20`,
      [q, likeQ]
    );

    res.json({
      users: result.rows.map((r) => ({
        userId: r.user_id,
        email: r.email,
        phone: r.phone,
        displayName: r.display_name,
        kycStatus: r.kyc_status,
        balance: Number(r.balance),
        currency: r.currency,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to lookup users', message: err.message });
  }
});

/** GET /api/admin/finance/investigate — Search by user/email/txId/betId/wdId and return financial timeline */
router.get('/investigate', requirePermission('finance'), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ error: 'Search query (user ID, email, username, tx ID, bet ID, or withdrawal ID) is required' });
    }

    let targetUserId = null;

    // 1. Direct user / email / display_name / phone match
    const userMatch = await queryRead(
      `SELECT u.user_id, u.email, u.phone, u.created_at, up.display_name, up.account_status, up.kyc_status
       FROM users u
       LEFT JOIN user_profiles up ON u.user_id = up.user_id
       WHERE u.user_id = $1
          OR LOWER(u.email) = LOWER($1)
          OR u.phone = $1
          OR LOWER(COALESCE(up.display_name, '')) = LOWER($1)
          OR LOWER(u.email) LIKE $2
          OR LOWER(u.user_id) LIKE $2
          OR LOWER(COALESCE(up.display_name, '')) LIKE $2
       LIMIT 1`,
      [q, `%${q.toLowerCase()}%`]
    );
    if (userMatch.rows.length > 0) {
      targetUserId = userMatch.rows[0].user_id;
    }

    // 2. Transaction ID match
    if (!targetUserId) {
      const txMatch = await queryRead(
        `SELECT user_id FROM transactions WHERE transaction_id = $1 OR provider_payment_id = $1 OR utr = $1 LIMIT 1`,
        [q]
      );
      if (txMatch.rows.length > 0) targetUserId = txMatch.rows[0].user_id;
    }

    // 3. Bet ID match
    if (!targetUserId) {
      const betMatch = await queryRead(
        `SELECT user_id FROM bets WHERE bet_id = $1 LIMIT 1`,
        [q]
      );
      if (betMatch.rows.length > 0) targetUserId = betMatch.rows[0].user_id;
    }

    // 4. Withdrawal ID match
    if (!targetUserId) {
      const wdMatch = await queryRead(
        `SELECT user_id FROM withdrawals WHERE withdrawal_id = $1 OR payout_id = $1 LIMIT 1`,
        [q]
      );
      if (wdMatch.rows.length > 0) targetUserId = wdMatch.rows[0].user_id;
    }

    // 5. Deposit ID match
    if (!targetUserId) {
      const depMatch = await queryRead(
        `SELECT user_id FROM deposits WHERE deposit_id = $1 OR order_id = $1 OR payment_id = $1 LIMIT 1`,
        [q]
      );
      if (depMatch.rows.length > 0) targetUserId = depMatch.rows[0].user_id;
    }

    if (!targetUserId) {
      return res.status(404).json({ error: 'No matching user or financial record found for search query' });
    }

    // Fetch user details & wallet
    const userRes = await queryRead(
      `SELECT u.user_id, u.email, u.phone, u.created_at,
              up.display_name, up.account_status, up.kyc_status,
              w.wallet_id, w.balance, w.bonus_balance, w.reserved_balance, w.freebet_balance,
              w.locked_deposit_balance, w.winnings_balance, w.currency, w.updated_at as wallet_updated_at
       FROM users u
       LEFT JOIN user_profiles up ON u.user_id = up.user_id
       LEFT JOIN wallets w ON u.user_id = w.user_id
       WHERE u.user_id = $1`,
      [targetUserId]
    );

    const user = userRes.rows[0] || null;

    // Fetch unified chronological timeline
    const timelineRes = await queryRead(
      `SELECT t.transaction_id as id,
              t.type,
              t.amount,
              t.status,
              t.method,
              t.utr,
              t.created_at,
              le.balance_after,
              le.description
       FROM transactions t
       LEFT JOIN ledger_entries le ON t.transaction_id = le.transaction_id
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC
       LIMIT 100`,
      [targetUserId]
    );

    res.json({
      success: true,
      user: {
        userId: user?.user_id,
        email: user?.email,
        displayName: user?.display_name || user?.full_name,
        fullName: user?.display_name || user?.full_name,
        phone: user?.phone,
        status: user?.account_status || user?.status || 'ACTIVE',
        kycStatus: user?.kyc_status || 'NOT_STARTED',
        createdAt: user?.created_at,
      },
      wallet: {
        walletId: user?.wallet_id,
        balance: Number(user?.balance || 0),
        bonusBalance: Number(user?.bonus_balance || 0),
        reservedBalance: Number(user?.reserved_balance || 0),
        freebetBalance: Number(user?.freebet_balance || 0),
        lockedDepositBalance: Number(user?.locked_deposit_balance || 0),
        winningsBalance: Number(user?.winnings_balance || 0),
        currency: user?.currency || 'INR',
        updatedAt: user?.wallet_updated_at,
      },
      timeline: timelineRes.rows.map((r) => ({
        id: r.id,
        type: r.type,
        amount: Number(r.amount || 0),
        status: r.status,
        method: r.method,
        utr: r.utr,
        createdAt: r.created_at,
        balanceAfter: r.balance_after != null ? Number(r.balance_after) : null,
        description: r.description || `${r.type} transaction`,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to investigate user wallet', message: err.message });
  }
});

/** GET /api/admin/finance/reconciliation-overview — Read-only dashboard summary metrics */
router.get('/reconciliation-overview', requirePermission('finance'), async (req, res) => {
  try {
    const walletsRes = await queryRead(
      `SELECT count(*)::int as total_wallets,
              COALESCE(SUM(balance), 0)::numeric(14,2) as total_cash_balance,
              COALESCE(SUM(bonus_balance), 0)::numeric(14,2) as total_bonus_balance,
              COALESCE(SUM(reserved_balance), 0)::numeric(14,2) as total_reserved_balance,
              COALESCE(SUM(freebet_balance), 0)::numeric(14,2) as total_freebet_balance
       FROM wallets`
    );

    const negWalletsRes = await queryRead(
      `SELECT count(*)::int as count FROM wallets WHERE balance < 0 OR bonus_balance < 0 OR freebet_balance < 0 OR reserved_balance < 0`
    );

    const pendingDepRes = await queryRead(
      `SELECT count(*)::int as count FROM deposits WHERE UPPER(status) = 'CREATED'`
    );

    const pendingWdRes = await queryRead(
      `SELECT count(*)::int as count FROM withdrawals WHERE UPPER(status) IN ('PENDING', 'UNDER_REVIEW', 'PENDING_CHECKER', 'PROCESSING')`
    );

    const failedTxRes = await queryRead(
      `SELECT count(*)::int as count FROM transactions WHERE UPPER(status) = 'FAILED'`
    );

    const orphanLedgerRes = await queryRead(
      `SELECT count(*)::int as count FROM ledger_entries le LEFT JOIN wallets w ON le.wallet_id = w.wallet_id WHERE w.wallet_id IS NULL`
    );

    const discrepanciesRes = await queryRead(
      `SELECT count(*)::int as count FROM financial_discrepancies WHERE status = 'OPEN'`
    );

    const row = walletsRes.rows[0] || {};
    res.json({
      success: true,
      isReadOnly: true,
      totalWallets: Number(row.total_wallets || 0),
      totalCashBalance: Number(row.total_cash_balance || 0),
      totalBonusBalance: Number(row.total_bonus_balance || 0),
      totalReservedBalance: Number(row.total_reserved_balance || 0),
      totalFreebetBalance: Number(row.total_freebet_balance || 0),
      negativeBalanceWalletsCount: Number(negWalletsRes.rows[0]?.count || 0),
      pendingDepositsCount: Number(pendingDepRes.rows[0]?.count || 0),
      pendingWithdrawalsCount: Number(pendingWdRes.rows[0]?.count || 0),
      failedTransactionsCount: Number(failedTxRes.rows[0]?.count || 0),
      orphanLedgerCount: Number(orphanLedgerRes.rows[0]?.count || 0),
      discrepancyCount: Number(discrepanciesRes.rows[0]?.count || 0),
      lastAuditedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load reconciliation overview', message: err.message });
  }
});

/** GET /api/admin/finance/payments — List deposit transactions across all providers (or filtered by provider) */
const handleListPayments = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const status = req.query.status && req.query.status !== 'ALL' ? String(req.query.status).toUpperCase() : null;
    const provider = req.query.provider && req.query.provider !== 'ALL' ? String(req.query.provider).toUpperCase() : null;
    const search = req.query.search ? String(req.query.search).trim() : null;
    const userId = req.query.userId ? String(req.query.userId).trim() : null;

    const params = [];
    const conditions = [];

    if (status) {
      params.push(status);
      conditions.push(`UPPER(COALESCE(d.status, '')) = $${params.length}`);
    }

    if (provider) {
      params.push(provider);
      conditions.push(`UPPER(COALESCE(d.provider, '')) = $${params.length}`);
    }

    if (userId) {
      params.push(userId);
      conditions.push(`d.user_id = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(d.deposit_id ILIKE $${params.length} OR d.order_id ILIKE $${params.length} OR d.payment_id ILIKE $${params.length} OR d.cf_order_id ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.display_name ILIKE $${params.length})`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit);
    params.push(offset);

    const result = await queryRead(
      `SELECT d.id, d.deposit_id, d.user_id, d.amount, d.amount_paise, d.currency, d.provider,
              d.status, d.order_id, d.payment_id, d.cf_order_id, d.created_at, d.updated_at, d.paid_at,
              u.email AS user_email, u.display_name AS user_name,
              pwh.status AS webhook_status, pwh.created_at AS webhook_received_at
       FROM deposits d
       LEFT JOIN users u ON d.user_id = u.user_id
       LEFT JOIN payment_webhook_events pwh ON pwh.provider_event_id = ('evt_rzp_' || d.payment_id || '_payment.captured')
                                            OR pwh.provider_event_id = ('evt_cf_' || d.payment_id || '_PAYMENT_SUCCESS_WEBHOOK')
       ${where}
       ORDER BY d.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      count: result.rows.length,
      payments: result.rows.map((r) => ({
        id: r.deposit_id || r.id,
        depositId: r.deposit_id || r.id,
        userId: r.user_id,
        userName: r.user_name || r.user_email || r.user_id,
        userEmail: r.user_email,
        amount: Number(r.amount || 0),
        amountPaise: r.amount_paise ? Number(r.amount_paise) : Math.round(Number(r.amount || 0) * 100),
        currency: r.currency || 'INR',
        provider: r.provider || 'CASHFREE',
        status: String(r.status || 'PENDING').toUpperCase(),
        providerOrderId: r.order_id,
        providerPaymentId: r.payment_id,
        cfOrderId: r.cf_order_id,
        razorpayOrderId: r.provider === 'RAZORPAY' ? r.order_id : undefined,
        razorpayPaymentId: r.provider === 'RAZORPAY' ? r.payment_id : undefined,
        webhookStatus: r.webhook_status || (r.status === 'PAID' ? 'PROCESSED' : 'PENDING'),
        webhookReceivedAt: r.webhook_received_at,
        createdAt: r.created_at,
        paidAt: r.paid_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch payments', message: err.message });
  }
};

router.get('/payments', requirePermission('finance'), handleListPayments);
router.get('/razorpay/payments', requirePermission('finance'), handleListPayments);

/** POST /api/admin/finance/razorpay/reconcile/:orderId — Authoritative Razorpay API reconciliation */
router.post('/razorpay/reconcile/:orderId', requirePermission('finance'), async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const { query } = await import('../../../db/pg.js');
    const depRes = await query(`SELECT * FROM deposits WHERE order_id = $1`, [orderId]);

    if (depRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: `No deposit record found for order '${orderId}'` });
    }

    const deposit = depRes.rows[0];
    if (String(deposit.status).toUpperCase() === 'PAID' || String(deposit.status).toUpperCase() === 'CAPTURED') {
      return res.json({ success: true, message: 'Deposit is already PAID', deposit });
    }

    const { paymentProviderService } = await import('../../../lib/paymentProviders/paymentProviderService.mjs');
    const provider = paymentProviderService.getProvider('RAZORPAY');
    const paymentStatus = await provider.fetchPaymentStatus(orderId);

    if (paymentStatus.status !== 'captured' && paymentStatus.status !== 'authorized' && paymentStatus.status !== 'SUCCESS') {
      return res.json({
        success: false,
        message: `No captured payment found on Razorpay for order '${orderId}'`,
        details: paymentStatus,
      });
    }

    const { depositEngine } = await import('../../../lib/depositEngine.mjs');
    const result = await depositEngine.processVerifiedPayment({
      provider: 'RAZORPAY',
      depositId: deposit.deposit_id || deposit.id,
      providerOrderId: orderId,
      providerPaymentId: paymentStatus.paymentId,
      amountInINR: paymentStatus.amountInINR || parseFloat(deposit.amount),
      userId: deposit.user_id,
      method: paymentStatus.method || 'upi',
      utr: paymentStatus.utr || paymentStatus.paymentId,
      rawPayload: { source: 'admin_reconcile', payment: paymentStatus.raw },
      source: 'ADMIN_RECONCILE',
      correlationId: req.correlationId || null,
    });

    res.json({ success: true, message: 'Deposit successfully reconciled and credited', result });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Reconciliation failed', message: err.message });
  }
});

/** POST /api/admin/finance/cashfree/reconcile/:orderId — Authoritative Cashfree API reconciliation */
router.post('/cashfree/reconcile/:orderId', requirePermission('finance'), async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const { query } = await import('../../../db/pg.js');
    const depRes = await query(`SELECT * FROM deposits WHERE order_id = $1 OR cf_order_id = $1`, [orderId]);

    if (depRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: `No deposit record found for Cashfree order '${orderId}'` });
    }

    const deposit = depRes.rows[0];
    if (String(deposit.status).toUpperCase() === 'PAID' || String(deposit.status).toUpperCase() === 'CAPTURED') {
      return res.json({ success: true, message: 'Deposit is already PAID', deposit });
    }

    const { paymentProviderService } = await import('../../../lib/paymentProviders/paymentProviderService.mjs');
    const provider = paymentProviderService.getProvider('CASHFREE');
    const paymentStatus = await provider.fetchPaymentStatus(orderId);

    if (paymentStatus.status !== 'SUCCESS') {
      return res.json({
        success: false,
        message: `No successful payment found on Cashfree for order '${orderId}' (status: ${paymentStatus.status || 'unknown'})`,
        details: paymentStatus,
      });
    }

    const { depositEngine } = await import('../../../lib/depositEngine.mjs');
    const result = await depositEngine.processVerifiedPayment({
      provider: 'CASHFREE',
      depositId: deposit.deposit_id || deposit.id,
      providerOrderId: orderId,
      providerPaymentId: paymentStatus.paymentId,
      amountInINR: paymentStatus.amountInINR || parseFloat(deposit.amount),
      userId: deposit.user_id,
      method: paymentStatus.method || 'upi',
      utr: paymentStatus.utr || paymentStatus.paymentId,
      rawPayload: { source: 'admin_reconcile', payment: paymentStatus.raw },
      source: 'ADMIN_RECONCILE',
      correlationId: req.correlationId || null,
    });

    res.json({ success: true, message: 'Cashfree deposit successfully reconciled and credited', result });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Cashfree reconciliation failed', message: err.message });
  }
});

export default router;

