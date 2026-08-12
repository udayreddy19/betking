import { Router } from 'express';
import { authenticateApiKey } from '../../../lib/developerPlatformEngine.mjs';
import { query } from '../../../db/pg.js';

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

const oddsSnapshotCache = new Map();

// GET /api/public/sports/matches/:matchId/odds — Public Authoritative Match Odds Endpoint
router.get('/matches/:matchId/odds', async (req, res) => {
  const { matchId } = req.params;

  // Fast-path: Return cached snapshot if under 2000ms old for instant < 5ms response
  const cached = oddsSnapshotCache.get(matchId);
  if (cached && (Date.now() - cached.timestamp < 2000)) {
    return res.json(cached.data);
  }

  try {
    const { generate } = await import('../../../lib/odds-v3/OddsEngineV3.mjs');
    const { createCanonicalMatchState } = await import('../../../lib/odds-v3/models/CanonicalMatchState.mjs');
    const { adaptV3SnapshotToPublicContract } = await import('../../../lib/odds-v3/adapters/V3ApiAdapter.mjs');

    const ld = matchObj.liveDetails || matchObj.live_details || {};
    const rawFmt = String(matchObj.format || matchObj.matchType || matchObj.league || '').toLowerCase();
    const format = rawFmt.includes('test') ? 'TEST'
      : rawFmt.includes('hundred') ? 'THE_HUNDRED'
      : rawFmt.includes('odi') || rawFmt.includes('one day') || rawFmt.includes('50') ? 'ODI'
      : rawFmt.includes('t10') ? 'T10'
      : 'T20';

    const ballsPerInnings = format === 'THE_HUNDRED' ? 100 : (format === 'TEST' ? 450 : (format === 'ODI' ? 300 : (format === 'T10' ? 60 : 120)));

    const parseOversToBalls = (oversStr) => {
      if (!oversStr) return 0;
      const str = String(oversStr).trim();
      if (str.includes('ball')) return parseInt(str, 10) || 0;
      const parts = str.split('.');
      const overs = parseInt(parts[0], 10) || 0;
      const balls = parseInt(parts[1], 10) || 0;
      return overs * 6 + balls;
    };

    const team1Runs = Number(matchObj.team1?.runs ?? ld.runs ?? ld.firstRuns ?? ld.team1Runs ?? ld.score1 ?? 0);
    const team1Wickets = Number(matchObj.team1?.wickets ?? ld.wickets ?? ld.firstWickets ?? ld.team1Wickets ?? 0);
    const team1Balls = Number(matchObj.team1?.balls ?? parseOversToBalls(ld.overs) ?? parseOversToBalls(ld.firstOvers) ?? 0);

    const team2Runs = Number(matchObj.team2?.runs ?? ld.score2 ?? ld.chaseRuns ?? ld.team2Runs ?? 0);
    const team2Wickets = Number(matchObj.team2?.wickets ?? ld.wickets2 ?? ld.chaseWickets ?? ld.team2Wickets ?? 0);
    const team2Balls = Number(matchObj.team2?.balls ?? parseOversToBalls(ld.overs2) ?? parseOversToBalls(ld.chaseOvers) ?? 0);

    const isLive = matchObj.status === 'LIVE' || matchObj.isLive || ld.isLive;
    const isCompleted = matchObj.status === 'COMPLETED' || matchObj.isFinished;
    const status = isLive ? 'LIVE' : (isCompleted ? 'COMPLETED' : 'SCHEDULED');

    const currentInnings = Number(matchObj.currentInnings ?? (team2Runs > 0 || team2Balls > 0 ? 2 : 1));
    const target = Number(matchObj.target ?? (currentInnings === 2 ? (team2Runs > team1Runs ? team2Runs + 1 : team1Runs + 1) : null));

    const reqT1 = req.query.team1;
    const reqT2 = req.query.team2;

    const rawT1 = reqT1 || (typeof matchObj.team1 === 'string' ? matchObj.team1 : matchObj.team1?.name) || matchObj.homeTeam || matchObj.team1Name;
    const rawT2 = reqT2 || (typeof matchObj.team2 === 'string' ? matchObj.team2 : matchObj.team2?.name) || matchObj.awayTeam || matchObj.team2Name;

    const sanitizeTeamName = (name, fallback) => {
      if (!name || typeof name !== 'string') return fallback;
      const trimmed = name.trim();
      if (/^(cb|fc|api|cric|\d+)$/i.test(trimmed)) return fallback;
      return trimmed;
    };

    const t1Name = sanitizeTeamName(rawT1, 'Team 1');
    const t2Name = sanitizeTeamName(rawT2, 'Team 2');

    const t1Id = matchObj.team1?.id || matchObj.team1?.shortName || 'team1';
    const t2Id = matchObj.team2?.id || matchObj.team2?.shortName || 'team2';

    const battingTeamId = matchObj.battingTeamId || (currentInnings === 2 ? (team2Runs > team1Runs ? t1Id : t2Id) : t1Id);
    const bowlingTeamId = matchObj.bowlingTeamId || (currentInnings === 2 ? (team2Runs > team1Runs ? t2Id : t1Id) : t2Id);

    const battingTeamRuns = battingTeamId === t1Id ? team1Runs : team2Runs;
    const battingTeamBalls = battingTeamId === t1Id ? team1Balls : team2Balls;

    const rawCompleted = battingTeamBalls;
    const ballsCompleted = Math.min(rawCompleted, ballsPerInnings - 1);
    const ballsRemaining = Math.max(1, ballsPerInnings - ballsCompleted);
    const runsRequired = currentInnings === 2 && target != null ? Math.max(1, target - battingTeamRuns) : null;

    const canonicalState = createCanonicalMatchState({
      matchId: matchObj.id || matchObj.matchId || matchId,
      sport: 'CRICKET',
      format,
      status,
      team1: {
        id: t1Id,
        name: t1Name,
        runs: team1Runs,
        wickets: team1Wickets,
        balls: team1Balls,
      },
      team2: {
        id: t2Id,
        name: t2Name,
        runs: team2Runs,
        wickets: team2Wickets,
        balls: team2Balls,
      },
      currentInnings,
      battingTeamId,
      bowlingTeamId,
      target,
      runsRequired: runsRequired ?? (target != null ? Math.max(1, target - battingTeamRuns) : null),
      ballsPerInnings,
      ballsCompleted,
      ballsRemaining,
      providerTimestamp: Date.now(),
      stateVersion: Number(matchObj.stateVersion || 1),
    });

    const rawSnapshot = generate(canonicalState, { debug: false });
    const publicSnapshot = adaptV3SnapshotToPublicContract(rawSnapshot, matchObj);

    const responsePayload = {
      success: true,
      ...publicSnapshot,
    };
    oddsSnapshotCache.set(matchId, { data: responsePayload, timestamp: Date.now() });
    res.json(responsePayload);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve authoritative match odds', message: err.message });
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

    const oddsRes = await query(`
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

    const countRes = await query(`SELECT COUNT(*) FROM matches m ${whereStr};`, params);
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
