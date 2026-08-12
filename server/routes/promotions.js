import { Router } from 'express';
import { claimPromotionBonus, releaseCompletedBonus } from '../../lib/promotionsEngine.mjs';
import { query } from '../../db/pg.js';

const router = Router();

// POST /api/promotions/claim — Claim promotion bonus
router.post('/claim', async (req, res) => {
  const { userId, promoCode, depositAmount } = req.body;
  if (!userId || !promoCode) {
    return res.status(400).json({ error: 'User ID and promotion code are required' });
  }

  try {
    const result = await claimPromotionBonus({ userId, promoCode, depositAmount });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/user/bonuses — Get active user bonuses with progress percentage
router.get('/user/bonuses', async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'User ID query parameter is required' });
  }

  try {
    const result = await query(
      `SELECT ub.id, ub.promotion_id, p.name, p.code, ub.bonus_amount, ub.wagering_required, ub.wagering_completed, ub.status, ub.expires_at
       FROM user_bonuses ub
       JOIN promotions p ON p.id = ub.promotion_id
       WHERE ub.user_id = $1
       ORDER BY ub.created_at DESC`,
      [userId]
    );

    const bonuses = result.rows.map(row => {
      const reqAmt = parseFloat(row.wagering_required);
      const compAmt = parseFloat(row.wagering_completed);
      const pct = reqAmt > 0 ? Math.min(100, Math.round((compAmt / reqAmt) * 100)) : 100;

      return {
        bonusId: row.id,
        promotionName: row.name,
        code: row.code,
        bonusAmount: parseFloat(row.bonus_amount),
        wageringRequired: reqAmt,
        wageringCompleted: compAmt,
        progressPercentage: pct,
        remainingWagering: Math.max(0.00, parseFloat((reqAmt - compAmt).toFixed(2))),
        status: row.status,
        expiresAt: row.expires_at,
      };
    });

    res.json({ success: true, userId, bonuses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/user/bonuses/release — Atomic release of completed bonus
router.post('/user/bonuses/release', async (req, res) => {
  const { userId, bonusId } = req.body;
  if (!userId || !bonusId) {
    return res.status(400).json({ error: 'User ID and bonus ID are required' });
  }

  try {
    const result = await releaseCompletedBonus({ userId, bonusId });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
