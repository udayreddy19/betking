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
  syncSoftwarePlatformService,
} from '../../../lib/productConfig.mjs';
import { setSoftwareModeCookie } from '../../../lib/softwareModeCookie.mjs';

const router = Router();

function publicShape(config) {
  return {
    walletEnabled: config.walletEnabled === true,
    bettingEnabled: config.bettingEnabled === true,
    pgReviewMode: config.pgReviewMode === true,
    softwarePlatformEnabled: config.softwarePlatformEnabled === true,
    softwarePlatformName: String(config.softwarePlatformName || '').trim(),
    walletStored: config.walletStored !== false,
    bettingStored: config.bettingStored !== false,
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy,
  };
}

router.get('/', async (req, res) => {
  try {
    const config = await getProductConfiguration();
    res.json(publicShape(config));
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
    const pgReviewMode = req.body?.pgReviewMode;
    const softwarePlatformEnabled = req.body?.softwarePlatformEnabled;
    const softwarePlatformName = req.body?.softwarePlatformName;
    if (walletEnabled !== undefined && typeof walletEnabled !== 'boolean') {
      return res.status(400).json({
        error: 'walletEnabled must be a boolean',
        code: 'INVALID_PRODUCT_CONFIG',
      });
    }
    if (typeof bettingEnabled !== 'boolean') {
      return res.status(400).json({
        error: 'bettingEnabled must be a boolean',
        code: 'INVALID_PRODUCT_CONFIG',
      });
    }
    if (pgReviewMode !== undefined && typeof pgReviewMode !== 'boolean') {
      return res.status(400).json({
        error: 'pgReviewMode must be a boolean',
        code: 'INVALID_PRODUCT_CONFIG',
      });
    }

    if (softwarePlatformEnabled !== undefined && typeof softwarePlatformEnabled !== 'boolean') {
      return res.status(400).json({
        error: 'softwarePlatformEnabled must be a boolean',
        code: 'INVALID_PRODUCT_CONFIG',
      });
    }
    if (softwarePlatformName !== undefined && typeof softwarePlatformName !== 'string') {
      return res.status(400).json({
        error: 'softwarePlatformName must be a string',
        code: 'INVALID_PRODUCT_CONFIG',
      });
    }

    const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 500) : null;
    const result = await updateProductConfiguration({
      walletEnabled: typeof walletEnabled === 'boolean' ? walletEnabled : undefined,
      bettingEnabled,
      pgReviewMode,
      softwarePlatformEnabled,
      softwarePlatformName: typeof softwarePlatformName === 'string' ? softwarePlatformName : undefined,
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
          walletEnabled: result.previous.walletStored,
          bettingEnabled: result.previous.bettingStored,
          pgReviewMode: result.previous.pgReviewMode,
          softwarePlatformEnabled: result.previous.softwarePlatformEnabled,
          softwarePlatformName: result.previous.softwarePlatformName || '',
        },
        next: {
          walletEnabled: result.current.walletStored,
          bettingEnabled: result.current.bettingStored,
          pgReviewMode: result.current.pgReviewMode,
          softwarePlatformEnabled: result.current.softwarePlatformEnabled,
          softwarePlatformName: result.current.softwarePlatformName || '',
        },
        action: result.action,
        reason,
      },
      ip: req.ip || req.headers['x-forwarded-for'] || null,
      userAgent: req.headers['user-agent'] || null,
      requestId: req.correlationId || null,
    });

    if (result.previous.pgReviewMode !== result.current.pgReviewMode) {
      await logAdminAction({
        actorId: req.admin?.id,
        action: result.current.pgReviewMode ? 'PG_REVIEW_ENABLED' : 'PG_REVIEW_DISABLED',
        details: {
          previous: result.previous.pgReviewMode,
          next: result.current.pgReviewMode,
        },
      });
    }
    if (result.previous.walletStored !== result.current.walletStored) {
      await logAdminAction({
        actorId: req.admin?.id,
        action: result.current.walletStored ? 'WALLET_ENABLED' : 'WALLET_DISABLED',
        details: {
          previous: result.previous.walletStored,
          next: result.current.walletStored,
        },
      });
    }
    if (result.previous.bettingStored !== result.current.bettingStored) {
      await logAdminAction({
        actorId: req.admin?.id,
        action: result.current.bettingStored ? 'BETTING_ENABLED' : 'BETTING_DISABLED',
        details: {
          previous: result.previous.bettingStored,
          next: result.current.bettingStored,
        },
      });
    }

    if (result.previous.softwarePlatformEnabled !== result.current.softwarePlatformEnabled) {
      // Only ever ENABLE the shared software service. Never call /disable: it is global and
      // would break the other domain. Public HTML per domain is controlled by cookie + nginx.
      if (result.current.softwarePlatformEnabled === true) {
        syncSoftwarePlatformService(true, {
          softwarePlatformName: result.current.softwarePlatformName,
        }).catch(() => {});
      }
      await logAdminAction({
        actorId: req.admin?.id,
        action: result.current.softwarePlatformEnabled
          ? 'SOFTWARE_PLATFORM_ENABLED'
          : 'SOFTWARE_PLATFORM_DISABLED',
        details: {
          previous: result.previous.softwarePlatformEnabled,
          next: result.current.softwarePlatformEnabled,
        },
      });
    } else if (
      result.current.softwarePlatformEnabled === true
      && result.previous.softwarePlatformName !== result.current.softwarePlatformName
    ) {
      // Keep public software SPA brand in sync when admin saves the display name.
      syncSoftwarePlatformService(true, {
        softwarePlatformName: result.current.softwarePlatformName,
      }).catch(() => {});
    }

    // Keep the admin browser's routing cookie in sync with the toggle.
    setSoftwareModeCookie(res, result.current.softwarePlatformEnabled === true);

    invalidateProductConfigCache();
    await broadcastProductConfigChanged(result.current);

    res.json({
      ...publicShape(result.current),
      previous: {
        walletEnabled: result.previous.walletStored,
        bettingEnabled: result.previous.bettingStored,
        pgReviewMode: result.previous.pgReviewMode,
        softwarePlatformEnabled: result.previous.softwarePlatformEnabled,
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
