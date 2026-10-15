/**
 * Daily price boosts for Home.
 */
import { Router } from 'express';
import { requireProduct } from '../middleware/requireProduct.js';

const router = Router();
const bettingOn = requireProduct('betting');

router.get(['/api/v1/boosts/daily', '/api/boosts/daily'], bettingOn, async (req, res) => {
  try {
    const { getDailyPriceBoosts } = await import('../../lib/priceBoostEngine.mjs');
    const limit = Math.min(8, Math.max(3, parseInt(req.query.limit, 10) || 5));
    res.json(await getDailyPriceBoosts({ limit }));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, boosts: [] });
  }
});

export default router;
