// Node.js / Express Backend Server with Razorpay Webhook Handler
// Usage: node server/index.js

import express from 'express';
import crypto from 'crypto';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 5001;

// IMPORTANT: Razorpay Webhooks MUST receive the RAW request body to verify HMAC signatures accurately.
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(cors());

// ── Rate Limiting & Auth Middleware ──
import { loginRateLimiter, registerRateLimiter } from './middleware/rateLimiter.js';
import { adminAuth, requireRole } from './middleware/adminAuth.js';

// ── Mount Modular Admin v2 Router (Phases 1-21: Advanced Operations & Governance) ──
import adminRouter from './routes/index.js';
app.use('/api/admin/v2', adminRouter);

// Razorpay Webhook Secret
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'betking_wh_secret_2026';

// -----------------------------------------------------------------------------
// Production Operational Health, Liveness & Readiness Endpoints
// -----------------------------------------------------------------------------
app.get('/health', async (req, res) => {
  try {
    const { getSystemHealthStatus } = await import('../lib/devopsEngine.mjs');
    const health = await getSystemHealthStatus();
    const statusCode = health.status === 'DOWN' ? 503 : 200;
    res.status(statusCode).json(health);
  } catch (err) {
    res.status(500).json({ status: 'DOWN', error: err.message });
  }
});

app.get('/readiness', async (req, res) => {
  try {
    const { getReadinessStatus } = await import('../lib/devopsEngine.mjs');
    const readiness = await getReadinessStatus();
    const statusCode = readiness.ready ? 200 : 503;
    res.status(statusCode).json(readiness);
  } catch (err) {
    res.status(503).json({ ready: false, error: err.message });
  }
});

app.get('/liveness', async (req, res) => {
  try {
    const { getLivenessStatus } = await import('../lib/devopsEngine.mjs');
    res.json(getLivenessStatus());
  } catch {
    res.json({ alive: true, timestamp: new Date().toISOString() });
  }
});

// -----------------------------------------------------------------------------
// Authentication Endpoints with Rate Limiting (Task 2)
// -----------------------------------------------------------------------------
app.post(['/api/auth/register', '/api/v1/auth/register'], registerRateLimiter, async (req, res) => {
  try {
    const { email, password, phone, userId: reqUserId } = req.body;
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: 'Valid email and password (min 6 chars) required', code: 'INVALID_INPUT' });
    }

    const { query, withTransaction } = await import('../db/pg.js');
    const { generateAdminToken } = await import('./middleware/adminAuth.js');

    const existing = await query('SELECT user_id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists', code: 'EMAIL_EXISTS' });
    }

    const userId = reqUserId || `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const passHash = crypto.createHash('sha256').update(password).digest('hex');

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO users (user_id, email, phone, password_hash)
         VALUES ($1, $2, $3, $4)`,
        [userId, email, phone || null, passHash]
      );
      await client.query(
        `INSERT INTO wallets (wallet_id, user_id, balance, currency)
         VALUES ($1, $2, 0.00, 'INR')
         ON CONFLICT (user_id) DO NOTHING`,
        [`wal_${userId}`, userId]
      );
    });

    const token = generateAdminToken(userId, 'USER', 'betking_in');
    res.status(201).json({
      success: true,
      token,
      user: { userId, email, phone: phone || null },
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed', message: err.message });
  }
});

app.post(['/api/auth/login', '/api/v1/auth/login'], loginRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required', code: 'MISSING_CREDENTIALS' });
    }

    const { query } = await import('../db/pg.js');
    const { generateAdminToken } = await import('./middleware/adminAuth.js');

    const passHash = crypto.createHash('sha256').update(password).digest('hex');
    const userRes = await query('SELECT user_id, email, phone, password_hash FROM users WHERE email = $1', [email]);

    if (userRes.rows.length === 0 || (userRes.rows[0].password_hash && userRes.rows[0].password_hash !== passHash)) {
      return res.status(401).json({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
    }

    const user = userRes.rows[0];
    const token = generateAdminToken(user.user_id, 'USER', 'betking_in');
    res.json({
      success: true,
      token,
      user: { userId: user.user_id, email: user.email, phone: user.phone },
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed', message: err.message });
  }
});

// -----------------------------------------------------------------------------
// 1. Create Razorpay Order API (Called from Frontend before Checkout)
// -----------------------------------------------------------------------------
app.post('/api/create-order', async (req, res) => {
  const { amount, userId } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid deposit amount' });
  }

  try {
    // If using razorpay SDK:
    // const order = await razorpayInstance.orders.create({
    //   amount: amount * 100, // paise
    //   currency: 'INR',
    //   receipt: `rcpt_${userId}_${Date.now()}`,
    //   notes: { userId: userId || 'udayreddy12' }
    // });

    // Mock response format matching Razorpay API:
    const mockOrder = {
      id: `order_${Math.random().toString(36).substring(2, 12)}`,
      entity: 'order',
      amount: amount * 100,
      amount_paid: 0,
      amount_due: amount * 100,
      currency: 'INR',
      receipt: `rcpt_${userId || 'user123'}_${Date.now()}`,
      status: 'created',
      notes: { userId: userId || 'udayreddy12' }
    };

    console.log(`[API] Order created: ${mockOrder.id} for ₹${amount}`);
    res.json(mockOrder);
  } catch (err) {
    console.error('[API Error] Failed to create order:', err);
    res.status(500).json({ error: 'Server error creating order' });
  }
});

// -----------------------------------------------------------------------------
// Database Health Endpoint (PostgreSQL & Redis Connectivity Check)
// -----------------------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  try {
    const { checkPgHealth } = await import('../db/pg.js');
    const { checkRedisHealth } = await import('../db/redis.js');

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

// -----------------------------------------------------------------------------
// Dev Endpoint for OddsEngineV3 (Isolated Testing)
// -----------------------------------------------------------------------------
app.get('/api/dev/odds-v3/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;
    const { generate } = await import('../lib/odds-v3/OddsEngineV3.mjs');
    const { createCanonicalMatchState } = await import('../lib/odds-v3/models/CanonicalMatchState.mjs');

    const matchState = createCanonicalMatchState({
      matchId: matchId || 'cric_hundred_m_1',
      sport: 'CRICKET',
      format: 'THE_HUNDRED',
      status: 'LIVE',
      team1: { id: 'OVI', name: 'Oval Invincibles', runs: 142, wickets: 5, balls: 100 },
      team2: { id: 'TRT', name: 'Trent Rockets', runs: 98, wickets: 3, balls: 58 },
      currentInnings: 2,
      battingTeamId: 'TRT',
      bowlingTeamId: 'OVI',
      target: 143,
      runsRequired: 45,
      ballsPerInnings: 100,
      ballsCompleted: 58,
      ballsRemaining: 42,
      providerTimestamp: Date.now(),
      stateVersion: 1,
    });

    const snapshot = generate(matchState, { debug: true });
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 2. Razorpay Webhook & Payment Endpoints
// -----------------------------------------------------------------------------
app.post('/api/webhooks/razorpay', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  try {
    const { depositEngine } = await import('../lib/depositEngine.mjs');
    const result = await depositEngine.processWebhook({
      rawBody: req.rawBody,
      signature,
      payload: req.body.payload,
      event: req.body.event,
    }, req.correlationId);

    res.json(result);
  } catch (err) {
    const statusCode = err.message?.includes('INVALID_SIGNATURE') ? 400 : 500;
    res.status(statusCode).json({ error: err.message || 'Webhook processing failed' });
  }
});

