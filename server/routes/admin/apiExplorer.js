/**
 * Admin API Explorer — registry, safe tests, health history.
 * Mounted at /api/admin/api-explorer
 */
import { Router } from 'express';
import { requirePermission } from '../../middleware/adminAuth.js';
import { logAdminAction } from '../../middleware/auditLogger.js';
import { allowIndividualTest, allowRefreshAll, EXPLORER_LIMITS } from '../../../lib/api-explorer/rateLimit.mjs';
import { ERROR_CODES } from '../../../lib/api-explorer/errorCodes.mjs';
import {
  listExplorerApis,
  testExplorerApi,
  refreshSafeApis,
  getExplorerHistory,
} from '../../../lib/api-explorer/service.mjs';
import { logger } from '../../../lib/logger.mjs';

const router = Router();
const gate = requirePermission('operations', 'platform', 'providers', 'api-explorer');

function rateLimited(res, result) {
  res.setHeader('Retry-After', result.retryAfterSeconds);
  return res.status(429).json({
    error: 'Too many API Explorer requests. Please try again later.',
    code: ERROR_CODES.RATE_LIMITED,
    retryAfterSeconds: result.retryAfterSeconds,
    limit: result.limit,
    windowSeconds: result.windowSeconds,
  });
}

function audit(req, action, details) {
  logAdminAction({
    actorId: req.admin?.id,
    targetId: details.apiId || null,
    action,
    details,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: req.correlationId || null,
    riskLevel: 'low',
  }).catch(() => null);
}

router.get('/apis', gate, async (req, res) => {
  try {
    const payload = await listExplorerApis();
    res.json({ success: true, limits: EXPLORER_LIMITS, ...payload });
  } catch (err) {
    logger.error('api_explorer_list_failed', { error: err.message });
    res.status(500).json({ error: 'Failed to load API registry', code: ERROR_CODES.INTERNAL_ERROR });
  }
});

router.post('/apis/:apiId/test', gate, async (req, res) => {
  const slot = await allowIndividualTest(req.admin?.id);
  if (!slot.allowed) return rateLimited(res, slot);

  try {
    const { httpStatus, body } = await testExplorerApi(req.params.apiId, { adminId: req.admin?.id });
    if (httpStatus === 404) {
      return res.status(404).json({ error: 'Unknown API', code: ERROR_CODES.UNKNOWN_API });
    }
    audit(req, 'API_EXPLORER_TEST', {
      apiId: req.params.apiId,
      success: body.success,
      responseTimeMs: body.responseTimeMs,
      statusCode: body.statusCode,
    });
    res.status(httpStatus).json(body);
  } catch (err) {
    logger.error('api_explorer_test_failed', { apiId: req.params.apiId, error: err.message });
    res.status(500).json({ error: 'Safe test failed', code: ERROR_CODES.INTERNAL_ERROR });
  }
});

router.get('/apis/:apiId/history', gate, async (req, res) => {
  try {
    const payload = await getExplorerHistory(req.params.apiId);
    if (!payload) {
      return res.status(404).json({ error: 'Unknown API', code: ERROR_CODES.UNKNOWN_API });
    }
    res.json({ success: true, ...payload });
  } catch (err) {
    logger.error('api_explorer_history_failed', { apiId: req.params.apiId, error: err.message });
    res.status(500).json({ error: 'Failed to load history', code: ERROR_CODES.INTERNAL_ERROR });
  }
});

router.post('/refresh-safe', gate, async (req, res) => {
  const slot = await allowRefreshAll(req.admin?.id);
  if (!slot.allowed) return rateLimited(res, slot);

  try {
    const payload = await refreshSafeApis({ adminId: req.admin?.id });
    audit(req, 'API_EXPLORER_REFRESH_SAFE', {
      refreshed: payload.refreshed,
      successCount: payload.results.filter((r) => r.success).length,
    });
    res.json({ success: true, ...payload });
  } catch (err) {
    logger.error('api_explorer_refresh_failed', { error: err.message });
    res.status(500).json({ error: 'Refresh failed', code: ERROR_CODES.INTERNAL_ERROR });
  }
});

export default router;
