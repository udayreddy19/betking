import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requireAdmin, requireAdminRole, writeAudit } from '../middleware/auth.js';
import crypto from 'crypto';
import {
  adminRejectWithdrawal,
  adminMarkPaid,
  notifyWithdrawalEmail,
  withdrawalPayoutPaise,
} from './withdrawals.js';
import { requireStepUpTotp } from '../middleware/stepUpTotp.js';
import { decryptAccountNumber } from './bankAccounts.js';
import { executeBankPayout } from '../services/payouts.js';
import {
  mailSupportAdminReply,
  mailSupportClosed,
} from '../services/mail.js';
import { creditWallet, debitWallet } from '../services/ledger.js';
import {
  listGateways,
  updateGateway,
  testGatewayConnection,
} from '../services/paymentGateways.js';
import { getMoneyHealthSnapshot } from '../services/ledgerInvariants.js';
import {
  getAdminCatalog,
  upsertCategoryType,
  upsertSubcategory,
  deleteCategoryType,
  deleteSubcategory,
  invalidateCategoryCache,
} from '../services/depositCategories.js';
import {
  assertPublicTable,
  assertTableDeletable,
  getTableColumns,
  getPrimaryKeyColumns,
  getTableRowEstimate,
  coerceCellValue,
  HIDDEN_COLUMNS,
  READONLY_COLUMNS,
  DELETE_BLOCKED_TABLES,
  isSafeIdent,
} from '../services/adminDbBrowser.js';
import { hashPassword } from '../services/adminBootstrap.js';
import {
  getBranding,
  setSetting,
  SHOW_VEXQORA_KEY,
  getPlatformControls,
  setPlatformControls,
  getAnnouncement,
  setAnnouncement,
  getDefaultLimits,
  setDefaultLimits,
  getRazorpayxAccountNumber,
  setRazorpayxAccountNumber,
} from '../services/siteSettings.js';
import {
  getUserLimits,
  getUserRiskOverride,
  setUserRiskOverride,
} from '../services/velocity.js';
import adminOps from './adminOps.js';
import { createAdminPlatformRouter } from './platform.js';
import { createAdminMerchantRouter } from './merchant.js';
import adminProducts from './adminProducts.js';

const router = Router();

const moneyAdmin = requireAdminRole('super_admin', 'finance', 'ops');
const financeAdmin = requireAdminRole('super_admin', 'finance');
const dbBrowserAdmin = requireAdminRole('super_admin');

function assertDbBrowserEnabled(req, res) {
  if (process.env.ADMIN_DB_BROWSER === '1' || process.env.ADMIN_DB_BROWSER === 'true') return true;
  res.status(403).json({ error: 'Database browser disabled. Set ADMIN_DB_BROWSER=1 to enable.' });
  return false;
}

router.use(requireAdmin);
/** Enhanced finance ops (search, CSV, UPI approve, deposit tools, KYC, 2FA) — registered first */
router.use(adminOps);
router.use(createAdminPlatformRouter());
router.use('/merchant', createAdminMerchantRouter({ requireAdmin, requireAdminRole, writeAudit }));
router.use(adminProducts);

