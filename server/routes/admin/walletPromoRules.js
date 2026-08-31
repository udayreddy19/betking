import { Router } from 'express';
import { adminAuth, requireRole, ADMIN_ROLES } from '../../middleware/adminAuth.js';
import { logAdminAction } from '../../middleware/auditLogger.js';
import { getWalletPromoRules, updateWalletPromoRules } from '../../../lib/walletPromoRules.mjs';

const router = Router();

const ALLOWED_ROLES = [
  ADMIN_ROLES.SUPER_ADMIN,
  ADMIN_ROLES.FINANCE_ADMIN,
  ADMIN_ROLES.OPERATIONS_ADMIN,
];

/**
 * GET /api/admin/wallet-promo-rules
 * Fetch current centralized wallet and promotion rules.
 */
router.get('/', adminAuth, requireRole(ALLOWED_ROLES), async (req, res) => {
  try {
    const rules = await getWalletPromoRules();
    res.json({
      success: true,
      rules,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch wallet and promotion rules' });
  }
});

/**
 * PATCH /api/admin/wallet-promo-rules
 * Update minimum deposit amount and promotional balance rules.
 */
router.patch('/', adminAuth, requireRole(ALLOWED_ROLES), async (req, res) => {
  const adminId = req.admin?.adminId || req.admin?.id || 'admin';
  const {
    minimumDepositAmount,
    allowPartialFreeBet,
    allowPartialBonus,
    requireFullFreeBetAmount,
    requireFullBonusAmount,
  } = req.body;

  try {
    const updated = await updateWalletPromoRules(
      {
        minimumDepositAmount,
        allowPartialFreeBet,
        allowPartialBonus,
        requireFullFreeBetAmount,
        requireFullBonusAmount,
      },
      adminId
    );

    logAdminAction({
      action: 'WALLET_PROMO_RULES_UPDATED',
      adminId,
      entityId: 'wallet_promotion_rules',
      details: {
        minimumDepositAmount: updated.minimumDepositAmount,
        allowPartialFreeBet: updated.allowPartialFreeBet,
        allowPartialBonus: updated.allowPartialBonus,
        requireFullFreeBetAmount: updated.requireFullFreeBetAmount,
        requireFullBonusAmount: updated.requireFullBonusAmount,
      },
    });

    res.json({
      success: true,
      rules: updated,
      message: 'Wallet and promotion rules updated successfully',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to update wallet and promotion rules' });
  }
});

export default router;
