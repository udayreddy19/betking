/**
 * Public product configuration — used by frontend ProductContext.
 * GET /api/config/products
 */

import { Router } from 'express';
import { getProductConfiguration } from '../../lib/productConfig.mjs';

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
      updatedAt: config.updatedAt,
    });
  } catch {
    // Fail closed on transient errors — never flash Betting UI when Betting is OFF.
    // Respond 503 (not 200) so clients show a retry state and never cache this as an
    // Admin "all products off" decision.
    res.set('Cache-Control', 'no-store');
    res.status(503).json({
      wallet: false,
      betting: false,
      walletEnabled: false,
      bettingEnabled: false,
      updatedAt: null,
      note: 'unavailable',
    });
  }
});

export default router;
