import { Router } from 'express';
import { requireAuth } from '../middleware/userAuth.js';

const router = Router();
const isProduction = process.env.NODE_ENV === 'production';

router.get('/health', async (req, res) => {
  try {
    const { getSystemHealthStatus } = await import('../../lib/devopsEngine.mjs');
    const health = await getSystemHealthStatus();
    const statusCode = health.status === 'DOWN' ? 503 : 200;
    res.status(statusCode).json(health);
  } catch (err) {
    res.status(500).json({ status: 'DOWN', error: err.message });
  }
});

router.get('/readiness', async (req, res) => {
  try {
    const { getReadinessStatus, getPublicReadinessStatus } = await import('../../lib/devopsEngine.mjs');
    const readiness = await getReadinessStatus();
    const publicBody = getPublicReadinessStatus(readiness);
    const statusCode = publicBody.ready ? 200 : 503;
    res.status(statusCode).json(publicBody);
  } catch (err) {
    res.status(503).json({ ready: false, error: err.message });
  }
});

router.get('/internal/readiness', async (req, res) => {
  try {
    const token = process.env.READINESS_TOKEN || process.env.ADMIN_SECRET_KEY;
    const provided = req.headers['x-readiness-token'] || req.query.token;
    const isLocal = ['127.0.0.1', '::1', 'localhost'].includes(req.hostname)
      || req.ip === '127.0.0.1'
      || req.ip === '::1';
    if (!isLocal && token && provided !== token) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { getDetailedReadinessStatus } = await import('../../lib/devopsEngine.mjs');
    const body = await getDetailedReadinessStatus();
    const statusCode = body.ready && body.settlementWorker?.healthy !== false ? 200 : 503;
    res.status(statusCode).json(body);
  } catch (err) {
    res.status(503).json({ ready: false, error: err.message });
  }
});

router.get('/liveness', async (req, res) => {
  try {
    const { getLivenessStatus } = await import('../../lib/devopsEngine.mjs');
    res.json(getLivenessStatus());
  } catch {
    res.json({ alive: true, timestamp: new Date().toISOString() });
  }
});

router.get('/api/health', async (req, res) => {
  try {
    const { checkPgHealth } = await import('../../db/pg.js');
    const { checkRedisHealth } = await import('../../db/redis.js');

    const pgHealth = await checkPgHealth();
    const redisHealth = await checkRedisHealth();

    const isHealthy = pgHealth.connected && redisHealth.connected;

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'UP' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      services: {
        postgresql: pgHealth,
        redis: redisHealth,
      },
    });
  } catch (err) {
    res.status(500).json({ status: 'DOWN', error: err.message });
  }
});

if (!isProduction) {
  router.get('/api/dev/odds-v3/:matchId', async (req, res) => {
    try {
      const { matchId } = req.params;
      const { buildMatchOddsPayload } = await import('../../lib/liveScoresApiHandlers.mjs');
      const snapshot = await buildMatchOddsPayload({ matchId, force: req.query.refresh === '1' });
      res.json(snapshot);
    } catch (err) {
      const status = err.statusCode || 500;
      res.status(status).json({ error: err.message });
    }
  });
}

router.get('/api/iplsrl', (req, res) => {
  res.json({ name: 'IPLSRL Simulated Reality League API', status: 'ACTIVE', version: '1.0.0' });
});

router.get('/api/iplsrl/seasons', async (req, res) => {
  try {
    const { getIPLSRLSeason } = await import('../../lib/iplSrlEngine.mjs');
    res.json([getIPLSRLSeason()]);
  } catch {
    res.json([]);
  }
});

router.get('/api/iplsrl/teams', async (req, res) => {
  try {
    const { getAllIPLSRLTeams } = await import('../../lib/iplSrlTeamEngine.mjs');
    res.json(getAllIPLSRLTeams());
  } catch {
    res.json([]);
  }
});

router.get('/api/iplsrl/players', async (req, res) => {
  try {
    const { getAllIPLSRLPlayers } = await import('../../lib/iplSrlPlayerEngine.mjs');
    res.json(getAllIPLSRLPlayers());
  } catch {
    res.json([]);
  }
});

router.get('/api/iplsrl/standings', async (req, res) => {
  try {
    const { getIPLSRLStandings } = await import('../../lib/iplSrlEngine.mjs');
    res.json(getIPLSRLStandings());
  } catch {
    res.json([]);
  }
});

router.get('/api/iplsrl/statistics', async (req, res) => {
  try {
    const { getIPLSRLStatistics } = await import('../../lib/statisticsEngine.mjs');
    res.json(getIPLSRLStatistics());
  } catch {
    res.json({});
  }
});

router.get('/api/iplsrl/records', async (req, res) => {
  try {
    const { getIPLSRLRecords } = await import('../../lib/statisticsEngine.mjs');
    res.json(getIPLSRLRecords());
  } catch {
    res.json({});
  }
});

