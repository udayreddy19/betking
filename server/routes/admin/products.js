/**
 * Admin Product Configuration API
 * GET  /api/admin/products
 * PUT  /api/admin/products
 * GET  /api/admin/products/history
 *
 * Always accessible to authorized admins regardless of product toggle state.
 */

import { Router } from 'express';
import { requireRole } from '../../middleware/adminAuth.js';
import { logAdminAction } from '../../middleware/auditLogger.js';
import {
  getProductConfiguration,
  getProductConfigurationHistory,
  updateProductConfiguration,
  broadcastProductConfigChanged,
  invalidateProductConfigCache,
} from '../../../lib/productConfig.mjs';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const config = await getProductConfiguration();
    res.json({
      walletEnabled: config.walletEnabled,
      bettingEnabled: config.bettingEnabled,
      updatedAt: config.updatedAt,
      updatedBy: config.updatedBy,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/history', requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN'), async (req, res) => {
  try {
    const history = await getProductConfigurationHistory({
      limit: Number(req.query.limit) || 50,
    });
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN'), async (req, res) => {
  try {
    const walletEnabled = req.body?.walletEnabled;
    const bettingEnabled = req.body?.bettingEnabled;
    if (typeof walletEnabled !== 'boolean' || typeof bettingEnabled !== 'boolean') {
      return res.status(400).json({
        error: 'walletEnabled and bettingEnabled must be booleans',
        code: 'INVALID_PRODUCT_CONFIG',
      });
    }

    const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 500) : null;
    const result = await updateProductConfiguration({
      walletEnabled,
      bettingEnabled,
      updatedBy: req.admin?.id || 'admin',
      reason,
      correlationId: req.correlationId || null,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
    });

    await logAdminAction({
      actorId: req.admin?.id,
      action: 'PRODUCT_CONFIGURATION_CHANGED',
      details: {
        previous: {
          walletEnabled: result.previous.walletEnabled,
          bettingEnabled: result.previous.bettingEnabled,
        },
        next: {
          walletEnabled: result.current.walletEnabled,
          bettingEnabled: result.current.bettingEnabled,
        },
        action: result.action,
        reason,
      },
      ip: req.ip || req.headers['x-forwarded-for'] || null,
      userAgent: req.headers['user-agent'] || null,
      requestId: req.correlationId || null,
    });

    if (result.previous.walletEnabled !== result.current.walletEnabled) {
      await logAdminAction({
        actorId: req.admin?.id,
        action: result.current.walletEnabled ? 'WALLET_ENABLED' : 'WALLET_DISABLED',
        details: {
          previous: result.previous.walletEnabled,
          next: result.current.walletEnabled,
        },
      });
    }
    if (result.previous.bettingEnabled !== result.current.bettingEnabled) {
      await logAdminAction({
        actorId: req.admin?.id,
        action: result.current.bettingEnabled ? 'BETTING_ENABLED' : 'BETTING_DISABLED',
        details: {
          previous: result.previous.bettingEnabled,
          next: result.current.bettingEnabled,
        },
      });
    }

    invalidateProductConfigCache();
    await broadcastProductConfigChanged(result.current);

    res.json({
      walletEnabled: result.current.walletEnabled,
      bettingEnabled: result.current.bettingEnabled,
      updatedAt: result.current.updatedAt,
      updatedBy: result.current.updatedBy,
      previous: {
        walletEnabled: result.previous.walletEnabled,
        bettingEnabled: result.previous.bettingEnabled,
      },
    });
  } catch (err) {
    res.status(err.status || 500).json({
      error: err.message,
      code: err.code || 'PRODUCT_CONFIG_UPDATE_FAILED',
    });
  }
});

export default router;
