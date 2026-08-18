import { Router } from 'express';
import { requireAuth } from '../middleware/userAuth.js';
import { rewardsClaimRateLimiter } from '../middleware/rateLimiter.js';
import { claimDailySpin, getDailySpinStatus } from '../../lib/dailySpinEngine.mjs';
import { redeemLoyaltyPoints } from '../../lib/loyaltyEngine.mjs';

const router = Router();

router.get('/daily-spin', requireAuth, async (req, res) => {
  try {
    const status = await getDailySpinStatus(req.user.userId);
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, code: 'SPIN_STATUS_FAILED' });
  }
});

router.post('/daily-spin', requireAuth, async (req, res) => {
  try {
    const result = await claimDailySpin(req.user.userId);
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      error: err.message,
      code: err.code || 'SPIN_FAILED',
    });
  }
});

router.post('/loyalty/redeem', requireAuth, async (req, res) => {
  try {
    const result = await redeemLoyaltyPoints(req.user.userId, req.body?.points);
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      error: err.message,
      code: err.code || 'LOYALTY_REDEEM_FAILED',
    });
  }
});

router.post('/promo/claim', requireAuth, rewardsClaimRateLimiter, async (req, res) => {
  try {
    const { claimSignupPromo } = await import('../../lib/signupPromoCodes.mjs');
    const result = await claimSignupPromo(req.user.userId, req.body?.code || req.body?.promoCode);
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      error: err.message,
      code: err.code || 'PROMO_CLAIM_FAILED',
    });
  }
});

export default router;
