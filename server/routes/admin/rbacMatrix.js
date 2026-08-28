/**
 * Granular RBAC Permissions Matrix API
 */

import { Router } from 'express';
import { requireRole } from '../../middleware/adminAuth.js';
import { query } from '../../../db/pg.js';
import { logAdminAction } from '../../middleware/auditLogger.js';

const router = Router();

const DEFAULT_PERMISSIONS = {
  SUPER_ADMIN: {
    can_settle_markets: true,
    can_void_bets: true,
    can_adjust_wallets: true,
    can_view_pii: true,
    can_override_kyc: true,
    can_modify_admins: true,
    can_freeze_platform: true,
  },
  TRADING_ADMIN: {
    can_settle_markets: true,
    can_void_bets: false,
    can_adjust_wallets: false,
    can_view_pii: false,
    can_override_kyc: false,
    can_modify_admins: false,
    can_freeze_platform: true,
  },
  FINANCE_ADMIN: {
    can_settle_markets: false,
    can_void_bets: false,
    can_adjust_wallets: true,
    can_view_pii: true,
    can_override_kyc: false,
    can_modify_admins: false,
    can_freeze_platform: false,
  },
  OPERATIONS_ADMIN: {
    can_settle_markets: false,
    can_void_bets: false,
    can_adjust_wallets: false,
    can_view_pii: true,
    can_override_kyc: true,
    can_modify_admins: false,
    can_freeze_platform: true,
  },
  RISK_ANALYST: {
    can_settle_markets: false,
    can_void_bets: false,
    can_adjust_wallets: false,
    can_view_pii: false,
    can_override_kyc: false,
    can_modify_admins: false,
    can_freeze_platform: false,
  },
};

// In-memory role permission overrides
const ROLE_OVERRIDES = new Map();

// GET /api/admin/rbac/matrix — Get all roles and granular permissions
router.get('/matrix', requireRole('SUPER_ADMIN'), (req, res) => {
  const matrix = {};
  for (const [role, perms] of Object.entries(DEFAULT_PERMISSIONS)) {
    matrix[role] = { ...perms, ...(ROLE_OVERRIDES.get(role) || {}) };
  }
  res.json({ success: true, matrix });
});

// POST /api/admin/rbac/matrix/:role — Update permissions for a role
router.post('/matrix/:role', requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const role = String(req.params.role).toUpperCase();
    if (!DEFAULT_PERMISSIONS[role]) {
      return res.status(404).json({ error: `Unknown role: ${role}` });
    }

    const updates = req.body?.permissions || req.body || {};
    const existing = ROLE_OVERRIDES.get(role) || DEFAULT_PERMISSIONS[role];
    const merged = { ...existing, ...updates };

    ROLE_OVERRIDES.set(role, merged);

    await logAdminAction({
      actorId: req.admin?.id || 'admin',
      targetId: role,
      action: 'RBAC_PERMISSIONS_UPDATED',
      details: { role, permissions: merged },
    });

    res.json({ success: true, role, permissions: merged });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
