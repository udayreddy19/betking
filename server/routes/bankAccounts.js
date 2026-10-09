/**
 * User bank accounts (Wallet product).
 * Masked account display only — never returns full account numbers.
 */

import { createHash, randomUUID } from 'crypto';
import { Router } from 'express';
import { requireAuth, requireVerified } from '../middleware/userAuth.js';
import { requireProduct } from '../middleware/requireProduct.js';

const router = Router();
const walletOn = requireProduct('wallet');

function hashAccountNumber(accountNumber) {
  return createHash('sha256').update(String(accountNumber).replace(/\s+/g, '')).digest('hex');
}

function maskAccount(last4) {
  return `XXXXXX${String(last4 || '').slice(-4)}`;
}

function validateIfsc(ifsc) {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(String(ifsc || '').trim());
}

router.get('/api/v1/bank-accounts', requireAuth, walletOn, async (req, res) => {
  try {
    const { query } = await import('../../db/pg.js');
    const result = await query(
      `SELECT id, account_holder_name, bank_name, account_number_last4, ifsc,
              account_type, is_default, is_verified, status, created_at, updated_at
       FROM user_bank_accounts
       WHERE user_id = $1 AND deleted_at IS NULL AND status = 'ACTIVE'
       ORDER BY is_default DESC, created_at DESC`,
      [req.user.userId],
    );
    const accounts = (result.rows || []).map((r) => ({
      id: r.id,
      accountHolderName: r.account_holder_name,
      bankName: r.bank_name,
      maskedAccountNumber: maskAccount(r.account_number_last4),
      accountNumberLast4: r.account_number_last4,
      ifsc: r.ifsc,
      accountType: r.account_type,
      isDefault: r.is_default,
      isVerified: r.is_verified,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
    res.json({ success: true, accounts });
  } catch (err) {
    if (err?.code === '42P01') {
      return res.json({ success: true, accounts: [], note: 'table_pending_migration' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/v1/bank-accounts', requireAuth, requireVerified, walletOn, async (req, res) => {
  try {
    const { query } = await import('../../db/pg.js');
    const accountHolderName = String(req.body?.accountHolderName || '').trim().slice(0, 128);
    const bankName = String(req.body?.bankName || '').trim().slice(0, 128) || null;
    const accountNumber = String(req.body?.accountNumber || '').replace(/\s+/g, '');
    const ifsc = String(req.body?.ifsc || '').trim().toUpperCase();
    const accountType = String(req.body?.accountType || 'SAVINGS').toUpperCase().slice(0, 32);
    const setDefault = req.body?.isDefault === true;

    if (!accountHolderName || accountNumber.length < 8 || accountNumber.length > 20) {
      return res.status(400).json({ success: false, code: 'INVALID_ACCOUNT', error: 'Invalid account details' });
    }
    if (!validateIfsc(ifsc)) {
      return res.status(400).json({ success: false, code: 'INVALID_IFSC', error: 'Invalid IFSC' });
    }
    if (!/^\d+$/.test(accountNumber)) {
      return res.status(400).json({ success: false, code: 'INVALID_ACCOUNT', error: 'Account number must be numeric' });
    }

    const last4 = accountNumber.slice(-4);
    const hash = hashAccountNumber(accountNumber);
    const id = `ba_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

    if (setDefault) {
      await query(
        `UPDATE user_bank_accounts SET is_default = FALSE, updated_at = NOW()
         WHERE user_id = $1 AND deleted_at IS NULL`,
        [req.user.userId],
      );
    }

    const existing = await query(
      `SELECT COUNT(*)::int AS c FROM user_bank_accounts
       WHERE user_id = $1 AND deleted_at IS NULL AND status = 'ACTIVE'`,
      [req.user.userId],
    );
    const isFirst = (existing.rows?.[0]?.c || 0) === 0;

    await query(
      `INSERT INTO user_bank_accounts (
         id, user_id, account_holder_name, bank_name, account_number_last4,
         account_number_hash, ifsc, account_type, is_default
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        req.user.userId,
        accountHolderName,
        bankName,
        last4,
        hash,
        ifsc,
        accountType,
        setDefault || isFirst,
      ],
    );

    res.status(201).json({
      success: true,
      account: {
        id,
        accountHolderName,
        bankName,
        maskedAccountNumber: maskAccount(last4),
        accountNumberLast4: last4,
        ifsc,
        accountType,
        isDefault: setDefault || isFirst,
        isVerified: false,
      },
    });
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ success: false, code: 'ACCOUNT_EXISTS', error: 'Bank account already saved' });
    }
    if (err?.code === '42P01') {
      return res.status(503).json({ success: false, code: 'MIGRATION_PENDING', error: 'Bank accounts not available yet' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/v1/bank-accounts/:id/default', requireAuth, walletOn, async (req, res) => {
  try {
    const { query } = await import('../../db/pg.js');
    const id = req.params.id;
    const owned = await query(
      `SELECT id FROM user_bank_accounts
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL AND status = 'ACTIVE'`,
      [id, req.user.userId],
    );
    if (!owned.rows?.length) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', error: 'Bank account not found' });
    }
    await query(
      `UPDATE user_bank_accounts SET is_default = FALSE, updated_at = NOW()
       WHERE user_id = $1 AND deleted_at IS NULL`,
      [req.user.userId],
    );
    await query(
      `UPDATE user_bank_accounts SET is_default = TRUE, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [id, req.user.userId],
    );
    res.json({ success: true, id, isDefault: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/api/v1/bank-accounts/:id', requireAuth, walletOn, async (req, res) => {
  try {
    const { query } = await import('../../db/pg.js');
    const result = await query(
      `UPDATE user_bank_accounts
       SET deleted_at = NOW(), status = 'REMOVED', is_default = FALSE, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [req.params.id, req.user.userId],
    );
    if (!result.rows?.length) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', error: 'Bank account not found' });
    }
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
