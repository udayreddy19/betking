import { Router } from 'express';
import { requireAuth } from '../middleware/userAuth.js';

const router = Router();

router.get('/api/v1/promotions', async (req, res) => {
  try {
    const { listPublicPromotionCatalog } = await import('../../lib/promotionCatalog.mjs');
    const promotions = await listPublicPromotionCatalog();
    res.json({ success: true, count: promotions.length, promotions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/v1/promotions/claim', requireAuth, async (req, res) => {
  const { promoCode, depositAmount } = req.body;
  try {
    const { claimPromotionBonus } = await import('../../lib/promotionsEngine.mjs');
    const result = await claimPromotionBonus({
      userId: req.user.userId,
      promoCode,
      depositAmount,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/api/v1/user/loyalty', requireAuth, async (req, res) => {
  try {
    const { query } = await import('../../db/pg.js');
    const lRes = await query(
      `SELECT points, COALESCE(vip_points, points) AS vip_points, tier, updated_at
       FROM user_loyalty WHERE user_id = $1;`,
      [req.user.userId],
    );
    const lData = lRes.rows[0] || { points: 0, tier: 'BRONZE' };
    res.json({ success: true, userId: req.user.userId, loyalty: lData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/v1/vip/benefits', async (req, res) => {
  try {
    const { getVipBenefitsCatalog } = await import('../../lib/vipEngine.mjs');
    res.json(getVipBenefitsCatalog());
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/v1/user/vip/status', requireAuth, async (req, res) => {
  try {
    const { getUserVipStatus } = await import('../../lib/vipEngine.mjs');
    const vip = await getUserVipStatus(req.user.userId);
    res.json({ success: true, vip });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/v1/user/vip/cashback', requireAuth, async (req, res) => {
  try {
    const { claimDailyCashback } = await import('../../lib/vipEngine.mjs');
    const result = await claimDailyCashback(req.user.userId);
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({ success: false, error: err.message, code: err.code });
  }
});

router.post('/api/v1/user/vip/monthly', requireAuth, async (req, res) => {
  try {
    const { claimMonthlyClubReward } = await import('../../lib/vipEngine.mjs');
    const result = await claimMonthlyClubReward(req.user.userId);
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({ success: false, error: err.message, code: err.code });
  }
});

router.get('/api/v1/user/vip/history', requireAuth, async (req, res) => {
  try {
    const { getVipTierHistory } = await import('../../lib/vipEngine.mjs');
    const result = await getVipTierHistory(req.user.userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/v1/affiliates/click', async (req, res) => {
  const { referralCode } = req.body;
  try {
    const { recordAffiliateClick } = await import('../../lib/affiliateEngine.mjs');
    const result = await recordAffiliateClick(referralCode);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/v1/affiliates/conversion', requireAuth, async (req, res) => {
  try {
    const { recordAffiliateConversion } = await import('../../lib/affiliateEngine.mjs');
    const result = await recordAffiliateConversion({
      ...req.body,
      referredUserId: req.user.userId,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
