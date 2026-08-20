import { Router } from 'express';
import { authenticateApiKey } from '../../../lib/developerPlatformEngine.mjs';
import { queryRead } from '../../../db/pg.js';

const router = Router();

// Middleware for Public API Key Authentication, Scope Enforcement & Rate Limiting
async function publicApiAuth(req, res, next) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  const authHeader = req.headers['authorization'] || req.headers['x-api-key'];
  if (!authHeader) {
    return res.status(401).json({
      error: {
        code: 'INVALID_API_KEY',
        message: 'Missing Authorization header or X-API-Key credential',
        requestId,
      },
    });
  }

  try {
    const authResult = await authenticateApiKey(authHeader, 'odds:read');

    // Attach Rate Limit Headers
    if (authResult.rateLimit) {
      res.setHeader('X-RateLimit-Limit', authResult.rateLimit.limit);
      res.setHeader('X-RateLimit-Remaining', authResult.rateLimit.remaining);
      res.setHeader('X-RateLimit-Reset', authResult.rateLimit.reset);
    }

    req.apiContext = authResult;
    next();
  } catch (err) {
    if (err.message.startsWith('API_RATE_LIMIT_EXCEEDED')) {
      res.setHeader('Retry-After', err.retryAfter || 60);
      if (err.rateLimit) {
        res.setHeader('X-RateLimit-Limit', err.rateLimit.limit);
        res.setHeader('X-RateLimit-Remaining', 0);
        res.setHeader('X-RateLimit-Reset', err.rateLimit.reset);
      }
      return res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Rate limit exceeded (100 requests/minute)',
          requestId,
        },
      });
    }

    if (err.message.startsWith('API_SCOPE_DENIED')) {
      return res.status(403).json({
        error: {
          code: 'INSUFFICIENT_SCOPE',
          message: err.message,
          requestId,
        },
      });
    }

    return res.status(401).json({
      error: {
        code: 'INVALID_API_KEY',
        message: 'Authentication failed: Invalid, revoked or inactive API Key',
        requestId,
      },
    });
  }
}

// GET /api/public/sports/matches/:matchId/odds — Public Authoritative Match Odds Endpoint
// Fast path: warm aggregator cache only (no match-detail scrape).
router.get('/matches/:matchId/odds', async (req, res) => {
  const { matchId } = req.params;

  try {
    const { buildMatchOddsPayload } = await import('../../../lib/liveScoresApiHandlers.mjs');
    const { parseLiveOddsOverlayFromQuery } = await import('../../../lib/matchOddsStateKey.mjs');
    const responsePayload = await buildMatchOddsPayload({
      matchId,
      team1: req.query.team1 ? String(req.query.team1) : undefined,
      team2: req.query.team2 ? String(req.query.team2) : undefined,
      force: req.query.refresh === '1' || req.query.refresh === 'true',
      stateKey: req.query.stateKey ? String(req.query.stateKey) : '',
      overlay: parseLiveOddsOverlayFromQuery(req.query),
    });
    res.json(responsePayload);
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      status: 'NOT_AVAILABLE',
      error: status === 400 ? err.message : 'Failed to retrieve authoritative match odds',
      message: err.message,
    });
  }
});

// GET /api/v1/public/odds — Public B2B Odds Syndication Endpoint
router.get('/odds', publicApiAuth, async (req, res) => {
  const { sport, league, matchId, page = 1, limit = 25 } = req.query;
  const requestId = req.requestId;

  try {
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const whereClauses = ["m.status IN ('LIVE', 'UPCOMING', 'SCHEDULED', 'COMPLETED')"];
    const params = [];
    let paramIdx = 1;

    if (matchId) {
      whereClauses.push(`m.match_id = $${paramIdx++}`);
      params.push(matchId);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const oddsRes = await queryRead(`
      SELECT
        m.match_id,
        m.start_time,
        m.status AS match_status,
        m.live_score1,
        m.live_score2,
        mk.market_id,
        mk.name AS market_name,
        mk.status AS market_status,
        s.selection_id,
        s.name AS selection_name,
        s.odds AS odds,
        s.status AS selection_status
      FROM matches m
      LEFT JOIN markets mk ON m.match_id = mk.match_id
      LEFT JOIN selections s ON mk.market_id = s.market_id
      ${whereStr}
      ORDER BY m.start_time ASC, m.match_id, mk.market_id
      LIMIT $${paramIdx++} OFFSET $${paramIdx++};
    `, [...params, limitNum, offset]);

    const countRes = await queryRead(`SELECT COUNT(*) FROM matches m ${whereStr};`, params);
    const totalRecords = parseInt(countRes.rows[0].count, 10);

    const publicData = oddsRes.rows.map(r => ({
      matchId: r.match_id,
      matchStatus: r.match_status,
      scores: { home: r.live_score1 || '0', away: r.live_score2 || '0' },
      marketId: r.market_id,
      marketName: r.market_name,
      marketStatus: r.market_status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED',
      selectionId: r.selection_id,
      selectionName: r.selection_name,
      odds: r.market_status === 'ACTIVE' ? parseFloat(r.odds || 1.0) : null, // Respect Phase 4 Stale / Suspended Odds
      updatedAt: new Date().toISOString(),
    }));

    res.json({
      success: true,
      data: publicData,
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        version: 'v1',
        page: pageNum,
        limit: limitNum,
        total: totalRecords,
      },
    });
  } catch (err) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to retrieve public odds',
        requestId,
      },
    });
  }
});

export default router;
