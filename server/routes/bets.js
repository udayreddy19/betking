import { Router } from 'express';
import { requireAuth } from '../middleware/userAuth.js';

const router = Router();

router.get('/api/bet/cashout/quote', requireAuth, async (req, res) => {
  try {
    const betId = req.query.betId || req.query.bet_id;
    if (!betId) return res.status(400).json({ success: false, error: 'betId required' });
    const { quoteBetCashout } = await import('../../lib/cashoutEngine.mjs');
    const quote = await quoteBetCashout({ betId, userId: req.user.userId || req.user.id });
    res.json({ success: true, ...quote });
  } catch (err) {
    res.status(err.message?.includes('BET_NOT_FOUND') ? 404 : 400).json({
      success: false,
      error: err.message,
      available: false,
      cashoutValue: 0,
    });
  }
});

router.post('/api/bet/cashout', requireAuth, async (req, res) => {
  const { betId, requestedCashoutValue } = req.body;
  const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey;
  try {
    const { executeBetCashout } = await import('../../lib/cashoutEngine.mjs');
    const result = await executeBetCashout({
      betId,
      userId: req.user.userId,
      requestedCashoutValue,
      idempotencyKey,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/api/bets/mine', requireAuth, async (req, res) => {
  try {
    const { queryRead } = await import('../../db/pg.js');
    const result = await queryRead(
      `SELECT bet_id, user_id, match_id, market_id, selection_id, stake, odds, accepted_odds,
              potential_payout, bet_type, status, created_at, COALESCE(fund_source, 'cash') AS fund_source
       FROM bets
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.user.userId],
    );
    res.json({ success: true, bets: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post(['/api/bets/place', '/api/v1/bet/place'], requireAuth, async (req, res) => {
  const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey;
  try {
    const { betPlacementEngine } = await import('../../lib/betPlacementEngine.mjs');
    const result = await betPlacementEngine.placeBet({
      ...req.body,
      userId: req.user.userId,
      idempotencyKey,
    }, req.correlationId);

    res.json({ version: 'v1', ...result });
  } catch (err) {
    let statusCode = 400;
    if (err.message?.includes('ACCOUNT_RESTRICTED') || err.message?.includes('ACCOUNT_SUSPENDED')
      || err.code === 'KYC_AGE_REQUIRED' || err.code === 'REALITY_CHECK_REQUIRED' || err.code === 'LOSS_LIMIT_EXCEEDED'
      || err.message?.includes('KYC_AGE_REQUIRED') || err.message?.includes('REALITY_CHECK_REQUIRED') || err.message?.includes('LOSS_LIMIT_EXCEEDED')) {
      statusCode = 403;
    } else if (err.message?.includes('UNAUTHENTICATED')) {
      statusCode = 401;
    }
    res.status(statusCode).json({
      error: err.message || 'Bet placement failed',
      code: err.message?.split(':')[0] || 'BET_PLACEMENT_FAILED',
    });
  }
});

export default router;
