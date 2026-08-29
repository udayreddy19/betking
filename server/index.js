// Node.js / Express Backend Server with Razorpay Webhook Handler
// Usage: node server/index.js

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { CSP_REPORT_ONLY } from '../lib/contentSecurityPolicy.mjs';
import { logger } from '../lib/logger.mjs';
import { correlationId } from './middleware/correlationId.js';
import { requestMetricsMiddleware, renderPrometheusMetrics, renderExtendedPrometheusMetrics } from '../lib/requestMetrics.mjs';

const app = express();
const PORT = process.env.PORT || 5001;
const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

// IMPORTANT: Razorpay Webhooks MUST receive the RAW request body to verify HMAC signatures accurately.
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

const corsOriginEnv = process.env.CORS_ORIGIN || process.env.CORS_ALLOWED_ORIGINS;
const corsOptions = corsOriginEnv
  ? {
    origin: corsOriginEnv.split(',').map((s) => s.trim()),
    credentials: true,
  }
  : isProduction
    ? { origin: false, credentials: true }
    : { origin: true, credentials: true };

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(correlationId);
app.use(requestMetricsMiddleware);
function metricsAllowed(req) {
  const token = process.env.METRICS_TOKEN;
  if (token) {
    return req.headers.authorization === `Bearer ${token}`;
  }
  if (!isProduction) return true;
  const ip = String(req.ip || '').replace('::ffff:', '');
  return ip === '127.0.0.1' || ip === '::1';
}

app.get('/metrics', async (req, res) => {
  if (!metricsAllowed(req)) {
    return res.status(404).end();
  }
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  let extra = '';
  try {
    const { getEmailDeliveryMetrics } = await import('./auth/emailService.js');
    const mail = getEmailDeliveryMetrics();
    extra = [
      `email_primary_success_total ${mail.primarySuccess}`,
      `email_fallback_success_total ${mail.fallbackSuccess}`,
      `email_primary_failure_total ${mail.primaryFailure}`,
      `email_fallback_failure_total ${mail.fallbackFailure}`,
      `email_failover_monitored ${mail.monitored ? 1 : 0}`,
    ].join('\n');
  } catch {
    extra = '';
  }
  const body = await renderExtendedPrometheusMetrics().catch(() => renderPrometheusMetrics());
  res.end(`${body}${extra ? `${extra}\n` : ''}`);
});

// Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy-Report-Only', CSP_REPORT_ONLY);
  next();
});

// ── Rate Limiting & Auth Middleware ──
import { adminAuth } from './middleware/adminAuth.js';

// ── Mount Production Auth Routes ──
import authRouter from './auth/authRoutes.js';
app.use('/api/auth', authRouter);

import rewardsRouter from './routes/rewards.js';
app.use('/api/v1/rewards', rewardsRouter);

// ── Mount Primary Modular Admin Router ──
import adminRouter from './routes/index.js';
// Dev/admin bootstrap login — issued BEFORE the authenticated admin router.

import authInlineRouter from './routes/auth.js';
import betsRouter from './routes/bets.js';
import walletRouter from './routes/wallet.js';
import liveRouter from './routes/live.js';
import supportRouter from './routes/support.js';
import growthRouter from './routes/growth.js';
import liveScoresPublicRouter from './routes/public/liveScores.js';
import publicOddsRouter from './routes/public/odds.js';
import adminInlineRouter from './routes/admin/inline.js';
import adminSettlementRouter from './routes/admin/settlement.js';

import userNotificationsRouter from './routes/userNotifications.js';

app.use(authInlineRouter);
app.use(userNotificationsRouter);
app.use(liveRouter);
app.use('/api', liveScoresPublicRouter);
app.use('/api/public/sports', publicOddsRouter);
app.use(walletRouter);
app.use(betsRouter);
app.use(supportRouter);
app.use(growthRouter);

app.use('/api/admin', adminRouter);

// All v1 admin endpoints require admin JWT
app.use('/api/v1/admin', adminAuth);

// Legacy inline admin routes defined below also require auth
app.use('/api/admin', adminAuth);

app.use(adminInlineRouter);
app.use(adminSettlementRouter);

// Non-prod E2E harness (404 unless NODE_ENV!==production && E2E_HARNESS=1)
import e2eHarnessRouter from './routes/e2eHarness.js';
app.use(e2eHarnessRouter);

import { createServer } from 'http';
import { initWebSocketServer } from '../lib/websocketEngine.mjs';

try {
  const { validateProductionEnvironment } = await import('../lib/devopsEngine.mjs');
  validateProductionEnvironment();
} catch (err) {
  logger.error('startup_validation_failed', { error: err.message });
  if (isProduction) process.exit(1);
}

const httpServer = createServer(app);
initWebSocketServer(httpServer);

httpServer.listen(PORT, async () => {
  logger.info('http_listening', { port: Number(PORT), webhook: '/api/webhooks/razorpay', websocket: '/ws/support' });

  try {
    if (process.env.RUN_BACKGROUND_WORKERS !== 'false') {
      const { startBackgroundWorkers } = await import('../lib/schedulerWorker.mjs');
      startBackgroundWorkers();
    }
  } catch (err) {
    logger.warn('scheduler_startup_failed', { error: err.message });
  }

  try {
    const { hydrateSrlOperatorSessions } = await import('../lib/iplSrlOperatorState.mjs');
    await hydrateSrlOperatorSessions();
  } catch (err) {
    logger.warn('srl_operator_hydrate_failed', { error: err.message });
  }

  try {
    const { hydrateMarketLiabilityStore } = await import('../lib/marketLiabilityStore.mjs');
    await hydrateMarketLiabilityStore();
  } catch (err) {
    logger.warn('market_liability_hydrate_failed', { error: err.message });
  }
});