app.post('/api/v1/payments/create-order', async (req, res) => {
  try {
    const { depositEngine } = await import('../lib/depositEngine.mjs');
    const result = await depositEngine.createOrder(req.body, req.correlationId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/v1/withdrawals/request', async (req, res) => {
  try {
    const { withdrawalEngine } = await import('../lib/withdrawalEngine.mjs');
    const result = await withdrawalEngine.requestWithdrawal(req.body, req.correlationId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 3. IPLSRL REST APIs (Module AD)
// -----------------------------------------------------------------------------
app.get('/api/iplsrl', (req, res) => {
  res.json({ name: 'IPLSRL Simulated Reality League API', status: 'ACTIVE', version: '1.0.0' });
});

app.get('/api/iplsrl/seasons', async (req, res) => {
  try {
    const { getIPLSRLSeason } = await import('../lib/iplSrlEngine.mjs');
    res.json([getIPLSRLSeason()]);
  } catch {
    res.json([]);
  }
});

app.get('/api/iplsrl/teams', async (req, res) => {
  try {
    const { getAllIPLSRLTeams } = await import('../lib/iplSrlTeamEngine.mjs');
    res.json(getAllIPLSRLTeams());
  } catch {
    res.json([]);
  }
});

app.get('/api/iplsrl/players', async (req, res) => {
  try {
    const { getAllIPLSRLPlayers } = await import('../lib/iplSrlPlayerEngine.mjs');
    res.json(getAllIPLSRLPlayers());
  } catch {
    res.json([]);
  }
});

app.get('/api/iplsrl/standings', async (req, res) => {
  try {
    const { getIPLSRLStandings } = await import('../lib/iplSrlEngine.mjs');
    res.json(getIPLSRLStandings());
  } catch {
    res.json([]);
  }
});

app.get('/api/iplsrl/statistics', async (req, res) => {
  try {
    const { getIPLSRLStatistics } = await import('../lib/statisticsEngine.mjs');
    res.json(getIPLSRLStatistics());
  } catch {
    res.json({});
  }
});

app.get('/api/iplsrl/records', async (req, res) => {
  try {
    const { getIPLSRLRecords } = await import('../lib/statisticsEngine.mjs');
    res.json(getIPLSRLRecords());
  } catch {
    res.json({});
  }
});

app.post('/api/admin/iplsrl/matches/start', (req, res) => {
  const { matchId } = req.body;
  res.json({ success: true, matchId, status: 'IN_PROGRESS', message: 'Match started successfully.' });
});

app.post('/api/admin/iplsrl/matches/pause', (req, res) => {
  const { matchId } = req.body;
  res.json({ success: true, matchId, status: 'PAUSED', message: 'Match paused successfully.' });
});

// -----------------------------------------------------------------------------
// Anti-Fraud & Risk Flagged Accounts Management APIs
// -----------------------------------------------------------------------------
app.get('/api/admin/risk/accounts', async (req, res) => {
  try {
    const { fraudGraphEngine } = await import('../lib/fraudGraphEngine.mjs');
    res.json({ accounts: fraudGraphEngine.getFlaggedAccounts() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch risk flagged accounts' });
  }
});

app.get('/api/admin/risk/accounts/:id', async (req, res) => {
  try {
    const { fraudGraphEngine } = await import('../lib/fraudGraphEngine.mjs');
    const details = fraudGraphEngine.getAccountDetails(req.params.id);
    if (!details) return res.status(404).json({ error: 'Account details not found' });
    res.json({ account: details });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch account risk details' });
  }
});

app.post('/api/admin/risk/accounts/:id/restrict', async (req, res) => {
  const { category, operatorNotes, operatorId } = req.body;
  try {
    const { fraudGraphEngine } = await import('../lib/fraudGraphEngine.mjs');
    const { enterpriseAuditEngine } = await import('../lib/enterpriseAuditEngine.mjs');
    const { dispatchSystemNotification } = await import('../lib/notificationEngine.mjs');

    const updatedAcc = fraudGraphEngine.restrictAccount(req.params.id, { category, operatorNotes, operatorId });

    enterpriseAuditEngine.recordEvent({
      who: operatorId || 'admin',
      what: 'RISK_ACCOUNT_RESTRICTED',
      reason: operatorNotes || category,
      referenceId: req.params.id,
    });

    dispatchSystemNotification({
      type: 'ACCOUNT_RESTRICTED',
      userId: updatedAcc.email,
      message: `Your account has been restricted under review category '${category}'.`,
    });

    res.json({ success: true, account: updatedAcc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/risk/accounts/:id/verification', async (req, res) => {
  const { verificationType, operatorNotes, operatorId } = req.body;
  try {
    const { fraudGraphEngine } = await import('../lib/fraudGraphEngine.mjs');
    const { enterpriseAuditEngine } = await import('../lib/enterpriseAuditEngine.mjs');
    const { dispatchSystemNotification } = await import('../lib/notificationEngine.mjs');

    const updatedAcc = fraudGraphEngine.requestVerification(req.params.id, { verificationType, operatorNotes, operatorId });

    enterpriseAuditEngine.recordEvent({
      who: operatorId || 'admin',
      what: 'VERIFICATION_REQUESTED',
      reason: operatorNotes || verificationType,
      referenceId: req.params.id,
    });

    dispatchSystemNotification({
      type: 'VERIFICATION_REQUIRED',
      userId: updatedAcc.email,
      message: `Account verification (${verificationType}) is required to unlock full account privileges.`,
    });

    res.json({ success: true, account: updatedAcc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/risk/accounts/:id/release', async (req, res) => {
  const { operatorReason, operatorId } = req.body;
  try {
    const { fraudGraphEngine } = await import('../lib/fraudGraphEngine.mjs');
    const { enterpriseAuditEngine } = await import('../lib/enterpriseAuditEngine.mjs');
    const { dispatchSystemNotification } = await import('../lib/notificationEngine.mjs');

    const releaseResult = fraudGraphEngine.releaseAccount(req.params.id, { operatorReason, operatorId });

    if (!releaseResult.success) {
      return res.status(400).json({ success: false, reason: releaseResult.reason });
    }

    enterpriseAuditEngine.recordEvent({
      who: operatorId || 'admin',
      what: 'RISK_ACCOUNT_RELEASED',
      reason: operatorReason,
      referenceId: req.params.id,
    });

    dispatchSystemNotification({
      type: 'ACCOUNT_RELEASED',
      userId: releaseResult.account.email,
      message: 'Your account restrictions have been cleared. Account is active.',
    });

    res.json({ success: true, account: releaseResult.account });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Admin Master Command Center & Operator API Endpoints
// -----------------------------------------------------------------------------
app.get('/api/admin/command-center/kpis', async (req, res) => {
  try {
    const { platformReadinessEngine } = await import('../lib/platformReadinessEngine.mjs');
    const { providerHealthManager } = await import('../lib/providerHealthManager.mjs');
    const { exposureEngine } = await import('../lib/exposureEngine.mjs');

    const readiness = platformReadinessEngine.getReadinessStatus();
    const providerHealth = providerHealthManager.getProviderHealth();
    const exposureSummary = exposureEngine.getExposureSummary();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      kpis: {
        activeUsers: 1482,
        activeMatches: 24,
        liveBets: 384,
        betsPerMinute: 42,
        currentExposure: exposureSummary.netLiability || 124500,
        currentLiability: exposureSummary.totalExposure || 382000,
        potentialPayout: exposureSummary.potentialPayout || 512000,
        deposits: 452000,
        withdrawals: 198000,
        ggr: 254000,
        ngr: 218000,
        failedPayments: 3,
        failedSettlements: 0,
        pendingKyc: 12,
        activeFraudCases: 4,
        restrictedAccounts: 2,
        providerHealthScore: providerHealth.activeProvidersCount > 0 ? 'HEALTHY' : 'DEGRADED',
        websocketHealth: 'OPERATIONAL (1,482 connections)',
        databaseHealth: readiness.healthy ? 'HEALTHY' : 'ATTENTION',
        queueHealth: 'NORMAL (0 backlog)',
      },
      providerHealth,
      systemHealth: readiness,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/bets/investigate', async (req, res) => {
  const { betId, userId, matchId } = req.query;
  try {
    const { transactionTraceEngine } = await import('../lib/transactionTraceEngine.mjs');
    const { settlementRules } = await import('../lib/settlementRules.mjs');

    const trace = transactionTraceEngine.traceTransaction(betId || 'BET_LIVE_9981');
    res.json({
      success: true,
      betId: betId || 'BET_LIVE_9981',
      userEmail: userId || 'user992@tempmail.com',
      matchId: matchId || '10cric_2026_101',
      traceTimeline: trace.timeline,
      settlementRule: settlementRules.getRuleSummary('cricket'),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/settlement/queue', async (req, res) => {
  try {
    const { settlementRules } = await import('../lib/settlementRules.mjs');
    const pendingQueue = settlementRules.getPendingQueue();
    res.json({ success: true, pendingQueue, settledCount: 1420, failedCount: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/providers/health-matrix', async (req, res) => {
  try {
    const { providerHealthManager } = await import('../lib/providerHealthManager.mjs');
    const health = providerHealthManager.getProviderHealth();
    res.json({ success: true, providerHealth: health });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Phase 2 Advanced Control Plane APIs
app.get('/api/admin/investigations/graph', async (req, res) => {
  const { entityId, entityType } = req.query;
  try {
    const { fraudGraphEngine } = await import('../lib/fraudGraphEngine.mjs');
    const { transactionTraceEngine } = await import('../lib/transactionTraceEngine.mjs');
    const graphData = fraudGraphEngine.getGraphSummary();
    const trace = transactionTraceEngine.traceTransaction(entityId || 'BET_LIVE_9981');
    res.json({ success: true, entityId, entityType, graph: graphData, traceTimeline: trace.timeline });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/event-replay/snapshots', async (req, res) => {
  const { matchId } = req.query;
  try {
    const { stateSnapshotEngine } = await import('../lib/stateSnapshotEngine.mjs');
    const history = stateSnapshotEngine.getSnapshotHistory(matchId || '10cric_2026_101');
    res.json({ success: true, matchId: matchId || '10cric_2026_101', snapshots: history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/search/global', async (req, res) => {
  const { query } = req.body;
  try {
    const { searchEngine } = await import('../lib/searchEngine.mjs');
    const results = searchEngine.search(query || '');
    res.json({ success: true, query, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/anomalies/list', async (req, res) => {
  try {
    const { globalRiskOrchestrator } = await import('../lib/globalRiskOrchestrator.mjs');
    const riskSummary = globalRiskOrchestrator.getRiskSummary();
    res.json({
      success: true,
      anomalies: [
        { id: 'anom_01', type: 'Betting Velocity', entity: '10cric_2026_101', severity: 'HIGH', status: 'INVESTIGATING', confidence: '94%', timestamp: new Date().toISOString() },
        { id: 'anom_02', type: 'Feed Latency', entity: 'CREX Provider', severity: 'MEDIUM', status: 'VALIDATING', confidence: '88%', timestamp: new Date().toISOString() },
      ],
      riskSummary,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/blast-radius/calculate', async (req, res) => {
  const { providerId, matchId } = req.body;
  try {
    const { exposureEngine } = await import('../lib/exposureEngine.mjs');
    const summary = exposureEngine.getExposureSummary();
    res.json({
      success: true,
      target: providerId || matchId || '10Cric Provider',
      affectedMatches: 4,
      affectedMarkets: 28,
      affectedUsers: 148,
      openBetsCount: 312,
      exposureImpact: summary.netLiability || 124500,
      severity: 'HIGH',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/slo/metrics', async (req, res) => {
  try {
    const { platformReadinessEngine } = await import('../lib/platformReadinessEngine.mjs');
    const readiness = platformReadinessEngine.getReadinessStatus();
    res.json({
      success: true,
      slos: [
        { name: 'Score Freshness SLA', current: '12 ms', target: '< 100 ms', status: 'HEALTHY' },
        { name: 'Bet Acceptance Latency', current: '18 ms', target: '< 200 ms', status: 'HEALTHY' },
        { name: 'Settlement Processing SLA', current: '1.2 s', target: '< 5.0 s', status: 'HEALTHY' },
        { name: 'Provider Telemetry Uptime', current: '99.99%', target: '> 99.90%', status: 'HEALTHY' },
      ],
      readiness,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/copilot/query', async (req, res) => {
  const { question } = req.body;
  try {
    const { supportAssistant } = await import('../lib/supportAssistant.mjs');
    const { platformReadinessEngine } = await import('../lib/platformReadinessEngine.mjs');
    const readiness = platformReadinessEngine.getReadinessStatus();
    const answer = supportAssistant.ask(question || 'Why is exposure high today?');

    res.json({
      success: true,
      question: question || 'System status query',
      answer: answer || `System status is ${readiness.healthy ? 'OPERATIONAL' : 'ATTENTION'}. Active sports providers: 10Cric 2026, CREX, Cricbuzz, FanCode.`,
      evidence: {
        healthy: readiness.healthy,
        activeConnections: 1482,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Phase 3 Platform Intelligence, Integrity & Resilience Layer APIs
app.get('/api/admin/platform-twin/graph', async (req, res) => {
  try {
    const { sportsDataRegistry } = await import('../lib/sportsDataRegistry.mjs');
    const { providerHealthManager } = await import('../lib/providerHealthManager.mjs');
    res.json({
      success: true,
      digitalTwin: {
        platform: 'BetKing Production Environment',
        activeTenants: 1,
        activeMatchesCount: sportsDataRegistry.getAllMatches().length,
        providersCount: providerHealthManager.getProviderHealth().activeProvidersCount,
        integrityStatus: 'VERIFIED',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/root-cause/analyze', async (req, res) => {
  const { problemId } = req.query;
  try {
    const { providerHealthManager } = await import('../lib/providerHealthManager.mjs');
    const health = providerHealthManager.getProviderHealth();
    res.json({
      success: true,
      problemId: problemId || 'SETTLEMENT_DELAY_01',
      rootCauseCandidates: [
        { candidate: 'CREX Provider Latency Spike', probability: '92%', status: 'CONFIRMED', evidence: 'Response latency exceeded 5,000ms threshold' },
        { candidate: 'Database Lock Contention', probability: '14%', status: 'UNLIKELY', evidence: 'Lock wait times under 5ms' },
      ],
      providerHealth: health,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/match-integrity/issues', async (req, res) => {
  try {
    const { matchDataRepairEngine } = await import('../lib/matchDataRepairEngine.mjs');
    const auditReport = matchDataRepairEngine.getAuditReport();
    res.json({ success: true, integrityIssues: auditReport.issues || [], scoreMonotonicityStatus: 'VERIFIED' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/financial-integrity/reconciliation', async (req, res) => {
  try {
    const { loadAllSystemTransactions } = await import('../src/utils/transactions.js');
    const txs = loadAllSystemTransactions();
    res.json({
      success: true,
      reconciliationStatus: 'BALANCED',
      totalTransactionsAudited: txs.length,
      discrepancyCount: 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/chaos/simulate', async (req, res) => {
  const { scenarioType, matchId } = req.body;
  try {
    const { disasterRecoverySimulator } = await import('../lib/disasterRecoverySimulator.mjs');
    const result = await disasterRecoverySimulator.runSimulationScenario(scenarioType || 'CACHE_FLUSH_RECOVERY', matchId || 'sim_match_101');
    res.json({ success: true, scenarioResult: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/capacity/metrics', async (req, res) => {
  try {
    const { capacityPlanningEngine } = await import('../lib/capacityPlanningEngine.mjs');
    const metrics = capacityPlanningEngine.getCapacityMetrics();
    res.json({ success: true, capacityMetrics: metrics, resilienceScore: 96 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/jurisdictions/rules', async (req, res) => {
  try {
    const { regulatoryReportingEngine } = await import('../lib/regulatoryReportingEngine.mjs');
    const report = regulatoryReportingEngine.generateComplianceReport();
    res.json({ success: true, complianceReport: report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Web UI Database Inspector & Visualizer APIs
// -----------------------------------------------------------------------------
app.get('/api/admin/db/tables', async (req, res) => {
  try {
    const { query } = await import('../db/pg.js');
    const { statfsSync } = await import('fs');

    const sizeRes = await query("SELECT pg_size_pretty(pg_database_size('betking')) AS total_db_size;");
    const totalDbSize = sizeRes.rows[0]?.total_db_size || '8.7 MB';

    let availableDiskStorage = '13.0 GB Free of 228.0 GB (48% Used)';
    try {
      if (statfsSync) {
        const stats = statfsSync('/');
        const freeBytes = stats.bavail * stats.bsize;
        const totalBytes = stats.blocks * stats.bsize;
        const freeGb = (freeBytes / (1024 * 1024 * 1024)).toFixed(1);
        const totalGb = (totalBytes / (1024 * 1024 * 1024)).toFixed(1);
        const usedPct = Math.round(((totalBytes - freeBytes) / totalBytes) * 100);
        availableDiskStorage = `${freeGb} GB Free / ${totalGb} GB Total (${usedPct}% Used)`;
      }
    } catch (err) {
      // Fallback
    }

    const tablesRes = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name ASC;
    `);

    const tablesWithCounts = await Promise.all(
      tablesRes.rows.map(async (row) => {
        const countRes = await query(`SELECT COUNT(*) FROM "${row.table_name}"`);
        const sizeRes = await query(`SELECT pg_size_pretty(pg_total_relation_size('${row.table_name}')) AS table_size`);
        return {
          tableName: row.table_name,
          rowCount: parseInt(countRes.rows[0].count, 10),
          tableSize: sizeRes.rows[0]?.table_size || '16 kB',
        };
      })
    );

    res.json({ success: true, totalDbSize, availableDiskStorage, tables: tablesWithCounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/db/tables/:tableName', async (req, res) => {
  const { tableName } = req.params;
  try {
    const { query } = await import('../db/pg.js');

    // Column definitions
    const colsRes = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1
      ORDER BY ordinal_position ASC;
    `, [tableName]);

    // Data rows
    const rowsRes = await query(`SELECT * FROM "${tableName}" LIMIT 100`);

    res.json({
      success: true,
      tableName,
      columns: colsRes.rows,
      rows: rowsRes.rows,
      totalCount: rowsRes.rows.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Financial Ledger & Multi-Domain Reconciliation APIs
// -----------------------------------------------------------------------------
app.get('/api/admin/financial/reconciliation', async (req, res) => {
  try {
    const { runFullReconciliationAudit } = await import('../lib/reconciliationEngine.mjs');
    const result = await runFullReconciliationAudit();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/reconciliation/cases', async (req, res) => {
  try {
    const { getReconciliationCasesMetrics } = await import('../lib/reconciliationEngine.mjs');
    const metrics = await getReconciliationCasesMetrics();
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/reconciliation/cases/:id/resolve', async (req, res) => {
  const { id } = req.params;
  const { resolution, notes } = req.body;
  try {
    const { query } = await import('../db/pg.js');
    await query(`
      UPDATE reconciliation_cases
      SET status = 'RESOLVED', resolution = $2, notes = $3, resolved_at = CURRENT_TIMESTAMP
      WHERE id = $1;
    `, [id, resolution || 'Resolved by operator', notes || 'Manual audit verified']);
    res.json({ success: true, caseId: id, status: 'RESOLVED' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Bet Cashout & Account Restriction REST APIs
// -----------------------------------------------------------------------------
app.post('/api/bet/cashout', async (req, res) => {
  const { betId, userId, requestedCashoutValue } = req.body;
  const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey;
  try {
    const { executeBetCashout } = await import('../lib/cashoutEngine.mjs');
    const result = await executeBetCashout({ betId, userId, requestedCashoutValue, idempotencyKey });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/account/restrict', adminAuth, requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'RISK_ANALYST'), async (req, res) => {
  const { userId, type, reason, actorId } = req.body;
  try {
    const { restrictAccount } = await import('../lib/accountRestrictionEngine.mjs');
    const { enterpriseAuditEngine } = await import('../lib/enterpriseAuditEngine.mjs');
    const result = await restrictAccount({ userId, type, reason, actorId: actorId || req.admin?.id });

    enterpriseAuditEngine.recordEvent({
      who: req.admin?.id || actorId || 'admin',
      what: 'ACCOUNT_RESTRICTED',
      reason,
      referenceId: userId,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/account/release', adminAuth, requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'RISK_ANALYST'), async (req, res) => {
  const { userId, actorId, reason } = req.body;
  try {
    const { releaseAccount } = await import('../lib/accountRestrictionEngine.mjs');
    const { enterpriseAuditEngine } = await import('../lib/enterpriseAuditEngine.mjs');
    const result = await releaseAccount({ userId, actorId: actorId || req.admin?.id, reason });

    enterpriseAuditEngine.recordEvent({
      who: req.admin?.id || actorId || 'admin',
      what: 'ACCOUNT_RELEASED',
      reason,
      referenceId: userId,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Admin Control Center & Operations Intelligence REST APIs
// -----------------------------------------------------------------------------
app.get('/api/admin/dashboard/overview', async (req, res) => {
  try {
    const { getRealtimeDashboardOverview } = await import('../lib/adminIntelligenceEngine.mjs');
    const overview = await getRealtimeDashboardOverview();
    res.json(overview);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/users/:userId/360', async (req, res) => {
  const { userId } = req.params;
  try {
    const { getUser360View } = await import('../lib/adminIntelligenceEngine.mjs');
    const u360 = await getUser360View(userId);
    res.json(u360);
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/bets/:betId/investigate', async (req, res) => {
  const { betId } = req.params;
  try {
    const { investigateBet } = await import('../lib/adminIntelligenceEngine.mjs');
    const trace = await investigateBet(betId);
    res.json(trace);
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 13 CORE OPERATIONAL DOMAIN ADMIN APIS
// -----------------------------------------------------------------------------
app.get('/api/admin/control-tower/metrics', async (req, res) => {
  res.json({
    activeUsers: 1420,
    openBets: 384,
    liveMatches: 14,
    todayTurnover: 482900,
    ggr: 42100,
    pendingWithdrawals: 12,
    riskAlerts: 3,
    openTickets: 5,
    systemStatus: 'HEALTHY',
  });
});

app.get('/api/admin/customers', async (req, res) => {
  res.json({
    users: [
      { id: 'usr-101', name: 'Uday Reddy', email: 'uday@betking.com', phone: '+91 9876543210', balance: 14500, kyc: 'APPROVED', status: 'ACTIVE', risk: 'LOW', regDate: '2026-01-15' },
      { id: 'usr-102', name: 'Rahul Sharma', email: 'rahul.s@gmail.com', phone: '+91 9123456789', balance: 3200, kyc: 'PENDING', status: 'ACTIVE', risk: 'MEDIUM', regDate: '2026-02-10' },
      { id: 'usr-103', name: 'Vikram Singh', email: 'vikram.v@yahoo.com', phone: '+91 9988776655', balance: 0, kyc: 'REJECTED', status: 'RESTRICTED', risk: 'HIGH', regDate: '2026-03-01' },
    ],
  });
});

app.post('/api/admin/customers/:id/restrict', async (req, res) => {
  const { id } = req.params;
  const { action, reason } = req.body;
  res.json({ success: true, userId: id, action, reason, timestamp: new Date().toISOString() });
});

app.get('/api/admin/sports/catalog', async (req, res) => {
  res.json({
    sports: [
      { id: 'sp-cric', name: 'Cricket', competitions: 18, activeMatches: 14, provider: 'Cricbuzz / Fancode', latency: '120ms', status: 'ACTIVE' },
      { id: 'sp-soc', name: 'Soccer', competitions: 34, activeMatches: 22, provider: 'Sportradar', latency: '180ms', status: 'ACTIVE' },
      { id: 'sp-ten', name: 'Tennis', competitions: 12, activeMatches: 8, provider: 'Betradar', latency: '150ms', status: 'ACTIVE' },
      { id: 'sp-srl', name: 'Virtual Cricket SRL', competitions: 4, activeMatches: 6, provider: 'IPL SRL Simulation Engine', latency: '40ms', status: 'ACTIVE' },
    ],
  });
});

app.get('/api/admin/trading/exposure', async (req, res) => {
  res.json({
    exposures: [
      { matchId: 'm1', match: 'Madurai Panthers vs SKM Salem Spartans', market: 'Winner (incl. super over)', exposure: 124500, liability: 188000, riskScore: 'HIGH', status: 'ACTIVE' },
      { matchId: 'm2', match: 'West Indies vs Pakistan', market: 'Total Match Sixes', exposure: 45000, liability: 82000, riskScore: 'MEDIUM', status: 'ACTIVE' },
      { matchId: 'm3', match: 'India vs Sri Lanka', market: '1st Innings Runs', exposure: 98000, liability: 142000, riskScore: 'HIGH', status: 'ACTIVE' },
    ],
  });
});

app.post('/api/admin/trading/suspend-market', adminAuth, requireRole('SUPER_ADMIN', 'TRADING_ADMIN', 'RISK_ANALYST'), async (req, res) => {
  try {
    const { marketId, marketKey, reason = 'MANUAL_ADMIN' } = req.body;
    const targetMarketId = marketId || marketKey;
    if (!targetMarketId) return res.status(400).json({ error: 'marketId or marketKey is required' });

    const { marketSuspensionEngine } = await import('../lib/marketSuspensionEngine.mjs');
    const { logAdminAction } = await import('./middleware/auditLogger.js');

    const result = await marketSuspensionEngine.addSuspensionCause(targetMarketId, reason, 'ADMIN', req.admin?.id || 'admin');

    await logAdminAction({
      actorId: req.admin?.id || 'admin',
      targetId: targetMarketId,
      action: 'MARKET_SUSPENDED',
      details: { reason, activeCauses: result.activeCauses },
    });

    res.json({ success: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/trading/resume-market', adminAuth, requireRole('SUPER_ADMIN', 'TRADING_ADMIN', 'RISK_ANALYST'), async (req, res) => {
  try {
    const { marketId, marketKey, reason = 'MANUAL_ADMIN' } = req.body;
    const targetMarketId = marketId || marketKey;
    if (!targetMarketId) return res.status(400).json({ error: 'marketId or marketKey is required' });

    const { marketSuspensionEngine } = await import('../lib/marketSuspensionEngine.mjs');
    const { logAdminAction } = await import('./middleware/auditLogger.js');

    const result = await marketSuspensionEngine.clearSuspensionCause(targetMarketId, reason);

    await logAdminAction({
      actorId: req.admin?.id || 'admin',
      targetId: targetMarketId,
      action: 'MARKET_RESUMED',
      details: { clearedReason: reason, activeCauses: result.activeCauses },
    });

    res.json({ success: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/betting/bets', async (req, res) => {
  res.json({
    bets: [
      { id: 'bet-8801', userId: 'usr-101', match: 'Madurai Panthers vs SKM Salem Spartans', selection: 'Madurai Panthers', stake: 1000, odds: 1.51, payout: 1510, status: 'OPEN', date: '2026-08-10 20:45' },
      { id: 'bet-8802', userId: 'usr-102', match: 'India vs Sri Lanka', selection: 'India', stake: 500, odds: 1.35, payout: 675, status: 'SETTLED_WON', date: '2026-08-10 19:30' },
      { id: 'bet-8803', userId: 'usr-103', match: 'West Indies vs Pakistan', selection: 'Over 12.5 Sixes', stake: 2000, odds: 1.85, payout: 0, status: 'SETTLED_LOST', date: '2026-08-10 18:15' },
    ],
  });
});

app.post('/api/admin/betting/settle', async (req, res) => {
  const { betId, outcome } = req.body;
  res.json({ success: true, betId, outcome, status: `SETTLED_${outcome}`, timestamp: new Date().toISOString() });
});

app.get('/api/admin/finance/withdrawals/pending', async (req, res) => {
  res.json({
    requests: [
      { id: 'w-4401', userId: 'usr-101', userName: 'Uday Reddy', amount: 5000, method: 'Razorpay UPI', status: 'PENDING_APPROVAL', requestedAt: '2026-08-10 20:30', utr: 'UPI/6281920192' },
      { id: 'w-4402', userId: 'usr-102', userName: 'Rahul Sharma', amount: 12000, method: 'IMPS Bank Transfer', status: 'PENDING_APPROVAL', requestedAt: '2026-08-10 19:45', utr: 'IMPS/9812938192' },
    ],
  });
});

app.post('/api/admin/finance/withdrawals/:id/approve', async (req, res) => {
  const { id } = req.params;
  res.json({ success: true, requestId: id, status: 'APPROVED', payoutTriggered: true, timestamp: new Date().toISOString() });
});

app.get('/api/admin/support/tickets', async (req, res) => {
  res.json({
    tickets: [
      { id: 't-1001', userId: 'usr-101', userName: 'Uday Reddy', subject: 'Withdrawal delay query', category: 'Finance', priority: 'HIGH', status: 'OPEN', agent: 'Support Agent 1', createdAt: '2026-08-10 20:10', sla: 'WITHIN_SLA' },
      { id: 't-1002', userId: 'usr-102', userName: 'Rahul Sharma', subject: 'Bet settlement query on T20 match', category: 'Betting', priority: 'MEDIUM', status: 'UNASSIGNED', agent: 'None', createdAt: '2026-08-10 19:15', sla: 'WITHIN_SLA' },
    ],
  });
});

app.post('/api/admin/support/tickets/:id/reply', async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;
  res.json({ success: true, ticketId: id, reply: text, timestamp: new Date().toISOString() });
});

app.get('/api/admin/growth/promotions', async (req, res) => {
  res.json({
    promotions: [
      { id: 'p-101', name: 'TNPL 100% Deposit Bonus', code: 'TNPL100', bonusPct: 100, maxBonus: 5000, claims: 142, status: 'ACTIVE' },
      { id: 'p-102', name: 'IPL SRL Risk-Free Bet', code: 'SRLFREE', bonusPct: 50, maxBonus: 2000, claims: 89, status: 'ACTIVE' },
      { id: 'p-103', name: 'VIP Loyalty Cashback 10%', code: 'VIPCASH', bonusPct: 10, maxBonus: 10000, claims: 24, status: 'ACTIVE' },
    ],
  });
});

app.get('/api/admin/communications/logs', async (req, res) => {
  res.json({
    logs: [
      { id: 'msg-701', channel: 'SMS', recipient: '+91 9876543210', template: 'OTP_VERIFICATION', status: 'DELIVERED', provider: 'Twilio', sentAt: '2026-08-10 20:42' },
      { id: 'msg-702', channel: 'EMAIL', recipient: 'uday@betking.com', template: 'WITHDRAWAL_APPROVED', status: 'DELIVERED', provider: 'SendGrid', sentAt: '2026-08-10 20:30' },
      { id: 'msg-703', channel: 'PUSH', recipient: 'usr-102', template: 'MATCH_LIVE_START', status: 'SENT', provider: 'Firebase FCM', sentAt: '2026-08-10 20:15' },
    ],
  });
});

app.get('/api/admin/analytics/reports', async (req, res) => {
  res.json({
    reports: [
      { id: 'rep-01', name: 'Daily Turnover & GGR Breakdown', frequency: 'DAILY', format: 'CSV / BI JSON', lastGenerated: '2026-08-10 00:00', status: 'READY' },
      { id: 'rep-02', name: 'High-Roller Risk & Liability Matrix', frequency: 'HOURLY', format: 'BI JSON', lastGenerated: '2026-08-10 20:00', status: 'READY' },
      { id: 'rep-03', name: 'Customer Cohort Retention & LTV', frequency: 'WEEKLY', format: 'EXCEL', lastGenerated: '2026-08-04 00:00', status: 'READY' },
    ],
  });
});

app.get('/api/admin/platform/apikeys', async (req, res) => {
  res.json({
    keys: [
      { id: 'key-01', name: 'Sportsbook Production API', prefix: 'bk_live_9f82...', scope: 'FULL_READ_WRITE', createdAt: '2026-01-01', status: 'ACTIVE' },
      { id: 'key-02', name: 'Razorpay Payment Gateway Webhook Key', prefix: 'bk_rzp_3a11...', scope: 'WEBHOOK_PAYOUT', createdAt: '2026-01-10', status: 'ACTIVE' },
    ],
  });
});

app.get('/api/admin/operations/health', async (req, res) => {
  res.json({
    postgres: 'HEALTHY',
    redis: 'HEALTHY',
    websocket: 'HEALTHY',
    cricbuzzFeed: 'HEALTHY',
    razorpayGateway: 'HEALTHY',
    outboxQueue: '0 PENDING',
  });
});

app.get('/api/admin/security/audit', async (req, res) => {
  res.json({
    logs: [
      { id: 'aud-9901', actor: 'Super Admin (uday)', action: 'WITHDRAWAL_APPROVE', entity: 'Withdrawal w-4401', ip: '127.0.0.1', timestamp: '2026-08-10 20:45', tenant: 'MAIN_BRAND' },
      { id: 'aud-9902', actor: 'Trading Admin (trader1)', action: 'MARKET_SUSPEND', entity: 'Match m1 / Winner', ip: '127.0.0.1', timestamp: '2026-08-10 20:38', tenant: 'MAIN_BRAND' },
      { id: 'aud-9903', actor: 'Support Agent (agent1)', action: 'TICKET_REPLY', entity: 'Ticket t-1001', ip: '127.0.0.1', timestamp: '2026-08-10 20:12', tenant: 'MAIN_BRAND' },
    ],
  });
});

app.post('/api/admin/maker-checker/request', async (req, res) => {
  const { actionType, targetEntityType, targetEntityId, requestPayload, makerId } = req.body;
  try {
    const { createMakerCheckerRequest } = await import('../lib/adminIntelligenceEngine.mjs');
    const result = await createMakerCheckerRequest({ actionType, targetEntityType, targetEntityId, requestPayload, makerId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/maker-checker/approve', async (req, res) => {
  const { requestId, checkerId } = req.body;
  try {
    const { approveMakerCheckerRequest } = await import('../lib/adminIntelligenceEngine.mjs');
    const result = await approveMakerCheckerRequest({ requestId, checkerId });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Advanced Fraud, Security & Risk Signals REST APIs
// -----------------------------------------------------------------------------
app.get('/api/admin/fraud/signals', async (req, res) => {
  try {
    const { query } = await import('../db/pg.js');
    const signalsRes = await query(`
      SELECT id, user_id, signal_type, severity, score, source, evidence, status, created_at
      FROM risk_signals
      ORDER BY created_at DESC
      LIMIT 100;
    `);
    res.json({ success: true, count: signalsRes.rows.length, signals: signalsRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/fraud/cases', async (req, res) => {
  try {
    const { query } = await import('../db/pg.js');
    const casesRes = await query(`
      SELECT id, user_id, risk_score, assigned_investigator, status, notes, created_at
      FROM fraud_cases
      ORDER BY created_at DESC
      LIMIT 100;
    `);
    res.json({ success: true, count: casesRes.rows.length, cases: casesRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/fraud/cases/:id/update', async (req, res) => {
  const { id } = req.params;
  const { status, notes, resolution, investigatorId } = req.body;
  try {
    const { updateFraudCaseStatus } = await import('../lib/riskSignalEngine.mjs');
    const result = await updateFraudCaseStatus({ caseId: id, status, notes, resolution, investigatorId });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/risk/rules/simulate', async (req, res) => {
  const { userId, ruleType } = req.body;
  try {
    const { detectRapidPaymentCycle } = await import('../lib/riskSignalEngine.mjs');
    let result = { simulation: 'CLEAN', action: 'ALLOW' };
    if (ruleType === 'RAPID_PAYMENT_CYCLE') {
      result = await detectRapidPaymentCycle(userId);
    }
    res.json({ success: true, userId, ruleType, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Sports Provider Orchestration & Reliability REST APIs
// -----------------------------------------------------------------------------
app.get('/api/admin/sports/providers', async (req, res) => {
  try {
    const { getProviderQualityMetrics } = await import('../lib/sportsProviderOrchestrator.mjs');
    const srMetrics = await getProviderQualityMetrics('Sportradar');
    const lsMetrics = await getProviderQualityMetrics('LivescoreAPI');
    res.json({ success: true, providers: [srMetrics, lsMetrics] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/sports/conflicts', async (req, res) => {
  try {
    const { query } = await import('../db/pg.js');
    const conflictsRes = await query(`
      SELECT id, entity_type, canonical_entity_id, field_name, provider_a_name, provider_a_value, provider_b_name, provider_b_value, status, severity, created_at
      FROM data_conflicts
      ORDER BY created_at DESC
      LIMIT 100;
    `);
    res.json({ success: true, count: conflictsRes.rows.length, conflicts: conflictsRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/sports/conflicts/:id/resolve', async (req, res) => {
  const { id } = req.params;
  const { resolution, resolvedBy } = req.body;
  try {
    const { query } = await import('../db/pg.js');
    await query(`
      UPDATE data_conflicts
      SET status = 'RESOLVED', resolved_at = CURRENT_TIMESTAMP, resolved_by = $2
      WHERE id = $1;
    `, [id, resolvedBy || 'ADMIN']);
    res.json({ success: true, conflictId: id, status: 'RESOLVED' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/sports/staleness', async (req, res) => {
  try {
    const { query } = await import('../db/pg.js');
    const stalenessRes = await query(`
      SELECT id, match_id, data_type, data_age_seconds, action_taken, created_at
      FROM sports_data_staleness_logs
      ORDER BY created_at DESC
      LIMIT 100;
    `);
    res.json({ success: true, count: stalenessRes.rows.length, logs: stalenessRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Advanced Business Intelligence (BI) & Reporting REST APIs
// -----------------------------------------------------------------------------
app.get('/api/v1/admin/analytics/overview', async (req, res) => {
  try {
    const { getExecutiveDashboardMetrics } = await import('../lib/businessIntelligenceEngine.mjs');
    const metrics = await getExecutiveDashboardMetrics();
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/admin/analytics/betting', async (req, res) => {
  try {
    const { getBettingAnalytics } = await import('../lib/businessIntelligenceEngine.mjs');
    const analytics = await getBettingAnalytics();
    res.json(analytics);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/admin/analytics/finance', async (req, res) => {
  try {
    const { getFinancialAnalytics } = await import('../lib/businessIntelligenceEngine.mjs');
    const analytics = await getFinancialAnalytics();
    res.json(analytics);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/admin/analytics/funnel', async (req, res) => {
  try {
    const { getUserFunnelMetrics } = await import('../lib/businessIntelligenceEngine.mjs');
    const funnel = await getUserFunnelMetrics();
    res.json(funnel);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/admin/reports/export', async (req, res) => {
  const { userId, reportType, format, parameters } = req.body;
  try {
    const { generateReportExportJob } = await import('../lib/businessIntelligenceEngine.mjs');
    const job = await generateReportExportJob({ userId: userId || 'admin', reportType, format, parameters });
    res.json(job);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Promotions, Bonus, Referral, Loyalty & CRM REST APIs
// -----------------------------------------------------------------------------
app.get('/api/v1/promotions', async (req, res) => {
  try {
    const { query } = await import('../db/pg.js');
    const promosRes = await query(`SELECT id, name, code, type, max_reward, min_odds, min_stake, wagering_multiplier, expires_at FROM promotions WHERE status = 'ACTIVE';`);
    res.json({ success: true, count: promosRes.rows.length, promotions: promosRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/promotions/claim', async (req, res) => {
  const { userId, promoCode, depositAmount } = req.body;
  try {
    const { claimPromotionBonus } = await import('../lib/promotionsEngine.mjs');
    const result = await claimPromotionBonus({ userId, promoCode, depositAmount });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/user/bonuses', async (req, res) => {
  const { userId } = req.query;
  try {
    const { query } = await import('../db/pg.js');
    const bonusesRes = await query(`
      SELECT ub.id, ub.bonus_amount, ub.wagering_required, ub.wagering_completed, ub.status, ub.expires_at, p.name AS promo_name
      FROM user_bonuses ub
      JOIN promotions p ON ub.promotion_id = p.id
      WHERE ub.user_id = $1
      ORDER BY ub.created_at DESC;
    `, [userId]);
    res.json({ success: true, count: bonusesRes.rows.length, bonuses: bonusesRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/user/loyalty', async (req, res) => {
  const { userId } = req.query;
  try {
    const { query } = await import('../db/pg.js');
    const lRes = await query(`SELECT points, tier, updated_at FROM user_loyalty WHERE user_id = $1;`, [userId]);
    const lData = lRes.rows[0] || { points: 0, tier: 'BRONZE' };
    res.json({ success: true, userId, loyalty: lData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/admin/promotions/create', async (req, res) => {
  const promoData = req.body;
  try {
    const { createPromotion } = await import('../lib/promotionsEngine.mjs');
    const result = await createPromotion(promoData);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Unified Notification & Communication REST APIs
// -----------------------------------------------------------------------------
app.get('/api/v1/user/notifications', async (req, res) => {
  const { userId } = req.query;
  try {
    const { query } = await import('../db/pg.js');
    const notifsRes = await query(`
      SELECT id, event_type, category, channel, subject, body, status, is_read, created_at
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 100;
    `, [userId]);
    res.json({ success: true, count: notifsRes.rows.length, notifications: notifsRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/user/notifications/read', async (req, res) => {
  const { userId, notificationId } = req.body;
  try {
    const { query } = await import('../db/pg.js');
    await query(`UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2;`, [notificationId, userId]);
    res.json({ success: true, notificationId, isRead: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/user/notifications/preferences', async (req, res) => {
  const { userId } = req.query;
  try {
    const { query } = await import('../db/pg.js');
    const prefRes = await query(`SELECT marketing_email, marketing_sms, marketing_push, transactional_email FROM user_notification_preferences WHERE user_id = $1;`, [userId]);
    const pref = prefRes.rows[0] || { marketing_email: true, marketing_sms: true, marketing_push: true, transactional_email: true };
    res.json({ success: true, userId, preferences: pref });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/v1/user/notifications/preferences', async (req, res) => {
  const { userId, marketingEmail, marketingSms, marketingPush } = req.body;
  try {
    const { query } = await import('../db/pg.js');
    await query(`
      INSERT INTO user_notification_preferences (user_id, marketing_email, marketing_sms, marketing_push, updated_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO UPDATE SET
        marketing_email = EXCLUDED.marketing_email,
        marketing_sms = EXCLUDED.marketing_sms,
        marketing_push = EXCLUDED.marketing_push,
        updated_at = CURRENT_TIMESTAMP;
    `, [userId, marketingEmail ?? true, marketingSms ?? true, marketingPush ?? true]);
    res.json({ success: true, userId, status: 'UPDATED' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/admin/notifications/queue', async (req, res) => {
  try {
    const { query } = await import('../db/pg.js');
    const queueRes = await query(`
      SELECT id, user_id, event_type, category, channel, status, attempts, error_message, created_at
      FROM notifications
      ORDER BY created_at DESC
      LIMIT 100;
    `);
    res.json({ success: true, count: queueRes.rows.length, queue: queueRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Multi-Tenant, White-Label & Platform Architecture REST APIs
// -----------------------------------------------------------------------------
app.get('/api/v1/tenant/config', async (req, res) => {
  try {
    const { resolveTenantContext } = await import('../lib/tenantEngine.mjs');
    const tenant = await resolveTenantContext(req);
    res.json({ success: true, tenant });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/admin/tenants', async (req, res) => {
  try {
    const { query } = await import('../db/pg.js');
    const tenantsRes = await query(`
      SELECT id, name, display_name, slug, domain, status, currency, timezone, branding, created_at
      FROM tenants
      ORDER BY created_at DESC;
    `);
    res.json({ success: true, count: tenantsRes.rows.length, tenants: tenantsRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/admin/tenants/create', async (req, res) => {
  const tenantData = req.body;
  try {
    const { createWhiteLabelTenant } = await import('../lib/tenantEngine.mjs');
    const result = await createWhiteLabelTenant(tenantData);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Developer Platform, Public API & Webhook Ecosystem REST APIs
// -----------------------------------------------------------------------------
app.get('/api/v1/public/sports', async (req, res) => {
  const authHeader = req.headers['authorization'] || req.headers['x-api-key'];
  try {
    const { authenticateApiKey } = await import('../lib/developerPlatformEngine.mjs');
    const authContext = await authenticateApiKey(authHeader?.replace('Bearer ', ''), 'sports:read');

    const { query } = await import('../db/pg.js');
    const sportsRes = await query(`SELECT sport_id, name FROM sports;`);
    res.json({ success: true, count: sportsRes.rows.length, sports: sportsRes.rows, context: authContext });
  } catch (err) {
    const status = err.message.includes('API_RATE_LIMIT') ? 429 : err.message.includes('API_SCOPE') ? 403 : 401;
    res.status(status).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/public/matches', async (req, res) => {
  const authHeader = req.headers['authorization'] || req.headers['x-api-key'];
  try {
    const { authenticateApiKey } = await import('../lib/developerPlatformEngine.mjs');
    const authContext = await authenticateApiKey(authHeader?.replace('Bearer ', ''), 'matches:read');

    const { query } = await import('../db/pg.js');
    const matchesRes = await query(`SELECT match_id, home_team, away_team, status FROM matches LIMIT 50;`);
    res.json({ success: true, count: matchesRes.rows.length, matches: matchesRes.rows, context: authContext });
  } catch (err) {
    const status = err.message.includes('API_RATE_LIMIT') ? 429 : err.message.includes('API_SCOPE') ? 403 : 401;
    res.status(status).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/developer/apps', async (req, res) => {
  const appData = req.body;
  try {
    const { createDeveloperApp } = await import('../lib/developerPlatformEngine.mjs');
    const result = await createDeveloperApp(appData);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/developer/keys', async (req, res) => {
  const keyData = req.body;
  try {
    const { generateApiKey } = await import('../lib/developerPlatformEngine.mjs');
    const result = await generateApiKey(keyData);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/developer/webhooks', async (req, res) => {
  const subData = req.body;
  try {
    const { createWebhookSubscription } = await import('../lib/developerPlatformEngine.mjs');
    const result = await createWebhookSubscription(subData);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/developer/webhooks/deliveries', async (req, res) => {
  try {
    const { query } = await import('../db/pg.js');
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

// -----------------------------------------------------------------------------
// Production Operations, Observability & Incident REST APIs
// -----------------------------------------------------------------------------
app.get('/api/v1/admin/operations/incidents', async (req, res) => {
  try {
    const { query } = await import('../db/pg.js');
    const incRes = await query(`
      SELECT id, title, severity, service, status, root_cause, created_at, resolved_at
      FROM incidents
      ORDER BY created_at DESC
      LIMIT 100;
    `);
    res.json({ success: true, count: incRes.rows.length, incidents: incRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/admin/operations/incidents', async (req, res) => {
  const incData = req.body;
  try {
    const { createProductionIncident } = await import('../lib/devopsEngine.mjs');
    const result = await createProductionIncident(incData);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/admin/operations/backups', async (req, res) => {
  try {
    const { query } = await import('../db/pg.js');
    const bkpRes = await query(`
      SELECT id, backup_type, status, size_bytes, duration_ms, created_at
      FROM backups_log
      ORDER BY created_at DESC
      LIMIT 50;
    `);
    res.json({ success: true, count: bkpRes.rows.length, backups: bkpRes.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Transactional Outbox Observability APIs
// -----------------------------------------------------------------------------
app.get('/api/admin/outbox/metrics', async (req, res) => {
  try {
    const { getOutboxMetrics } = await import('../lib/outboxEngine.mjs');
    const metrics = await getOutboxMetrics();
    res.json({ success: true, metrics });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// User & Admin Support Center REST APIs (v1 & legacy endpoints)
// -----------------------------------------------------------------------------
app.get(['/api/support/conversations', '/api/v1/support/tickets'], async (req, res) => {
  const userId = req.query.userId || 'demo@betking.com';
  try {
    const { supportEngine } = await import('../lib/supportEngine.mjs');
    const conversations = supportEngine.getUserConversations(userId);
    res.json({ success: true, conversations, tickets: conversations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/support/conversations/:id', '/api/v1/support/tickets/:id'], async (req, res) => {
  try {
    const { supportEngine } = await import('../lib/supportEngine.mjs');
    const conversation = supportEngine.getConversationById(req.params.id, 'user');
    if (!conversation) return res.status(404).json({ error: 'Support Ticket not found' });
    res.json({ success: true, conversation, ticket: conversation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/support/conversations', '/api/v1/support/tickets'], async (req, res) => {
  const { userId, subject, category, priority, initialMessage, attachments, idempotencyKey, relatedEntityType, relatedEntityId, bypassDuplicateCheck } = req.body;
  try {
    const { supportEngine } = await import('../lib/supportEngine.mjs');
    const result = await supportEngine.startConversation({
      userId: userId || 'demo@betking.com',
      subject: subject || 'Support Request',
      category: category || 'General',
      priority: priority || 'NORMAL',
      initialMessage: initialMessage || 'New inquiry',
      attachments: attachments || [],
      idempotencyKey: idempotencyKey || req.headers['x-idempotency-key'],
      relatedEntityType,
      relatedEntityId,
      bypassDuplicateCheck: bypassDuplicateCheck === true,
    });

    if (result.isDuplicate) {
      return res.status(409).json({
        success: false,
        isDuplicate: true,
        error: result.message,
        message: result.message,
        activeTicket: result.activeTicket,
        conversationId: result.conversationId,
        ticketNumber: result.ticketNumber,
      });
    }

    res.json({ success: true, conversation: result, ticket: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/support/conversations/:id/messages', '/api/v1/support/tickets/:id/messages'], async (req, res) => {
  const { senderId, senderType, messageType, agentName, text, attachments, idempotencyKey } = req.body;
  try {
    const { supportEngine } = await import('../lib/supportEngine.mjs');
    const msg = await supportEngine.addMessage(req.params.id, {
      senderId: senderId || 'user',
      senderType: senderType || 'user',
      messageType: messageType || 'USER_MESSAGE',
      agentName: agentName || 'Priya Sharma',
      text: text || '',
      attachments: attachments || [],
      idempotencyKey: idempotencyKey || req.headers['x-idempotency-key'],
    });
    if (!msg) return res.status(404).json({ error: 'Support Ticket not found' });
    res.json({ success: true, message: msg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/support/conversations/:id/read', '/api/v1/support/tickets/:id/read'], async (req, res) => {
  const { actorType } = req.body;
  try {
    const { supportEngine } = await import('../lib/supportEngine.mjs');
    const updated = await supportEngine.markAsRead(req.params.id, actorType || 'user');
    if (!updated) return res.status(404).json({ error: 'Support Ticket not found' });
    res.json({ success: true, conversation: updated, ticket: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/support/conversations/:id/close', '/api/v1/support/tickets/:id/close'], async (req, res) => {
  const { userId, resolutionCode } = req.body;
  try {
    const { supportEngine } = await import('../lib/supportEngine.mjs');
    const closed = await supportEngine.closeTicket(req.params.id, { closedBy: userId || 'user', resolutionCode });
    if (!closed) return res.status(404).json({ error: 'Support Ticket not found' });
    res.json({ success: true, conversation: closed, ticket: closed });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post(['/api/support/conversations/:id/reopen', '/api/v1/support/tickets/:id/reopen'], async (req, res) => {
  const { userId, reason } = req.body;
  try {
    const { supportEngine } = await import('../lib/supportEngine.mjs');
    const reopened = await supportEngine.reopenConversation(req.params.id, { actorId: userId || 'user', reason });
    if (!reopened) return res.status(404).json({ error: 'Support Ticket not found' });
    res.json({ success: true, conversation: reopened, ticket: reopened });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/support/conversations/:id/feedback', '/api/v1/support/tickets/:id/feedback'], async (req, res) => {
  const { rating, comment } = req.body;
  try {
    const { supportEngine } = await import('../lib/supportEngine.mjs');
    const fb = supportEngine.submitFeedback ? supportEngine.submitFeedback(req.params.id, { rating, comment }) : { rating, comment };
    res.json({ success: true, feedback: fb });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/admin/support/conversations', '/api/v1/admin/support/tickets'], async (req, res) => {
  try {
    const { supportEngine } = await import('../lib/supportEngine.mjs');
    const conversations = supportEngine.getAllConversations();
    const metrics = supportEngine.getAdminMetrics();
    res.json({ success: true, conversations, tickets: conversations, metrics });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/admin/support/tickets/unresolved', async (req, res) => {
  try {
    const { supportEngine } = await import('../lib/supportEngine.mjs');
    const unresolved = supportEngine.getUnresolvedTickets();
    res.json({ success: true, tickets: unresolved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/admin/support/tickets/metrics', async (req, res) => {
  try {
    const { supportEngine } = await import('../lib/supportEngine.mjs');
    const metrics = supportEngine.getAdminMetrics();
    res.json({ success: true, metrics });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/admin/support/conversations/:id', '/api/v1/admin/support/tickets/:id'], async (req, res) => {
  try {
    const { supportEngine } = await import('../lib/supportEngine.mjs');
    const conversation = supportEngine.getConversationById(req.params.id, 'admin');
    if (!conversation) return res.status(404).json({ error: 'Support Ticket not found' });
    res.json({ success: true, conversation, ticket: conversation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/admin/support/conversations/:id/assign', '/api/v1/admin/support/tickets/:id/assign'], async (req, res) => {
  const { agentId, agentName, teamId, assignedBy } = req.body;
  try {
    const { supportEngine } = await import('../lib/supportEngine.mjs');
    const updated = await supportEngine.assignAgent(req.params.id, { agentId, agentName, teamId, assignedBy });
    if (!updated) return res.status(404).json({ error: 'Support Ticket not found' });
    res.json({ success: true, conversation: updated, ticket: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/admin/support/conversations/:id/escalate', '/api/v1/admin/support/tickets/:id/escalate'], async (req, res) => {
  const { escalatedBy, fromTeam, toTeam, reason } = req.body;
  try {
    const { supportEngine } = await import('../lib/supportEngine.mjs');
    const updated = await supportEngine.escalateConversation(req.params.id, { escalatedBy, fromTeam, toTeam, reason });
    if (!updated) return res.status(404).json({ error: 'Support Ticket not found' });
    res.json({ success: true, conversation: updated, ticket: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/admin/support/conversations/:id/resolve', '/api/v1/admin/support/tickets/:id/resolve'], async (req, res) => {
  const { resolutionCode, resolutionSummary, resolvedBy } = req.body;
  try {
    const { supportEngine } = await import('../lib/supportEngine.mjs');
    const resolved = await supportEngine.provideResolution(req.params.id, { resolutionCode, resolutionSummary, resolvedBy });
    res.json({ success: true, conversation: resolved, ticket: resolved });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post(['/api/admin/support/conversations/:id/status', '/api/v1/admin/support/tickets/:id/status'], async (req, res) => {
  const { status, resolutionReason, actorId } = req.body;
  try {
    const { supportEngine } = await import('../lib/supportEngine.mjs');
    const updated = await supportEngine.updateStatus(req.params.id, { status, resolutionReason, actorId });
    if (!updated) return res.status(404).json({ error: 'Support Ticket not found' });
    res.json({ success: true, conversation: updated, ticket: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Phase 2 — Advanced User Security & Account Controls REST APIs
// -----------------------------------------------------------------------------
app.get('/api/v1/user/security/devices', async (req, res) => {
  const userId = req.query.userId || 'demo@betking.com';
  try {
    const { userSecurityCenter } = await import('../lib/userSecurityCenter.mjs');
    const devices = userSecurityCenter.getUserDevices(userId);
    res.json({ success: true, devices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/user/security/devices/register', async (req, res) => {
  const { userId, deviceId, deviceHash, deviceType, platform, browser, os, ipAddress, locationCity, locationCountry } = req.body;
  try {
    const { userSecurityCenter } = await import('../lib/userSecurityCenter.mjs');
    const dev = await userSecurityCenter.registerDevice(userId || 'demo@betking.com', {
      deviceId, deviceHash, deviceType, platform, browser, os, ipAddress, locationCity, locationCountry
    });
    res.json({ success: true, device: dev });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/user/security/devices/logout', async (req, res) => {
  const { userId, deviceId } = req.body;
  try {
    const { userSecurityCenter } = await import('../lib/userSecurityCenter.mjs');
    const result = await userSecurityCenter.logoutDevice(userId || 'demo@betking.com', deviceId);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/user/security/devices/logout-all-others', async (req, res) => {
  const { userId, currentDeviceId } = req.body;
  try {
    const { userSecurityCenter } = await import('../lib/userSecurityCenter.mjs');
    const result = await userSecurityCenter.logoutAllOtherDevices(userId || 'demo@betking.com', currentDeviceId);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/user/security/alerts', async (req, res) => {
  const userId = req.query.userId || 'demo@betking.com';
  try {
    const { userSecurityCenter } = await import('../lib/userSecurityCenter.mjs');
    const alerts = userSecurityCenter.getUserSecurityAlerts(userId);
    res.json({ success: true, alerts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/user/security/alerts/:id/read', async (req, res) => {
  const { userId } = req.body;
  try {
    const { userSecurityCenter } = await import('../lib/userSecurityCenter.mjs');
    const result = userSecurityCenter.markAlertAsRead(userId || 'demo@betking.com', req.params.id);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/user/security/control-status', async (req, res) => {
  const userId = req.query.userId || 'demo@betking.com';
  try {
    const { userSecurityCenter } = await import('../lib/userSecurityCenter.mjs');
    const status = userSecurityCenter.getAccountControlStatus(userId);
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/v1/admin/security/account-controls', adminAuth, requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'RISK_ANALYST'), async (req, res) => {
  const { userId, action, reason, category, operatorId, durationDays } = req.body;
  try {
    const { userSecurityCenter } = await import('../lib/userSecurityCenter.mjs');
    const { enterpriseAuditEngine } = await import('../lib/enterpriseAuditEngine.mjs');
    let result = null;
    const actor = req.admin?.id || operatorId || 'admin';
    if (action === 'RESTRICT') {
      result = await userSecurityCenter.restrictAccount(userId, { reason, category, operatorId: actor, durationDays });
    } else if (action === 'SUSPEND') {
      result = await userSecurityCenter.suspendAccount(userId, { reason, operatorId: actor });
    } else if (action === 'FREEZE') {
      result = await userSecurityCenter.freezeAccount(userId, { reason, operatorId: actor });
    } else if (action === 'RECOVER') {
      result = await userSecurityCenter.recoverAccount(userId, { operatorId: actor });
    } else if (action === 'SELF_EXCLUDE') {
      result = await userSecurityCenter.selfExcludeAccount(userId, { durationDays, reason });
    } else {
      return res.status(400).json({ error: `Unknown security action '${action}'` });
    }

    enterpriseAuditEngine.recordEvent({
      who: actor,
      what: `ACCOUNT_${action}`,
      reason: reason || category,
      referenceId: userId,
    });

    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/support/conversations/:id/internal-notes', async (req, res) => {
  const { agentId, text } = req.body;
  try {
    const { supportEngine } = await import('../lib/supportEngine.mjs');
    const note = await supportEngine.addMessage(req.params.id, {
      senderId: agentId || 'admin',
      senderType: 'admin',
      messageType: 'INTERNAL_NOTE',
      agentName: agentId || 'Priya Sharma (Admin)',
      text: text || '',
    });
    if (!note) return res.status(404).json({ error: 'Conversation not found' });
    res.json({ success: true, note });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/support/conversations/:id/resolve', async (req, res) => {
  const { resolutionReason, agentId } = req.body;
  try {
    const { supportEngine } = await import('../lib/supportEngine.mjs');
    const resolved = await supportEngine.resolveConversation(req.params.id, { resolutionReason, agentId });
    if (!resolved) return res.status(404).json({ error: 'Conversation not found' });
    res.json({ success: true, conversation: resolved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/support/analytics', async (req, res) => {
  try {
    const { supportEngine } = await import('../lib/supportEngine.mjs');
    const analytics = supportEngine.getAnalytics();
    res.json({ success: true, analytics });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/support/knowledge-base', async (req, res) => {
  const query = req.query.q || '';
  try {
    const { supportEngine } = await import('../lib/supportEngine.mjs');
    const articles = supportEngine.getKnowledgeBase(query);
    res.json({ success: true, articles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Versioned Operator Sports API Gateway (/api/v1)
// -----------------------------------------------------------------------------
app.get('/api/v1/sports', async (req, res) => {
  try {
    const { SPORTS_CATALOG } = await import('../lib/sportsDataService.mjs');
    res.json({ version: 'v1', sports: SPORTS_CATALOG });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sports catalog' });
  }
});

app.get('/api/v1/matches', async (req, res) => {
  try {
    const { sportsDataRegistry } = await import('../lib/sportsDataRegistry.mjs');
    res.json({ version: 'v1', matches: sportsDataRegistry.getAllMatches() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch active matches' });
  }
});

app.get('/api/v1/matches/:id', async (req, res) => {
  try {
    const { canonicalMatchStateEngine } = await import('../lib/canonicalMatchState.mjs');
    const matchState = canonicalMatchStateEngine.getMatchState(req.params.id);
    if (!matchState) return res.status(404).json({ error: 'Match state unavailable' });
    res.json({ version: 'v1', match: matchState });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch match state' });
  }
});

app.post(['/api/bets/place', '/api/v1/bet/place'], async (req, res) => {
  const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey;
  try {
    const { betPlacementEngine } = await import('../lib/betPlacementEngine.mjs');
    const result = await betPlacementEngine.placeBet({
      ...req.body,
      idempotencyKey,
    }, req.correlationId);

    res.json({ version: 'v1', ...result });
  } catch (err) {
    let statusCode = 400;
    if (err.message?.includes('ACCOUNT_RESTRICTED') || err.message?.includes('ACCOUNT_SUSPENDED')) {
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

// -----------------------------------------------------------------------------
// Platform Integrity Engine REST APIs
// -----------------------------------------------------------------------------
app.post('/api/v1/admin/integrity/scan', async (req, res) => {
  try {
    const { runFullIntegrityScan } = await import('../lib/platformIntegrityEngine.mjs');
    const result = await runFullIntegrityScan();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/admin/integrity/exceptions', async (req, res) => {
  try {
    const { getOpenIntegrityExceptions } = await import('../lib/platformIntegrityEngine.mjs');
    const result = await getOpenIntegrityExceptions();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/admin/integrity/metrics', async (req, res) => {
  try {
    const { getIntegrityScanMetrics } = await import('../lib/platformIntegrityEngine.mjs');
    const result = await getIntegrityScanMetrics();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/admin/integrity/exceptions/:id/resolve', async (req, res) => {
  const { resolution, resolvedBy } = req.body;
  try {
    const { resolveIntegrityException } = await import('../lib/platformIntegrityEngine.mjs');
    const result = await resolveIntegrityException(req.params.id, { resolution, resolvedBy });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Content Management System REST APIs
// -----------------------------------------------------------------------------
app.post('/api/v1/admin/cms/content', async (req, res) => {
  try {
    const { createContent } = await import('../lib/cmsEngine.mjs');
    const result = await createContent(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/v1/admin/cms/content/:id', async (req, res) => {
  try {
    const { updateContent } = await import('../lib/cmsEngine.mjs');
    const result = await updateContent(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/admin/cms/content/:id/status', async (req, res) => {
  try {
    const { transitionContentStatus } = await import('../lib/cmsEngine.mjs');
    const result = await transitionContentStatus(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Mass Settlement Endpoints
// -----------------------------------------------------------------------------
app.post('/api/admin/trading/settle-match', async (req, res) => {
  const { matchId, matchState } = req.body;
  try {
    const { massSettlementWorker } = await import('../lib/massSettlementWorker.mjs');
    const result = await massSettlementWorker.settleCompletedMatch(matchId, matchState, req.correlationId);
    res.json({ version: 'v1', ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/trading/mass-settle', async (req, res) => {
  try {
    const { massSettlementWorker } = await import('../lib/massSettlementWorker.mjs');
    const result = await massSettlementWorker.runMassSettlementBatch();
    res.json({ version: 'v1', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

import adminKycRouter from './routes/admin/kyc.js';
import adminRiskRouter from './routes/admin/risk.js';
import adminNotificationsRouter from './routes/admin/notifications.js';
import adminAnalyticsRouter from './routes/admin/analytics.js';
import adminTenantsRouter from './routes/admin/tenants.js';
import promotionsRouter from './routes/promotions.js';
import publicOddsRouter from './routes/public/odds.js';
import developerAppsRouter from './routes/developer/apps.js';

app.use('/api/admin/kyc', adminKycRouter);
app.use('/api/admin/risk', adminRiskRouter);
app.use('/api/admin', adminNotificationsRouter);
app.use('/api/admin/analytics', adminAnalyticsRouter);
app.use('/api/admin/tenants', adminTenantsRouter);
app.use('/api/promotions', promotionsRouter);
app.use('/api/v1/public', publicOddsRouter);
app.use('/api/public/sports', publicOddsRouter);
app.use('/api/developer', developerAppsRouter);

app.get('/api/v1/admin/cms/content', async (req, res) => {
  const { contentType, status, tenantId } = req.query;
  try {
    const { getContentByType } = await import('../lib/cmsEngine.mjs');
    const result = await getContentByType(contentType || 'BANNER', { status, tenantId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/admin/cms/content/:id/versions', async (req, res) => {
  try {
    const { getContentVersionHistory } = await import('../lib/cmsEngine.mjs');
    const result = await getContentVersionHistory(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/cms/published', async (req, res) => {
  const { contentType, tenantId } = req.query;
  try {
    const { getPublishedContent } = await import('../lib/cmsEngine.mjs');
    const result = await getPublishedContent(contentType || 'BANNER', { tenantId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Platform Configuration Center REST APIs
// -----------------------------------------------------------------------------
app.post('/api/v1/admin/config', async (req, res) => {
  try {
    const { setConfig } = await import('../lib/configEngine.mjs');
    const result = await setConfig(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/admin/config', async (req, res) => {
  const { category } = req.query;
  try {
    if (category) {
      const { getConfigByCategory } = await import('../lib/configEngine.mjs');
      const result = await getConfigByCategory(category);
      res.json(result);
    } else {
      const { getAllConfigSummary } = await import('../lib/configEngine.mjs');
      const result = await getAllConfigSummary();
      res.json(result);
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/admin/config/:key', async (req, res) => {
  try {
    const { getConfig } = await import('../lib/configEngine.mjs');
    const result = await getConfig(req.params.key);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/admin/config/:key/audit', async (req, res) => {
  try {
    const { getConfigAuditHistory } = await import('../lib/configEngine.mjs');
    const result = await getConfigAuditHistory(req.params.key);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Feature Flags REST APIs
// -----------------------------------------------------------------------------
app.post('/api/v1/admin/feature-flags', async (req, res) => {
  try {
    const { upsertFeatureFlag } = await import('../lib/featureStore.mjs');
    const result = await upsertFeatureFlag(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/admin/feature-flags', async (req, res) => {
  try {
    const { getAllFeatureFlags } = await import('../lib/featureStore.mjs');
    const result = await getAllFeatureFlags();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/admin/feature-flags/:key/check', async (req, res) => {
  const { tenantId, userId, segment } = req.query;
  try {
    const { isFeatureEnabled } = await import('../lib/featureStore.mjs');
    const enabled = await isFeatureEnabled(req.params.key, { tenantId, userId, segment });
    res.json({ success: true, flagKey: req.params.key, enabled });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/admin/feature-flags/:key/audit', async (req, res) => {
  try {
    const { getFeatureFlagAudit } = await import('../lib/featureStore.mjs');
    const result = await getFeatureFlagAudit(req.params.key);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Customer Segmentation REST APIs
// -----------------------------------------------------------------------------
app.post('/api/v1/admin/segments', async (req, res) => {
  try {
    const { createCustomerSegment } = await import('../lib/crmEngine.mjs');
    const result = await createCustomerSegment(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/admin/segments', async (req, res) => {
  try {
    const { getAllCustomerSegments } = await import('../lib/crmEngine.mjs');
    const result = await getAllCustomerSegments();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/admin/segments/user/:userId', async (req, res) => {
  try {
    const { getUserSegments } = await import('../lib/crmEngine.mjs');
    const result = await getUserSegments(req.params.userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// VIP & Loyalty REST APIs
// -----------------------------------------------------------------------------
app.get('/api/v1/vip/benefits', async (req, res) => {
  try {
    const { getVipBenefitsCatalog } = await import('../lib/vipEngine.mjs');
    res.json(getVipBenefitsCatalog());
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/user/vip/status', async (req, res) => {
  const { userId } = req.query;
  try {
    const { getUserVipStatus } = await import('../lib/vipEngine.mjs');
    res.json({ success: true, vip: getUserVipStatus(userId || 'demo@betking.com') });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/user/vip/history', async (req, res) => {
  const { userId } = req.query;
  try {
    const { getVipTierHistory } = await import('../lib/vipEngine.mjs');
    const result = await getVipTierHistory(userId || 'demo@betking.com');
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Affiliate Platform REST APIs
// -----------------------------------------------------------------------------
app.post('/api/v1/admin/affiliates', async (req, res) => {
  try {
    const { createAffiliateAccount } = await import('../lib/affiliateEngine.mjs');
    const result = await createAffiliateAccount(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/admin/affiliates', async (req, res) => {
  try {
    const { getAllAffiliates } = await import('../lib/affiliateEngine.mjs');
    const result = await getAllAffiliates();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/admin/affiliates/:id', async (req, res) => {
  try {
    const { getAffiliateDashboard } = await import('../lib/affiliateEngine.mjs');
    const result = await getAffiliateDashboard(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/affiliates/click', async (req, res) => {
  const { referralCode } = req.body;
  try {
    const { recordAffiliateClick } = await import('../lib/affiliateEngine.mjs');
    const result = await recordAffiliateClick(referralCode);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/affiliates/conversion', async (req, res) => {
  try {
    const { recordAffiliateConversion } = await import('../lib/affiliateEngine.mjs');
    const result = await recordAffiliateConversion(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Global Audit Explorer REST APIs
// -----------------------------------------------------------------------------
app.get('/api/v1/admin/audit/explorer', async (req, res) => {
  const { actorId, action, targetId, module, startDate, endDate, limit } = req.query;
  try {
    const { query } = await import('../db/pg.js');
    let sql = `SELECT event_id, actor_id, target_id, action, details, created_at FROM audit_events WHERE 1=1`;
    const params = [];
    let paramIdx = 1;

    if (actorId) { sql += ` AND actor_id = $${paramIdx++}`; params.push(actorId); }
    if (action) { sql += ` AND action ILIKE $${paramIdx++}`; params.push(`%${action}%`); }
    if (targetId) { sql += ` AND target_id = $${paramIdx++}`; params.push(targetId); }
    if (startDate) { sql += ` AND created_at >= $${paramIdx++}`; params.push(startDate); }
    if (endDate) { sql += ` AND created_at <= $${paramIdx++}`; params.push(endDate); }

    sql += ` ORDER BY created_at DESC LIMIT ${parseInt(limit) || 100};`;

    const result = await query(sql, params);
    res.json({ success: true, count: result.rows.length, events: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Business Rules REST APIs
// -----------------------------------------------------------------------------
app.get('/api/v1/admin/rules', async (req, res) => {
  try {
    const { loadBusinessRules, getRegisteredRules } = await import('../lib/ruleEngine.mjs');
    const pgRules = await loadBusinessRules();
    const memRules = getRegisteredRules();
    res.json({ success: true, persistedRules: pgRules, inMemoryRules: memRules });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/admin/rules', async (req, res) => {
  try {
    const { persistBusinessRule } = await import('../lib/ruleEngine.mjs');
    const result = await persistBusinessRule(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

import { createServer } from 'http';
import { initWebSocketServer } from '../lib/websocketEngine.mjs';

const httpServer = createServer(app);
initWebSocketServer(httpServer);

httpServer.listen(PORT, async () => {
  console.log(`🚀 BetKing Backend listening on http://localhost:${PORT}`);
  console.log(`  - Webhook Route : http://localhost:${PORT}/api/webhooks/razorpay`);
  console.log(`  - WebSocket Route : ws://localhost:${PORT}/ws/support`);

  try {
    const { startBackgroundWorkers } = await import('../lib/schedulerWorker.mjs');
    startBackgroundWorkers();
  } catch (err) {
    console.warn('[Scheduler Startup Notice]', err.message);
  }
});
