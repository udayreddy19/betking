import { Router } from 'express';
import { requireAuth } from '../middleware/userAuth.js';
import { userFacingBetError } from '../../lib/userFacingErrors.mjs';

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
      error: userFacingBetError(err),
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
    res.status(400).json({ success: false, error: userFacingBetError(err) });
  }
});

router.get('/api/bets/mine', requireAuth, async (req, res) => {
  try {
    const { queryRead } = await import('../../db/pg.js');
    const result = await queryRead(
      `SELECT b.bet_id, b.user_id, b.match_id, b.market_id, b.selection_id, b.stake, b.odds, b.accepted_odds,
              b.potential_payout, b.bet_type, b.status, b.created_at, COALESCE(b.fund_source, 'cash') AS fund_source,
              COALESCE(
                json_agg(
                  json_build_object(
                    'match_id', bs.match_id,
                    'market_id', bs.market_id,
                    'selection_id', bs.selection_id,
                    'selection_name', bs.selection_name,
                    'odds', bs.odds
                  ) ORDER BY bs.created_at ASC
                ) FILTER (WHERE bs.id IS NOT NULL),
                '[]'::json
              ) AS selections
       FROM bets b
       LEFT JOIN bet_selections bs ON bs.bet_id = b.bet_id
       WHERE b.user_id = $1
       GROUP BY b.bet_id, b.user_id, b.match_id, b.market_id, b.selection_id, b.stake, b.odds, b.accepted_odds,
                b.potential_payout, b.bet_type, b.status, b.created_at, b.fund_source
       ORDER BY b.created_at DESC
       LIMIT 100`,
      [req.user.userId],
    );

    // Best-effort match titles from live feed (so UI never shows raw provider IDs like 10cric_…).
    let matchTitles = {};
    try {
      const { getCachedAggregatedLiveScores } = await import('../../lib/aggregator.mjs');
      const list = Array.isArray(getCachedAggregatedLiveScores()?.matches)
        ? getCachedAggregatedLiveScores().matches
        : [];
      for (const m of list) {
        const id = String(m.id || m.matchId || '');
        if (!id) continue;
        const t1 = m.team1?.name || m.team1?.shortName || m.homeTeam?.name;
        const t2 = m.team2?.name || m.team2?.shortName || m.awayTeam?.name;
        if (t1 && t2) matchTitles[id] = `${t1} vs ${t2}`;
        else if (m.league) matchTitles[id] = String(m.league);
      }
    } catch {
      matchTitles = {};
    }

    const bets = (result.rows || []).map((row) => {
      const selections = Array.isArray(row.selections)
        ? row.selections
        : (typeof row.selections === 'string' ? JSON.parse(row.selections) : []);
      const primarySelection = selections[0] || null;
      return {
        ...row,
        selections,
        match_name: matchTitles[row.match_id] || null,
        selection_name: primarySelection?.selection_name || row.selection_name || row.selection_id,
      };
    });

    res.json({ success: true, bets });
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
      error: userFacingBetError(err),
      code: err.code || err.message?.split(':')[0] || 'BET_PLACEMENT_FAILED',
    });
  }
});

router.post(['/api/bets/sync-settlement', '/api/v1/bets/sync-settlement'], requireAuth, async (req, res) => {
  try {
    const { settleOpenBetsFromLiveScores } = await import('../../lib/liveMatchSettlement.mjs');
    const result = await settleOpenBetsFromLiveScores({ limit: 100 });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
