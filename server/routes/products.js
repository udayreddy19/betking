/**
 * Public product configuration — used by frontend ProductContext.
 * GET /api/config/products
 */

import { Router } from 'express';
import { getProductConfiguration } from '../../lib/productConfig.mjs';
import { setSoftwareModeCookie } from '../../lib/softwareModeCookie.mjs';

const router = Router();

router.get('/products', async (_req, res) => {
  try {
    const config = await getProductConfiguration();
    res.set('Cache-Control', 'no-store');
    res.json({
      wallet: config.walletEnabled === true,
      betting: config.bettingEnabled === true,
      walletEnabled: config.walletEnabled === true,
      bettingEnabled: config.bettingEnabled === true,
      pgReviewMode: config.pgReviewMode === true,
      softwarePlatformEnabled: config.softwarePlatformEnabled === true,
      softwarePlatformName: String(config.softwarePlatformName || '').trim(),
      updatedAt: config.updatedAt,
    });
  } catch {
    // Fail closed for betting/wallet only. Do NOT assert softwarePlatformEnabled=false —
    // that caused public SPA / cookie thrashing when the DB blipped.
    res.set('Cache-Control', 'no-store');
    res.json({
      wallet: false,
      betting: false,
      walletEnabled: false,
      bettingEnabled: false,
      pgReviewMode: false,
      updatedAt: null,
      note: 'unavailable',
    });
  }
});

/**
 * Software Platform public mode (mirrors SwitchP GET /api/site/software-mode).
 * Sets / clears the `sp_public` cookie so nginx can swap the public HTML root.
 * Mounted at /api/config/software-mode.
 */
router.get('/software-mode', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const config = await getProductConfiguration();
    const enabled = config.softwarePlatformEnabled === true;
    setSoftwareModeCookie(res, enabled);
    const name = String(config.softwarePlatformName || '').trim();
    res.json({
      enabled,
      softwarePlatformEnabled: enabled,
      softwarePlatformName: name,
      cookie: 'sp_public',
      note: enabled
        ? `${name || 'Software Platform'} is the public product on this host`
        : 'Native product (OddsYra sportsbook) is the public product on this host',
    });
  } catch (err) {
    // Fail safe: do not claim enabled=false — boot scripts treat that as "turn software OFF".
    res.status(503).json({
      error: err.message,
      unavailable: true,
      note: 'software mode temporarily unavailable — keep current cookie/SPA',
    });
  }
});

export default router;
