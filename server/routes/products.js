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
    res.set('Cache-Control', 'private, max-age=5');
    res.json({
      wallet: config.walletEnabled !== false,
      betting: config.bettingEnabled !== false,
      walletEnabled: config.walletEnabled !== false,
      bettingEnabled: config.bettingEnabled !== false,
      updatedAt: config.updatedAt,
    });
  } catch {
    // Fail open to both-on defaults so a transient DB blip does not blank the app;
    // admin toggles remain authoritative once DB recovers.
    res.set('Cache-Control', 'no-store');
    res.json({
      wallet: true,
      betting: true,
      walletEnabled: true,
      bettingEnabled: true,
      updatedAt: null,
      note: 'defaults',
    });
  }
});

export default router;