function mapUser(r) {
  return {
    id: r.id,
    email: r.email,
    fullName: r.full_name,
    phone: r.phone,
    role: r.role,
    status: r.status,
    moneyFrozen: Boolean(r.money_frozen),
    balancePaise: Number(r.balance_paise || 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/* ── Overview ─────────────────────────────────────────────── */

router.get('/overview', async (_req, res) => {
  try {
    const {
      getPlatformControls,
      getOpsWorkers,
      getBranding,
      isMaintenanceActive,
    } = await import('../services/siteSettings.js');
    const [users, wallets, pending, holdWd, deposits, openTickets, recentUsers, failedDep, controls, workers, branding, moneyHealth] = await Promise.all([
      query(`SELECT COUNT(*)::int AS n,
                    COUNT(*) FILTER (WHERE status = 'active')::int AS active,
                    COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended,
                    COUNT(*) FILTER (WHERE role = 'admin')::int AS admins,
                    COUNT(*) FILTER (WHERE money_frozen = TRUE)::int AS money_frozen
             FROM users`),
      query(`SELECT COALESCE(SUM(balance_paise), 0)::bigint AS total FROM wallets`),
      query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(amount_paise), 0)::bigint AS total
             FROM withdrawals WHERE status = 'pending'`),
      query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(amount_paise), 0)::bigint AS total
             FROM withdrawals WHERE status = 'hold'`),
      query(`SELECT
               COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_n,
               COALESCE(SUM(amount_paise) FILTER (WHERE status = 'paid'), 0)::bigint AS paid_total,
               COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_n,
               COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS today_n
             FROM deposits`),
      query(`SELECT COUNT(*)::int AS n FROM support_tickets WHERE status IN ('open', 'in_progress')`),
      query(`SELECT COUNT(*)::int AS n FROM users WHERE created_at > NOW() - INTERVAL '7 days'`),
      query(`SELECT COUNT(*)::int AS n FROM deposits WHERE status = 'failed'`),
      getPlatformControls(),
      getOpsWorkers(),
      getBranding(),
      getMoneyHealthSnapshot().catch(() => null),
    ]);
    const u = users.rows[0];
    const d = deposits.rows[0];
    res.json({
      userCount: u.n,
      activeUsers: u.active,
      suspendedUsers: u.suspended,
      moneyFrozenUsers: u.money_frozen,
      adminCount: u.admins,
      newUsers7d: recentUsers.rows[0].n,
      totalBalancePaise: Number(wallets.rows[0].total),
      pendingWithdrawals: {
        count: pending.rows[0].n,
        amountPaise: Number(pending.rows[0].total),
      },
      holdWithdrawals: {
        count: holdWd.rows[0].n,
        amountPaise: Number(holdWd.rows[0].total),
      },
      paidDeposits: {
        count: d.paid_n,
        amountPaise: Number(d.paid_total),
      },
      pendingDeposits: d.pending_n,
      depositsToday: d.today_n,
      failedDeposits: failedDep.rows[0].n,
      openTickets: openTickets.rows[0].n,
      cockpit: {
        maintenanceActive: isMaintenanceActive(controls),
        maintenanceMode: controls.maintenanceMode,
        maintenanceStartsAt: controls.maintenanceStartsAt,
        maintenanceEndsAt: controls.maintenanceEndsAt,
        depositsEnabled: controls.depositsEnabled,
        withdrawalsEnabled: controls.withdrawalsEnabled,
        billPayEnabled: controls.billPayEnabled,
        pgReviewMode: branding.pgReviewMode,
        showVexqoraLegalName: branding.showVexqoraLegalName,
        workers,
        moneyHealthOk: moneyHealth?.ok ?? null,
        ledgerDriftUsers: moneyHealth?.drift?.driftCount ?? null,
      },
    });
  } catch (err) {
    console.error('[admin/overview]', err);
    res.status(500).json({ error: 'Failed' });
  }
});

/* ── Users ────────────────────────────────────────────────── */

router.get('/users', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const status = String(req.query.status || '').trim();
    const { rows } = await query(
      `SELECT u.id, u.email, u.full_name, u.phone, u.role, u.status, u.money_frozen,
              u.created_at, u.updated_at, w.balance_paise
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       WHERE ($1 = '' OR u.email ILIKE '%' || $1 || '%' OR u.full_name ILIKE '%' || $1 || '%' OR u.phone ILIKE '%' || $1 || '%')
         AND ($2 = '' OR u.status = $2)
       ORDER BY u.created_at DESC
       LIMIT 100`,
      [q, status],
    );
    res.json({ users: rows.map(mapUser) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/users/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.email, u.full_name, u.phone, u.role, u.status, u.money_frozen,
              u.created_at, u.updated_at, w.balance_paise
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       WHERE u.id = $1`,
      [req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });

    const [banks, ledger, deps, wds, tickets, limits] = await Promise.all([
      query(
        `SELECT id, account_holder, bank_name, account_number_last4, ifsc, is_primary, status,
                verification_status, verification_note, verified_at, created_at
         FROM bank_accounts WHERE user_id = $1 ORDER BY is_primary DESC, created_at DESC`,
        [req.params.id],
      ),
      query(
        `SELECT id, entry_type, amount_paise, balance_after_paise, reference_type, metadata, created_at
         FROM ledger_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
        [req.params.id],
      ),
      query(
        `SELECT id, amount_paise, status, provider_order_id, provider_payment_id, metadata, created_at
         FROM deposits WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [req.params.id],
      ),
      query(
        `SELECT id, amount_paise, status, admin_note, created_at, processed_at
         FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [req.params.id],
      ),
      query(
        `SELECT id, subject, status, created_at, updated_at
         FROM support_tickets WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 10`,
        [req.params.id],
      ),
      getUserLimits(req.params.id),
    ]);

    res.json({
      user: mapUser(rows[0]),
      limits,
      bankAccounts: banks.rows.map((b) => ({
        id: b.id,
        accountHolder: b.account_holder,
        bankName: b.bank_name,
        accountLast4: b.account_number_last4,
        ifsc: b.ifsc,
        isPrimary: b.is_primary,
        status: b.status,
        verificationStatus: b.verification_status,
        verificationNote: b.verification_note,
        verifiedAt: b.verified_at,
        createdAt: b.created_at,
      })),
      ledger: ledger.rows.map((e) => ({
        id: e.id,
        entryType: e.entry_type,
        amountPaise: Number(e.amount_paise),
        balanceAfterPaise: Number(e.balance_after_paise),
        referenceType: e.reference_type,
        metadata: e.metadata,
        createdAt: e.created_at,
      })),
      deposits: deps.rows.map((d) => ({
        id: d.id,
        amountPaise: Number(d.amount_paise),
        status: d.status,
        providerOrderId: d.provider_order_id,
        providerPaymentId: d.provider_payment_id,
        metadata: d.metadata,
        createdAt: d.created_at,
      })),
      withdrawals: wds.rows.map((w) => ({
        id: w.id,
        amountPaise: Number(w.amount_paise),
        status: w.status,
        adminNote: w.admin_note,
        createdAt: w.created_at,
        processedAt: w.processed_at,
      })),
      tickets: tickets.rows.map((t) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      })),
    });
  } catch (err) {
    console.error('[admin/users/:id]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/users/:id/status', async (req, res) => {
  try {
    const status = req.body?.status === 'suspended' ? 'suspended' : 'active';
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot change your own status' });
    }
    const { rows } = await query(
      `UPDATE users SET status = $1, updated_at = NOW()
       WHERE id = $2 AND role = 'user'
       RETURNING id, email, status`,
      [status, req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found (or is admin)' });
    await writeAudit(req.user.id, `admin.user.${status}`, 'user', req.params.id, {}, req.ip);
    res.json({ ok: true, user: { id: rows[0].id, email: rows[0].email, status: rows[0].status } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Wallet adjust ────────────────────────────────────────── */

router.post('/adjust', financeAdmin, requireStepUpTotp, async (req, res) => {
  try {
    const userId = req.body?.userId;
    const amountPaise = Math.round(Number(req.body?.amountInr ?? req.body?.amount) * 100);
    const reason = String(req.body?.reason || '').trim();
    if (!userId || !Number.isInteger(amountPaise) || amountPaise === 0 || !reason) {
      return res.status(400).json({ error: 'userId, non-zero amount, and reason required' });
    }

    let idempotencyKey = String(req.body?.idempotencyKey || '').trim();
    if (!idempotencyKey) {
      idempotencyKey = crypto
        .createHash('sha256')
        .update(`${req.user.id}|${userId}|${amountPaise}|${reason}`)
        .digest('hex')
        .slice(0, 48);
    }
    idempotencyKey = `admin_adjust:${idempotencyKey}`;

    const result = await withTransaction(async (client) => {
      if (amountPaise > 0) {
        return creditWallet(client, {
          userId,
          amountPaise,
          entryType: 'admin_adjust',
          referenceType: 'admin',
          idempotencyKey,
          metadata: { reason, adminId: req.user.id },
        });
      }
      return debitWallet(client, {
        userId,
        amountPaise: Math.abs(amountPaise),
        entryType: 'admin_adjust',
        referenceType: 'admin',
        idempotencyKey,
        metadata: { reason, adminId: req.user.id },
      });
    });

    await writeAudit(req.user.id, 'admin.adjust', 'user', userId, {
      amountPaise,
      reason,
      idempotencyKey,
      duplicate: result.duplicate,
    }, req.ip);
    res.json({ ok: true, balanceAfterPaise: result.balanceAfter, duplicate: Boolean(result.duplicate) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/* ── Withdrawals (actions; list is in adminOps) ───────────── */

router.post('/withdrawals/:id/approve', moneyAdmin, requireStepUpTotp, async (req, res) => {
  try {
    const { getWithdrawalPolicy } = await import('../services/siteSettings.js');
    const policy = await getWithdrawalPolicy();
    const { rows: cur } = await query(
      `SELECT id, status, amount_paise, first_approver_id, processed_by
       FROM withdrawals WHERE id = $1`,
      [req.params.id],
    );
    const w = cur[0];
    if (!w) return res.status(404).json({ error: 'Not found' });

    // Second approval for held withdrawals (dual control)
    if (w.status === 'hold') {
      if (w.first_approver_id && w.first_approver_id === req.user.id) {
        return res.status(400).json({
          error: 'Dual control: a different admin must complete the second approval',
          code: 'DUAL_CONTROL_SAME_ADMIN',
        });
      }
      const { rowCount } = await query(
        `UPDATE withdrawals
         SET status = 'approved',
             second_approver_id = $1,
             processed_by = $1,
             updated_at = NOW()
         WHERE id = $2 AND status = 'hold'`,
        [req.user.id, req.params.id],
      );
      if (!rowCount) return res.status(400).json({ error: 'Not on hold' });
      await writeAudit(req.user.id, 'admin.withdrawal.second_approve', 'withdrawal', req.params.id, {}, req.ip);
      notifyWithdrawalEmail(req.params.id, 'approved').catch(() => {});
      return res.json({ ok: true, status: 'approved', dualControl: true });
    }

    if (w.status !== 'pending') return res.status(400).json({ error: 'Not pending' });

    const needsDual = policy.dualControlPaise > 0
      && Number(w.amount_paise) >= policy.dualControlPaise;
    if (needsDual) {
      const { rowCount } = await query(
        `UPDATE withdrawals
         SET status = 'hold',
             first_approver_id = $1,
             processed_by = $1,
             updated_at = NOW()
         WHERE id = $2 AND status = 'pending'`,
        [req.user.id, req.params.id],
      );
      if (!rowCount) return res.status(400).json({ error: 'Not pending' });
      await writeAudit(req.user.id, 'admin.withdrawal.hold', 'withdrawal', req.params.id, {
        dualControlPaise: policy.dualControlPaise,
      }, req.ip);
      return res.json({
        ok: true,
        status: 'hold',
        dualControl: true,
        message: 'Held for second admin approval (dual control)',
      });
    }

    const { rowCount } = await query(
      `UPDATE withdrawals SET status = 'approved', processed_by = $1, first_approver_id = $1, updated_at = NOW()
       WHERE id = $2 AND status = 'pending'`,
      [req.user.id, req.params.id],
    );
    if (!rowCount) return res.status(400).json({ error: 'Not pending' });
    await writeAudit(req.user.id, 'admin.withdrawal.approve', 'withdrawal', req.params.id, {}, req.ip);
    notifyWithdrawalEmail(req.params.id, 'approved').catch(() => {});
    res.json({ ok: true, status: 'approved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/withdrawals/:id/paid', moneyAdmin, requireStepUpTotp, async (req, res) => {
  try {
    await withTransaction(async (client) => {
      await adminMarkPaid(client, req.params.id, req.user.id, req.body?.note);
    });
    await writeAudit(req.user.id, 'admin.withdrawal.paid', 'withdrawal', req.params.id, {}, req.ip);
    notifyWithdrawalEmail(req.params.id, 'paid', { note: req.body?.note }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/** Pay withdrawal via RazorpayX / Pine Labs Payouts using stored bank details + API keys */
router.post('/withdrawals/:id/pay-gateway', moneyAdmin, requireStepUpTotp, async (req, res) => {
  let claimedId = null;
  try {
    const preferredProvider = req.body?.provider;

    const claim = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT w.*, b.id AS bank_account_row_id, b.account_holder, b.ifsc, b.account_number_enc,
                b.razorpay_contact_id, b.razorpay_fund_account_id
         FROM withdrawals w
         JOIN bank_accounts b ON b.id = w.bank_account_id
         WHERE w.id = $1
         FOR UPDATE OF w`,
        [req.params.id],
      );
      const w = rows[0];
      if (!w) {
        throw Object.assign(new Error('Not found'), { status: 404 });
      }
      if (!['pending', 'approved', 'processing'].includes(w.status)) {
        throw Object.assign(new Error(`Cannot pay out from status ${w.status}`), { status: 400 });
      }
      if (w.payout_id) {
        throw Object.assign(new Error('Gateway payout already initiated'), {
          status: 400,
          payoutId: w.payout_id,
        });
      }
      await client.query(
        `UPDATE withdrawals SET status = 'processing', updated_at = NOW() WHERE id = $1`,
        [w.id],
      );
      return w;
    });
    claimedId = claim.id;

    const accountNumber = decryptAccountNumber(claim.account_number_enc);
    const bankAmountPaise = withdrawalPayoutPaise(claim);
    const payout = await executeBankPayout({
      amountPaise: bankAmountPaise,
      accountNumber,
      ifsc: claim.ifsc,
      accountHolder: claim.account_holder,
      referenceId: claim.id,
      preferredProvider,
      narration: 'OddsYra withdraw',
      bankAccountId: claim.bank_account_row_id || claim.bank_account_id,
      razorpayContactId: claim.razorpay_contact_id,
      razorpayFundAccountId: claim.razorpay_fund_account_id,
    });

    const terminal = ['processed', 'completed', 'success', 'successful', 'paid'].includes(
      String(payout.status || '').toLowerCase(),
    );

    if (terminal) {
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE withdrawals
           SET payout_provider = $1, payout_id = $2, payout_utr = $3, payout_raw = $4::jsonb,
               admin_note = COALESCE($5, admin_note)
           WHERE id = $6 AND payout_id IS NULL`,
          [
            payout.provider,
            payout.payoutId,
            payout.utr,
            JSON.stringify(payout.raw || {}),
            req.body?.note || `Paid via ${payout.provider}`,
            claim.id,
          ],
        );
        await adminMarkPaid(
          client,
          claim.id,
          req.user.id,
          req.body?.note || `Paid via ${payout.provider}`,
          { allowGateway: true },
        );
      });
    } else {
      await query(
        `UPDATE withdrawals
         SET status = 'processing',
             payout_provider = $1, payout_id = $2, payout_utr = $3, payout_raw = $4::jsonb,
             admin_note = COALESCE($5, admin_note),
             processed_by = $6, updated_at = NOW()
         WHERE id = $7 AND payout_id IS NULL`,
        [
          payout.provider,
          payout.payoutId,
          payout.utr,
          JSON.stringify(payout.raw || {}),
          req.body?.note || `Payout submitted via ${payout.provider} (${payout.status})`,
          req.user.id,
          claim.id,
        ],
      );
    }

    await writeAudit(
      req.user.id,
      'admin.withdrawal.pay_gateway',
      'withdrawal',
      claim.id,
      { provider: payout.provider, payoutId: payout.payoutId, status: payout.status, utr: payout.utr },
      req.ip,
    );

    notifyWithdrawalEmail(
      claim.id,
      terminal ? 'paid' : 'processing',
      { utr: payout.utr, note: `Via ${payout.provider}` },
    ).catch(() => {});

    res.json({
      ok: true,
      provider: payout.provider,
      payoutId: payout.payoutId,
      status: payout.status,
      utr: payout.utr,
      markedPaid: terminal,
    });
  } catch (err) {
    console.error('[admin/withdrawals/pay-gateway]', err);
    if (claimedId) {
      try {
        await query(
          `UPDATE withdrawals SET status = 'approved', updated_at = NOW()
           WHERE id = $1 AND status = 'processing' AND payout_id IS NULL`,
          [claimedId],
        );
      } catch {
        /* ignore */
      }
    }
    if (err.payoutId) {
      return res.status(err.status || 400).json({ error: err.message, payoutId: err.payoutId });
    }
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

router.post('/withdrawals/:id/reject', moneyAdmin, requireStepUpTotp, async (req, res) => {
  try {
    await withTransaction(async (client) => {
      await adminRejectWithdrawal(client, req.params.id, req.user.id, req.body?.note);
    });
    await writeAudit(req.user.id, 'admin.withdrawal.reject', 'withdrawal', req.params.id, { note: req.body?.note }, req.ip);
    notifyWithdrawalEmail(req.params.id, 'rejected', { note: req.body?.note }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/* ── Support ──────────────────────────────────────────────── */

router.get('/support/tickets', async (req, res) => {
  try {
    const status = String(req.query.status || 'open');
    const category = String(req.query.category || 'all');
    const { rows } = await query(
      `SELECT t.id, t.user_id, t.subject, t.status, t.category, t.assignee_id,
              t.related_type, t.related_id, t.created_at, t.updated_at,
              u.email, u.full_name,
              a.email AS assignee_email,
              (SELECT body FROM support_messages m WHERE m.ticket_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message
       FROM support_tickets t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN users a ON a.id = t.assignee_id
       WHERE ($1::text = 'all' OR t.status = $1 OR ($1 = 'open' AND t.status IN ('open', 'in_progress')))
         AND ($2::text = 'all' OR t.category = $2)
       ORDER BY t.updated_at DESC
       LIMIT 100`,
      [status, category],
    );
    res.json({
      tickets: rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        email: r.email,
        fullName: r.full_name,
        subject: r.subject,
        status: r.status,
        category: r.category || 'general',
        assigneeId: r.assignee_id,
        assigneeEmail: r.assignee_email,
        relatedType: r.related_type,
        relatedId: r.related_id,
        lastMessage: r.last_message,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/support/tickets/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT t.id, t.user_id, t.subject, t.status, t.category, t.assignee_id,
              t.related_type, t.related_id, t.created_at, t.updated_at,
              u.email, u.full_name,
              a.email AS assignee_email
       FROM support_tickets t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN users a ON a.id = t.assignee_id
       WHERE t.id = $1`,
      [req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const msgs = await query(
      `SELECT id, body, is_staff, author_user_id, created_at
       FROM support_messages WHERE ticket_id = $1 ORDER BY created_at ASC`,
      [req.params.id],
    );
    const t = rows[0];
    res.json({
      ticket: {
        id: t.id,
        userId: t.user_id,
        email: t.email,
        fullName: t.full_name,
        subject: t.subject,
        status: t.status,
        category: t.category || 'general',
        assigneeId: t.assignee_id,
        assigneeEmail: t.assignee_email,
        relatedType: t.related_type,
        relatedId: t.related_id,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      },
      messages: msgs.rows.map((m) => ({
        id: m.id,
        body: m.body,
        isStaff: m.is_staff,
        authorUserId: m.author_user_id,
        createdAt: m.created_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/support/tickets/:id/assign', async (req, res) => {
  try {
    const assigneeId = req.body?.assigneeId === null || req.body?.assigneeId === ''
      ? null
      : (req.body?.assigneeId || req.user.id);
    const { rowCount } = await query(
      `UPDATE support_tickets
       SET assignee_id = $2, updated_at = NOW()
       WHERE id = $1`,
      [req.params.id, assigneeId],
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    await writeAudit(req.user.id, 'admin.support.assign', 'support_ticket', req.params.id, { assigneeId }, req.ip);
    res.json({ ok: true, assigneeId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/support/tickets/:id/reply', async (req, res) => {
  try {
    const body = String(req.body?.message || req.body?.body || '').trim().slice(0, 4000);
    if (!body) return res.status(400).json({ error: 'Message required' });
    const { rows } = await query(`SELECT id, user_id FROM support_tickets WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO support_messages (ticket_id, author_user_id, body, is_staff) VALUES ($1, $2, $3, TRUE)`,
        [req.params.id, req.user.id, body],
      );
      await client.query(
        `UPDATE support_tickets SET status = 'in_progress', updated_at = NOW() WHERE id = $1 AND status = 'open'`,
        [req.params.id],
      );
      await client.query(
        `UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`,
        [req.params.id],
      );
      await client.query(
        `INSERT INTO notifications (user_id, title, body, kind)
         VALUES ($1, 'Support reply', $2, 'support')`,
        [rows[0].user_id, body.slice(0, 200)],
      );
    });

    const userRes = await query(`SELECT email, full_name FROM users WHERE id = $1`, [rows[0].user_id]);
    const u = userRes.rows[0];
    if (u?.email) {
      mailSupportAdminReply({
        email: u.email,
        name: u.full_name,
        ticketId: req.params.id,
        agentReply: body,
        replyUrl: `${process.env.FRONTEND_URL || process.env.APP_URL || 'https://oddsyra.com'}/support`,
      }).catch(() => {});
    }

    await writeAudit(req.user.id, 'admin.support.reply', 'support_ticket', req.params.id, {}, req.ip);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/support/tickets/:id/status', async (req, res) => {
  try {
    const status = ['open', 'in_progress', 'closed'].includes(req.body?.status)
      ? req.body.status
      : null;
    if (!status) return res.status(400).json({ error: 'Invalid status' });
    const { rows } = await query(
      `UPDATE support_tickets SET status = $1, updated_at = NOW() WHERE id = $2
       RETURNING user_id`,
      [status, req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    await writeAudit(req.user.id, 'admin.support.status', 'support_ticket', req.params.id, { status }, req.ip);
    if (status === 'closed') {
      const userRes = await query(`SELECT email, full_name FROM users WHERE id = $1`, [rows[0].user_id]);
      const u = userRes.rows[0];
      if (u?.email) {
        mailSupportClosed({
          email: u.email,
          name: u.full_name,
          ticketId: req.params.id,
        }).catch(() => {});
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Notifications ────────────────────────────────────────── */

router.post('/notify', async (req, res) => {
  try {
    const userId = req.body?.userId;
    const title = String(req.body?.title || '').trim().slice(0, 120);
    const body = String(req.body?.body || '').trim().slice(0, 2000);
    const kind = String(req.body?.kind || 'info').slice(0, 40);
    if (!userId || !title) return res.status(400).json({ error: 'userId and title required' });

    const { rows } = await query(`SELECT id FROM users WHERE id = $1`, [userId]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });

    await query(
      `INSERT INTO notifications (user_id, title, body, kind) VALUES ($1, $2, $3, $4)`,
      [userId, title, body, kind],
    );
    const u = await query(`SELECT email, full_name FROM users WHERE id = $1`, [userId]);
    if (u.rows[0]?.email) {
      const { sendAdminComposeEmail } = await import('../auth/emailService.js');
      sendAdminComposeEmail({
        mailboxId: 'no-reply',
        to: u.rows[0].email,
        subject: title,
        heading: title,
        body: body || title,
        greetingName: u.rows[0].full_name || undefined,
        ctaLabel: 'Open OddsYra',
        ctaHref: `${process.env.FRONTEND_URL || process.env.APP_URL || 'https://oddsyra.com'}/dashboard`,
      }).catch(() => {});
    }
    await writeAudit(req.user.id, 'admin.notify', 'user', userId, { title }, req.ip);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notify/broadcast', async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim().slice(0, 120);
    const body = String(req.body?.body || '').trim().slice(0, 2000);
    const kind = String(req.body?.kind || 'info').slice(0, 40);
    if (!title) return res.status(400).json({ error: 'title required' });

    const { rowCount } = await query(
      `INSERT INTO notifications (user_id, title, body, kind)
       SELECT id, $1, $2, $3 FROM users WHERE role = 'user' AND status = 'active'`,
      [title, body, kind],
    );
    const users = await query(
      `SELECT email, full_name FROM users WHERE role = 'user' AND status = 'active' AND email IS NOT NULL LIMIT 500`,
    );
    const { sendAdminComposeEmail } = await import('../auth/emailService.js');
    const appUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://oddsyra.com';
    for (const u of users.rows) {
      if (!u.email) continue;
      sendAdminComposeEmail({
        mailboxId: 'no-reply',
        to: u.email,
        subject: title,
        heading: title,
        body: body || title,
        greetingName: u.full_name || undefined,
        ctaLabel: 'Open OddsYra',
        ctaHref: `${appUrl}/dashboard`,
      }).catch(() => {});
    }
    await writeAudit(req.user.id, 'admin.notify.broadcast', 'system', null, { title, count: rowCount }, req.ip);
    res.json({ ok: true, sent: rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Database tables browser (super_admin + ADMIN_DB_BROWSER=1) ── */

router.get('/db/tables', dbBrowserAdmin, async (req, res) => {
  if (!assertDbBrowserEnabled(req, res)) return;
  try {
    const sizeRes = await query('SELECT pg_size_pretty(pg_database_size(current_database())) AS total_db_size');
    const tablesRes = await query(`
      SELECT c.relname AS table_name,
             COALESCE(s.n_live_tup, 0)::bigint AS row_count,
             pg_size_pretty(pg_total_relation_size(c.oid)) AS table_size
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname ASC
    `);
    res.json({
      totalDbSize: sizeRes.rows[0]?.total_db_size || 'unknown',
      tables: tablesRes.rows.map((row) => ({
        tableName: row.table_name,
        rowCount: Number(row.row_count) || 0,
        tableSize: row.table_size || '—',
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/db/tables/:tableName', dbBrowserAdmin, async (req, res) => {
  if (!assertDbBrowserEnabled(req, res)) return;
  const tableName = String(req.params.tableName || '');
  try {
    await assertPublicTable(query, tableName);
    const allCols = await getTableColumns(query, tableName);
    const safeCols = allCols.filter((col) => !HIDDEN_COLUMNS.has(col.column_name));
    const colList = safeCols.map((col) => `"${col.column_name}"`).join(', ') || '*';
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const [primaryKey, estimatedCount, rowsRes] = await Promise.all([
      getPrimaryKeyColumns(query, tableName),
      getTableRowEstimate(query, tableName),
      query(`SELECT ${colList} FROM "${tableName}" LIMIT $1 OFFSET $2`, [limit, offset]),
    ]);
    const canMutate = primaryKey.length > 0;
    res.json({
      tableName,
      columns: safeCols,
      primaryKey,
      editable: canMutate,
      deletable: canMutate && !DELETE_BLOCKED_TABLES.has(tableName),
      rows: rowsRes.rows,
      totalCount: Math.max(estimatedCount, rowsRes.rows.length + offset),
      limit,
      offset,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

router.patch('/db/tables/:tableName', dbBrowserAdmin, async (req, res) => {
  if (!assertDbBrowserEnabled(req, res)) return;
  const tableName = String(req.params.tableName || '');
  const primaryKey = req.body?.primaryKey && typeof req.body.primaryKey === 'object' ? req.body.primaryKey : null;
  const updates = req.body?.updates && typeof req.body.updates === 'object' ? req.body.updates : null;
  if (!primaryKey || !updates || !Object.keys(updates).length) {
    return res.status(400).json({ error: 'primaryKey and updates are required' });
  }

  try {
    await assertPublicTable(query, tableName);
    const pkCols = await getPrimaryKeyColumns(query, tableName);
    if (!pkCols.length) {
      return res.status(400).json({ error: 'This table has no primary key and cannot be edited safely.' });
    }
    for (const col of pkCols) {
      if (!(col in primaryKey)) {
        return res.status(400).json({ error: `Missing primary key field: ${col}` });
      }
    }

    const columns = await getTableColumns(query, tableName);
    const colMap = Object.fromEntries(columns.map((c) => [c.column_name, c]));
    const setCols = [];
    const values = [];
    let passwordHashToSet = null;

    if (tableName === 'users' && (updates.new_password || updates.password)) {
      const rawPwd = String(updates.new_password || updates.password).trim();
      if (rawPwd.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      passwordHashToSet = hashPassword(rawPwd);
    }

    for (const [key, raw] of Object.entries(updates)) {
      if (key === 'new_password' || key === 'password') continue;
      if (!isSafeIdent(key) || !colMap[key]) {
        return res.status(400).json({ error: `Unknown column: ${key}` });
      }
      if (HIDDEN_COLUMNS.has(key) || READONLY_COLUMNS.has(key) || pkCols.includes(key)) {
        return res.status(400).json({ error: `Column is not editable: ${key}` });
      }
      values.push(coerceCellValue(raw, colMap[key].data_type));
      setCols.push(`"${key}" = $${values.length}`);
    }

    if (passwordHashToSet) {
      values.push(passwordHashToSet);
      setCols.push(`"password_hash" = $${values.length}`);
    }

    if (!setCols.length) {
      return res.status(400).json({ error: 'No editable fields provided' });
    }

    if (colMap.updated_at && !setCols.some((s) => s.includes('"updated_at"'))) {
      setCols.push('"updated_at" = NOW()');
    }

    const whereParts = [];
    for (const col of pkCols) {
      values.push(primaryKey[col]);
      whereParts.push(`"${col}" = $${values.length}`);
    }

    const returningCols = columns
      .filter((c) => !HIDDEN_COLUMNS.has(c.column_name))
      .map((c) => `"${c.column_name}"`)
      .join(', ');

    const result = await query(
      `UPDATE "${tableName}" SET ${setCols.join(', ')}
       WHERE ${whereParts.join(' AND ')}
       RETURNING ${returningCols || '*'}`,
      values,
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Row not found' });

    if (tableName === 'deposit_category_types' || tableName === 'deposit_subcategories') {
      invalidateCategoryCache();
    }

    await writeAudit(
      req.user.id,
      'admin.db.row_update',
      'db_table',
      null,
      { tableName, primaryKey, updatedColumns: Object.keys(updates) },
      req.ip,
    );

    res.json({ ok: true, tableName, row: result.rows[0] });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

router.delete('/db/tables/:tableName', dbBrowserAdmin, async (req, res) => {
  if (!assertDbBrowserEnabled(req, res)) return;
  const tableName = String(req.params.tableName || '');
  const primaryKey = req.body?.primaryKey && typeof req.body.primaryKey === 'object' ? req.body.primaryKey : null;
  if (!primaryKey) return res.status(400).json({ error: 'primaryKey required' });

  try {
    await assertPublicTable(query, tableName);
    assertTableDeletable(tableName);
    const pkCols = await getPrimaryKeyColumns(query, tableName);
    if (!pkCols.length) {
      return res.status(400).json({ error: 'No primary key — cannot delete safely' });
    }
    const values = [];
    const whereParts = [];
    for (const col of pkCols) {
      if (!(col in primaryKey)) {
        return res.status(400).json({ error: `Missing primary key field: ${col}` });
      }
      values.push(primaryKey[col]);
      whereParts.push(`"${col}" = $${values.length}`);
    }
    const result = await query(
      `DELETE FROM "${tableName}" WHERE ${whereParts.join(' AND ')} RETURNING 1`,
      values,
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Row not found' });

    if (tableName === 'deposit_category_types' || tableName === 'deposit_subcategories') {
      invalidateCategoryCache();
    }

    await writeAudit(
      req.user.id,
      'admin.db.row_delete',
      'db_table',
      null,
      { tableName, primaryKey },
      req.ip,
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

/* ── Deposit categories (names, fees, limits) ─────────────── */

router.get('/deposit-categories', async (_req, res) => {
  try {
    const catalog = await getAdminCatalog();
    res.json(catalog);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/deposit-categories/types', async (req, res) => {
  try {
    const id = await upsertCategoryType(req.body || {});
    await writeAudit(req.user.id, 'admin.category_type.upsert', 'deposit_category_type', null, { id }, req.ip);
    res.json({ ok: true, id, catalog: await getAdminCatalog() });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/deposit-categories/types/:id', async (req, res) => {
  try {
    const ok = await deleteCategoryType(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    await writeAudit(req.user.id, 'admin.category_type.delete', 'deposit_category_type', null, { id: req.params.id }, req.ip);
    res.json({ ok: true, catalog: await getAdminCatalog() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/deposit-categories/subs', async (req, res) => {
  try {
    const id = await upsertSubcategory(req.body || {});
    await writeAudit(req.user.id, 'admin.subcategory.upsert', 'deposit_subcategory', null, { id }, req.ip);
    res.json({ ok: true, id, catalog: await getAdminCatalog() });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/deposit-categories/subs/:id', async (req, res) => {
  try {
    const ok = await deleteSubcategory(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    await writeAudit(req.user.id, 'admin.subcategory.delete', 'deposit_subcategory', null, { id: req.params.id }, req.ip);
    res.json({ ok: true, catalog: await getAdminCatalog() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Money health (ledger invariants + payout secrets) ───── */

router.get('/money-health', moneyAdmin, async (_req, res) => {
  try {
    const snap = await getMoneyHealthSnapshot();
    res.status(snap.ok ? 200 : 503).json(snap);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Payment gateways (Razorpay / PayU / Pine Labs) ───────── */

router.get('/payment-gateways', async (_req, res) => {
  try {
    const gateways = (await listGateways()).filter((g) => g.provider !== 'CASHFREE');
    const enabledCount = gateways.filter((g) => g.enabled).length;
    const primary = gateways.find((g) => g.isPrimary && g.enabled);
    const allowUserSelection = gateways.some((g) => g.allowUserSelection);
    let operationalMode = 'FAILSAFE (ALL DISABLED)';
    if (enabledCount >= 2) {
      operationalMode = allowUserSelection
        ? 'MULTI GATEWAY (USER SELECTION)'
        : `PRIMARY ROUTING (${primary?.provider || '—'})`;
    } else if (enabledCount === 1) {
      operationalMode = `${gateways.find((g) => g.enabled)?.provider || '—'} ONLY`;
    }
    res.json({
      gateways,
      operationalMode,
      allowUserSelection,
      primaryProvider: primary?.provider || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/payment-gateways/:provider', requireStepUpTotp, async (req, res) => {
  try {
    const gateway = await updateGateway(req.params.provider, {
      enabled: req.body?.enabled,
      isPrimary: req.body?.isPrimary,
      allowUserSelection: req.body?.allowUserSelection,
      environment: req.body?.environment,
      depositsEnabled: req.body?.depositsEnabled,
      payoutsEnabled: req.body?.payoutsEnabled,
    });
    const gateways = await listGateways();
    await writeAudit(
      req.user.id,
      'admin.payment_gateway.update',
      'payment_gateway',
      null,
      {
        provider: gateway.provider,
        enabled: gateway.enabled,
        isPrimary: gateway.isPrimary,
        allowUserSelection: gateway.allowUserSelection,
        depositsEnabled: gateway.depositsEnabled,
        payoutsEnabled: gateway.payoutsEnabled,
      },
      req.ip,
    );
    res.json({
      ok: true,
      message: `Payment gateway '${gateway.provider}' updated`,
      gateway,
      gateways,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/razorpayx-account', financeAdmin, async (_req, res) => {
  try {
    const accountNumber = await getRazorpayxAccountNumber();
    res.json({
      accountNumber: accountNumber || '',
      configured: Boolean(accountNumber),
      fromEnv: Boolean(String(process.env.RAZORPAYX_ACCOUNT_NUMBER || '').trim()),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/razorpayx-account', financeAdmin, requireStepUpTotp, async (req, res) => {
  try {
    const accountNumber = await setRazorpayxAccountNumber(req.body?.accountNumber, req.user.id);
    await writeAudit(req.user.id, 'admin.razorpayx_account.update', 'site_settings', 'razorpayx_account_number', {
      configured: Boolean(accountNumber),
    }, req.ip);
    res.json({ ok: true, configured: Boolean(accountNumber), accountNumber: accountNumber ? '••••' + accountNumber.slice(-4) : '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/users/:id/risk', moneyAdmin, async (req, res) => {
  try {
    const risk = await getUserRiskOverride(req.params.id);
    const { getVelocityPolicy } = await import('../services/velocity.js');
    res.json({ risk, global: await getVelocityPolicy() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/users/:id/risk', moneyAdmin, requireStepUpTotp, async (req, res) => {
  try {
    const body = req.body || {};
    const risk = await setUserRiskOverride(req.params.id, {
      withdrawCooldownMinutes: body.withdrawCooldownMinutes,
      maxAccountsPerIp24h: body.maxAccountsPerIp24h,
      maxMoneyOpsPerIpHour: body.maxMoneyOpsPerIpHour,
      notes: body.notes,
    }, req.user.id);
    await writeAudit(req.user.id, 'admin.user.risk', 'user', req.params.id, risk || {}, req.ip);
    res.json({ ok: true, risk });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/payment-gateways/:provider/test', async (req, res) => {
  try {
    const result = await testGatewayConnection(req.params.provider);
    await writeAudit(
      req.user.id,
      'admin.payment_gateway.test',
      'payment_gateway',
      null,
      { provider: result.provider, healthy: result.healthy, latencyMs: result.latencyMs },
      req.ip,
    );
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message, healthy: false });
  }
});

/* ── Branding / legal business name ───────────────────────── */

router.get('/branding', async (_req, res) => {
  try {
    res.json(await getBranding());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/branding', async (req, res) => {
  try {
    const body = req.body || {};
    const hasToggle = typeof body.showVexqoraLegalName === 'boolean';
    const businessModeFlag = typeof body.pgReviewMode === 'boolean'
      ? body.pgReviewMode
      : (typeof body.businessMode?.enabled === 'boolean'
        ? body.businessMode.enabled
        : (typeof body.businessModeEnabled === 'boolean' ? body.businessModeEnabled : null));
    const hasPg = typeof businessModeFlag === 'boolean';
    const hasLegal = body.gstin != null || body.cin != null || body.registeredAddress != null;
    const hasSoftware = typeof body.softwarePlatformEnabled === 'boolean';
    if (!hasToggle && !hasPg && !hasLegal && !hasSoftware) {
      return res.status(400).json({
        error: 'showVexqoraLegalName, businessMode/pgReviewMode, softwarePlatformEnabled, and/or legal fields required',
      });
    }
    const prevBranding = await getBranding();
    if (hasToggle) {
      await setSetting(SHOW_VEXQORA_KEY, body.showVexqoraLegalName, req.user.id);
    }
    if (hasPg) {
      const { setPgReviewMode } = await import('../services/siteSettings.js');
      await setPgReviewMode(businessModeFlag, req.user.id);
      await writeAudit(
        req.user.id,
        'admin.business_mode',
        'site_settings',
        'pg_review_mode',
        {
          previous: { enabled: Boolean(prevBranding.pgReviewMode) },
          next: { enabled: Boolean(businessModeFlag) },
        },
        req.ip,
      );
    }
    if (hasSoftware) {
      const { setSoftwarePlatformEnabled } = await import('../services/siteSettings.js');
      await setSoftwarePlatformEnabled(body.softwarePlatformEnabled, req.user.id);
      await writeAudit(
        req.user.id,
        'admin.software_platform',
        'site_settings',
        'software_platform_enabled',
        {
          previous: { enabled: Boolean(prevBranding.softwarePlatformEnabled) },
          next: { enabled: Boolean(body.softwarePlatformEnabled) },
        },
        req.ip,
      );
      // Align browser cookie immediately for this admin session
      const secure = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
      if (body.softwarePlatformEnabled) {
        res.cookie('sp_public', '1', {
          httpOnly: false, secure, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/',
        });
      } else {
        res.clearCookie('sp_public', { path: '/' });
      }
    }
    if (hasLegal) {
      const { setLegalEntity } = await import('../services/siteSettings.js');
      await setLegalEntity({
        gstin: body.gstin,
        cin: body.cin,
        registeredAddress: body.registeredAddress,
      }, req.user.id);
    }
    const branding = await getBranding();
    await writeAudit(
      req.user.id,
      'admin.branding.update',
      'site_settings',
      SHOW_VEXQORA_KEY,
      {
        showVexqoraLegalName: branding.showVexqoraLegalName,
        businessMode: branding.businessMode,
        softwarePlatformEnabled: branding.softwarePlatformEnabled,
        displayName: branding.displayName,
        gstin: branding.gstin,
        cin: branding.cin,
      },
      req.ip,
    );
    res.json({
      ok: true,
      message: branding.softwarePlatformEnabled
        ? 'Software Platform ON — public site shows the software product'
        : branding.pgReviewMode
          ? 'Business Mode ON — VEXQORA corporate / checkout experience'
          : branding.showVexqoraLegalName
            ? 'Legal name ON — wallet product with Vexqora entity labels'
            : 'Native SwitchP wallet product restored',
      branding,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Platform feature / ops controls ──────────────────────── */

router.get('/controls', async (_req, res) => {
  try {
    res.json(await getPlatformControls());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/controls', async (req, res) => {
  try {
    const body = req.body || {};
    const allowed = [
      'maintenanceMode',
      'maintenanceMessage',
      'maintenanceStartsAt',
      'maintenanceEndsAt',
      'depositsEnabled',
      'withdrawalsEnabled',
      'upiEnabled',
      'qrCollectEnabled',
      'billPayEnabled',
      'bankAccountsEnabled',
      'supportEnabled',
      'kycEnabled',
      'reportsEnabled',
      'activityEnabled',
      'notificationsEnabled',
      'helpEnabled',
      'limitsPageEnabled',
      'announcementsEnabled',
      'activityExportEnabled',
      'forceKycBeforeWithdraw',
      'newRegistrationsEnabled',
      'apiKeysEnabled',
      'disputesEnabled',
    ];
    const patch = {};
    for (const k of allowed) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: 'No control fields to update' });
    }
    const controls = await setPlatformControls(patch, req.user.id);
    await writeAudit(req.user.id, 'admin.controls.update', 'site_settings', 'platform_controls', patch, req.ip);
    res.json({ ok: true, controls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/ops-workers', moneyAdmin, async (_req, res) => {
  try {
    const { getOpsWorkers } = await import('../services/siteSettings.js');
    res.json(await getOpsWorkers());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/ops-workers', moneyAdmin, requireStepUpTotp, async (req, res) => {
  try {
    const { setOpsWorkers } = await import('../services/siteSettings.js');
    const body = req.body || {};
    const patch = {};
    for (const k of ['payoutWorker', 'depositWorker', 'webhookReplayWorker', 'moneyAlertsWorker']) {
      if (typeof body[k] === 'boolean') patch[k] = body[k];
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'No worker flags' });
    const workers = await setOpsWorkers(patch, req.user.id);
    await writeAudit(req.user.id, 'admin.ops_workers', 'site_settings', 'ops_workers', patch, req.ip);
    res.json({ ok: true, workers });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/users/:id/money-freeze', moneyAdmin, requireStepUpTotp, async (req, res) => {
  try {
    const { setUserMoneyFrozen } = await import('../services/userPreferences.js');
    const frozen = req.body?.frozen !== false;
    const result = await setUserMoneyFrozen(req.params.id, frozen);
    await writeAudit(req.user.id, 'admin.user.money_freeze', 'user', req.params.id, result, req.ip);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/announcement', async (_req, res) => {
  try {
    res.json(await getAnnouncement());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/announcement', async (req, res) => {
  try {
    const body = req.body || {};
    const allowed = ['enabled', 'tone', 'title', 'body', 'linkUrl', 'linkLabel'];
    const patch = {};
    for (const k of allowed) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: 'No announcement fields to update' });
    }
    const announcement = await setAnnouncement(patch, req.user.id);
    await writeAudit(req.user.id, 'admin.announcement.update', 'site_settings', 'site_announcement', patch, req.ip);
    res.json({ ok: true, announcement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/default-limits', async (_req, res) => {
  try {
    const { getVelocityPolicy } = await import('../services/velocity.js');
    const {
      getUpiLimits,
      getWithdrawalPolicy,
      getDepositOps,
      getUpiMdrPolicy,
    } = await import('../services/siteSettings.js');
    const { calcUpiCollectEconomics } = await import('../services/depositCategories.js');
    const [limits, velocity, upi, wdPolicy, depositOps, upiMdr] = await Promise.all([
      getDefaultLimits(),
      getVelocityPolicy(),
      getUpiLimits(),
      getWithdrawalPolicy(),
      getDepositOps(),
      getUpiMdrPolicy(),
    ]);
    const previewAmounts = [2000, 3000, 50000, 100000];
    res.json({
      ...limits,
      ...velocity,
      upiMinInr: upi.minInr,
      upiMaxInr: upi.maxInr,
      upiFeePct: upi.feePct,
      upiMdrEnabled: upiMdr.enabled,
      upiMdrRatePct: upiMdr.ratePct,
      upiMdrFreeUnderInr: upiMdr.freeUnderInr,
      upiMdrCapFromInr: upiMdr.capFromInr,
      upiMdrCapInr: upiMdr.capInr,
      upiMdrPreview: previewAmounts.map((grossInr) => ({
        grossInr,
        ...calcUpiCollectEconomics(grossInr, upi.feePct, upiMdr),
      })),
      autoApproveWithdrawInr: wdPolicy.autoApprovePaise / 100,
      dualControlWithdrawInr: wdPolicy.dualControlPaise / 100,
      stuckDepositMinutes: depositOps.stuckMinutes,
      depositExpireHours: depositOps.expireHours,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/default-limits', async (req, res) => {
  try {
    const body = req.body || {};
    const toPaise = (inr) => (inr == null || inr === '' ? undefined : Math.round(Number(inr) * 100));
    const patch = {};
    if (body.dailyDepositInr != null || body.dailyDepositPaise != null) {
      patch.dailyDepositPaise = body.dailyDepositPaise != null
        ? Math.round(Number(body.dailyDepositPaise))
        : toPaise(body.dailyDepositInr);
    }
    if (body.weeklyDepositInr != null || body.weeklyDepositPaise != null) {
      patch.weeklyDepositPaise = body.weeklyDepositPaise != null
        ? Math.round(Number(body.weeklyDepositPaise))
        : toPaise(body.weeklyDepositInr);
    }
    if (body.dailyWithdrawInr != null || body.dailyWithdrawPaise != null) {
      patch.dailyWithdrawPaise = body.dailyWithdrawPaise != null
        ? Math.round(Number(body.dailyWithdrawPaise))
        : toPaise(body.dailyWithdrawInr);
    }
    if (body.weeklyWithdrawInr != null || body.weeklyWithdrawPaise != null) {
      patch.weeklyWithdrawPaise = body.weeklyWithdrawPaise != null
        ? Math.round(Number(body.weeklyWithdrawPaise))
        : toPaise(body.weeklyWithdrawInr);
    }
    if (body.withdrawalFeeInr != null || body.withdrawalFeePaise != null) {
      patch.withdrawalFeePaise = body.withdrawalFeePaise != null
        ? Math.round(Number(body.withdrawalFeePaise))
        : toPaise(body.withdrawalFeeInr);
    }
    if (body.lockedBalanceInr != null || body.lockedBalancePaise != null) {
      patch.lockedBalancePaise = body.lockedBalancePaise != null
        ? Math.round(Number(body.lockedBalancePaise))
        : toPaise(body.lockedBalanceInr);
    }
    const { setVelocityPolicy } = await import('../services/velocity.js');
    const {
      setUpiLimits,
      setWithdrawalPolicy,
      setDepositOps,
      setUpiMdrPolicy,
      getUpiLimits,
      getWithdrawalPolicy,
      getDepositOps,
      getUpiMdrPolicy,
    } = await import('../services/siteSettings.js');
    const { calcUpiCollectEconomics } = await import('../services/depositCategories.js');
    const velPatch = {};
    if (body.withdrawCooldownMinutes != null) {
      velPatch.withdrawCooldownMinutes = Number(body.withdrawCooldownMinutes);
    }
    if (body.maxAccountsPerIp24h != null) {
      velPatch.maxAccountsPerIp24h = Number(body.maxAccountsPerIp24h);
    }
    if (body.maxMoneyOpsPerIpHour != null) {
      velPatch.maxMoneyOpsPerIpHour = Number(body.maxMoneyOpsPerIpHour);
    }
    const upiPatch = {};
    if (body.upiMinInr != null) upiPatch.minInr = Number(body.upiMinInr);
    if (body.upiMaxInr != null) upiPatch.maxInr = Number(body.upiMaxInr);
    if (body.upiFeePct != null) upiPatch.feePct = Number(body.upiFeePct);
    const mdrPatch = {};
    if (typeof body.upiMdrEnabled === 'boolean') mdrPatch.enabled = body.upiMdrEnabled;
    if (body.upiMdrRatePct != null) mdrPatch.ratePct = Number(body.upiMdrRatePct);
    if (body.upiMdrFreeUnderInr != null) mdrPatch.freeUnderInr = Number(body.upiMdrFreeUnderInr);
    if (body.upiMdrCapFromInr != null) mdrPatch.capFromInr = Number(body.upiMdrCapFromInr);
    if (body.upiMdrCapInr != null) mdrPatch.capInr = Number(body.upiMdrCapInr);
    const wdPatch = {};
    if (body.autoApproveWithdrawInr != null) {
      wdPatch.autoApprovePaise = Math.round(Number(body.autoApproveWithdrawInr) * 100);
    }
    if (body.dualControlWithdrawInr != null) {
      wdPatch.dualControlPaise = Math.round(Number(body.dualControlWithdrawInr) * 100);
    }
    const depPatch = {};
    if (body.stuckDepositMinutes != null) depPatch.stuckMinutes = Number(body.stuckDepositMinutes);
    if (body.depositExpireHours != null) depPatch.expireHours = Number(body.depositExpireHours);

    if (
      !Object.keys(patch).length
      && !Object.keys(velPatch).length
      && !Object.keys(upiPatch).length
      && !Object.keys(mdrPatch).length
      && !Object.keys(wdPatch).length
      && !Object.keys(depPatch).length
    ) {
      return res.status(400).json({ error: 'No limit fields to update' });
    }
    const limits = Object.keys(patch).length
      ? await setDefaultLimits(patch, req.user.id)
      : await getDefaultLimits();
    const velocity = Object.keys(velPatch).length
      ? await setVelocityPolicy(velPatch, req.user.id)
      : await (await import('../services/velocity.js')).getVelocityPolicy();
    const upi = Object.keys(upiPatch).length
      ? await setUpiLimits(upiPatch, req.user.id)
      : await getUpiLimits();
    const upiMdr = Object.keys(mdrPatch).length
      ? await setUpiMdrPolicy(mdrPatch, req.user.id)
      : await getUpiMdrPolicy();
    const wdPolicy = Object.keys(wdPatch).length
      ? await setWithdrawalPolicy(wdPatch, req.user.id)
      : await getWithdrawalPolicy();
    const depositOps = Object.keys(depPatch).length
      ? await setDepositOps(depPatch, req.user.id)
      : await getDepositOps();
    const previewAmounts = [2000, 3000, 50000, 100000];
    const merged = {
      ...limits,
      ...velocity,
      upiMinInr: upi.minInr,
      upiMaxInr: upi.maxInr,
      upiFeePct: upi.feePct,
      upiMdrEnabled: upiMdr.enabled,
      upiMdrRatePct: upiMdr.ratePct,
      upiMdrFreeUnderInr: upiMdr.freeUnderInr,
      upiMdrCapFromInr: upiMdr.capFromInr,
      upiMdrCapInr: upiMdr.capInr,
      upiMdrPreview: previewAmounts.map((grossInr) => ({
        grossInr,
        ...calcUpiCollectEconomics(grossInr, upi.feePct, upiMdr),
      })),
      autoApproveWithdrawInr: wdPolicy.autoApprovePaise / 100,
      dualControlWithdrawInr: wdPolicy.dualControlPaise / 100,
      stuckDepositMinutes: depositOps.stuckMinutes,
      depositExpireHours: depositOps.expireHours,
    };
    await writeAudit(req.user.id, 'admin.limits.defaults', 'site_settings', 'default_limits', merged, req.ip);
    res.json({ ok: true, limits: merged });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Audit ────────────────────────────────────────────────── */

router.get('/audit', async (req, res) => {
  try {
    const actionQ = String(req.query.action || '').trim();
    const actorQ = String(req.query.actor || '').trim();
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    const params = [];
    const where = [];
    if (actionQ) {
      params.push(`%${actionQ}%`);
      where.push(`a.action ILIKE $${params.length}`);
    }
    if (actorQ) {
      params.push(`%${actorQ}%`);
      where.push(`u.email ILIKE $${params.length}`);
    }
    if (from) {
      params.push(from);
      where.push(`a.created_at >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      where.push(`a.created_at < ($${params.length}::date + INTERVAL '1 day')`);
    }
    const sql = `
      SELECT a.id, a.actor_user_id, a.action, a.entity_type, a.entity_id, a.details, a.ip, a.created_at,
             u.email AS actor_email
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.actor_user_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY a.created_at DESC
      LIMIT 200`;
    const { rows } = await query(sql, params);
    res.json({
      events: rows.map((r) => {
        const d = r.details && typeof r.details === 'object' ? r.details : {};
        return {
          id: r.id,
          actorUserId: r.actor_user_id,
          actorEmail: r.actor_email || d.emailAttempt || null,
          action: r.action,
          entityType: r.entity_type,
          entityId: r.entity_id,
          details: d,
          ip: r.ip || d.ip || null,
          location: d.location || null,
          country: d.country || null,
          userAgent: d.userAgent || null,
          outcome: d.outcome || null,
          createdAt: r.created_at,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
