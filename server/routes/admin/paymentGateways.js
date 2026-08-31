import { Router } from 'express';
import { requireAdminRole, ADMIN_ROLES } from '../../middleware/adminAuth.js';
import { logAdminAction } from '../../middleware/auditLogger.js';
import { paymentProviderService } from '../../../lib/paymentProviders/paymentProviderService.mjs';

const router = Router();

const ALLOWED_ROLES = [
  ADMIN_ROLES.SUPER_ADMIN,
  ADMIN_ROLES.FINANCE_ADMIN,
  ADMIN_ROLES.TECH_ADMIN,
];

/**
 * GET /api/admin/payment-gateways
 * List all payment gateway configurations, health, and transaction metrics.
 */
router.get('/', requireAdminRole(ALLOWED_ROLES), async (req, res) => {
  try {
    const gateways = await paymentProviderService.getGatewayConfigs();
    res.json({
      success: true,
      gateways,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch payment gateway configurations' });
  }
});

/**
 * PATCH /api/admin/payment-gateways/:provider
 * Toggle gateway state, set primary, or toggle allow_user_selection.
 */
router.patch('/:provider', requireAdminRole(ALLOWED_ROLES), async (req, res) => {
  const provider = String(req.params.provider).toUpperCase();
  const adminId = req.admin?.adminId || req.admin?.id || 'admin';

  try {
    const updatedConfig = await paymentProviderService.updateGatewayConfig(
      provider,
      {
        enabled: req.body.enabled,
        isPrimary: req.body.isPrimary,
        allowUserSelection: req.body.allowUserSelection,
        environment: req.body.environment,
      },
      adminId
    );

    // Audit log via admin middleware
    logAdminAction({
      action: 'PAYMENT_GATEWAY_UPDATED',
      adminId,
      entityId: provider,
      details: {
        provider,
        enabled: req.body.enabled,
        isPrimary: req.body.isPrimary,
        allowUserSelection: req.body.allowUserSelection,
      },
    });

    const gateways = await paymentProviderService.getGatewayConfigs();

    res.json({
      success: true,
      message: `Payment gateway '${provider}' updated successfully`,
      gateway: updatedConfig,
      gateways,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || 'Failed to update payment gateway' });
  }
});

/**
 * POST /api/admin/payment-gateways/:provider/test
 * Safely test connection and response latency to the payment provider.
 */
router.post('/:provider/test', requireAdminRole(ALLOWED_ROLES), async (req, res) => {
  const provider = String(req.params.provider).toUpperCase();

  try {
    const testResult = await paymentProviderService.testGatewayConnection(provider);
    res.json({
      success: true,
      ...testResult,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      provider,
      healthy: false,
      error: err.message || 'Connection test failed',
    });
  }
});

export default router;