router.get('/api/v1/tenant/config', async (req, res) => {
  try {
    const { resolveTenantContext } = await import('../../lib/tenantEngine.mjs');
    const tenant = await resolveTenantContext(req);
    res.json({ success: true, tenant });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/v1/public/sports', async (req, res) => {
  const authHeader = req.headers['authorization'] || req.headers['x-api-key'];
  try {
    const { authenticateApiKey } = await import('../../lib/developerPlatformEngine.mjs');
    const authContext = await authenticateApiKey(authHeader?.replace('Bearer ', ''), 'sports:read');

    const { queryRead } = await import('../../db/pg.js');
    const sportsRes = await queryRead(`SELECT sport_id, name FROM sports;`);
    res.json({ success: true, count: sportsRes.rows.length, sports: sportsRes.rows, context: authContext });
  } catch (err) {
    const status = err.message.includes('API_RATE_LIMIT') ? 429 : err.message.includes('API_SCOPE') ? 403 : 401;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.get('/api/v1/public/matches', async (req, res) => {
  const authHeader = req.headers['authorization'] || req.headers['x-api-key'];
  try {
    const { authenticateApiKey } = await import('../../lib/developerPlatformEngine.mjs');
    const authContext = await authenticateApiKey(authHeader?.replace('Bearer ', ''), 'matches:read');

    const { queryRead } = await import('../../db/pg.js');
    const matchesRes = await queryRead(`SELECT match_id, home_team, away_team, status FROM matches LIMIT 50;`);
    res.json({ success: true, count: matchesRes.rows.length, matches: matchesRes.rows, context: authContext });
  } catch (err) {
    const status = err.message.includes('API_RATE_LIMIT') ? 429 : err.message.includes('API_SCOPE') ? 403 : 401;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.post('/api/v1/developer/apps', requireAuth, async (req, res) => {
  try {
    const { createDeveloperApp } = await import('../../lib/developerPlatformEngine.mjs');
    const result = await createDeveloperApp({
      ...req.body,
      userId: req.user.userId,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/api/v1/developer/keys', requireAuth, async (req, res) => {
  try {
    const { query } = await import('../../db/pg.js');
    const owned = await query(
      `SELECT id FROM developer_apps WHERE id = $1 AND user_id = $2`,
      [req.body?.appId, req.user.userId],
    );
    if (!owned.rows.length) {
      return res.status(404).json({ success: false, error: 'App not found' });
    }
    const { generateApiKey } = await import('../../lib/developerPlatformEngine.mjs');
    const result = await generateApiKey(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/api/v1/developer/webhooks', requireAuth, async (req, res) => {
  try {
    const { query } = await import('../../db/pg.js');
    const owned = await query(
      `SELECT id FROM developer_apps WHERE id = $1 AND user_id = $2`,
      [req.body?.appId, req.user.userId],
    );
    if (!owned.rows.length) {
      return res.status(404).json({ success: false, error: 'App not found' });
    }
    const { createWebhookSubscription } = await import('../../lib/developerPlatformEngine.mjs');
    const result = await createWebhookSubscription(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/api/v1/developer/webhooks/deliveries', requireAuth, async (req, res) => {
  try {
    const { query } = await import('../../db/pg.js');
    const delivRes = await query(`
      SELECT id, subscription_id, event_type, event_id, status, attempts, response_code, created_at
      FROM webhook_deliveries
      ORDER BY created_at DESC
      LIMIT 100;
    `);
    res.json({ success: true, count: delivRes.rows.length, deliveries: delivRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/v1/sports', async (req, res) => {
  try {
    const { SPORTS_CATALOG } = await import('../../lib/sportsDataService.mjs');
    res.json({ version: 'v1', sports: SPORTS_CATALOG });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sports catalog' });
  }
});

router.get('/api/v1/matches', async (req, res) => {
  try {
    const { sportsDataRegistry } = await import('../../lib/sportsDataRegistry.mjs');
    res.json({ version: 'v1', matches: sportsDataRegistry.getAllMatches() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch active matches' });
  }
});

router.get('/api/v1/matches/:id', async (req, res) => {
  try {
    const { canonicalMatchStateEngine } = await import('../../lib/canonicalMatchState.mjs');
    const matchState = canonicalMatchStateEngine.getMatchState(req.params.id);
    if (!matchState) return res.status(404).json({ error: 'Match state unavailable' });
    res.json({ version: 'v1', match: matchState });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch match state' });
  }
});

router.get('/api/v1/cms/published', async (req, res) => {
  const { contentType, tenantId } = req.query;
  try {
    const { getPublishedContent } = await import('../../lib/cmsEngine.mjs');
    const result = await getPublishedContent(contentType || 'BANNER', { tenantId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
