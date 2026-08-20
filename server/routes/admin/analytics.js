import { Router } from 'express';
import { requirePermission } from '../../middleware/adminAuth.js';
import { getExecutiveDashboardMetrics, getRetentionAndCohortMetrics, getUserFunnelMetrics, getBIReport } from '../../../lib/businessIntelligenceEngine.mjs';

const router = Router();

// GET /api/admin/analytics/reports — Server-side filtered BI report endpoint
router.get('/reports', requirePermission('analytics'), async (req, res) => {
  try {
    const { metric, from, to, sport, page = 1, limit = 25 } = req.query;

    const report = await getBIReport({
      metric: metric || 'SUMMARY',
      from,
      to,
      sport,
      page,
      limit,
    });

    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/analytics/overview — Executive BI metrics
router.get('/overview', requirePermission('analytics'), async (req, res) => {
  try {
    const metrics = await getExecutiveDashboardMetrics(req.query);
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/analytics/retention — Cohort & retention metrics
router.get('/retention', requirePermission('analytics'), async (req, res) => {
  try {
    const retention = await getRetentionAndCohortMetrics();
    res.json(retention);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/analytics/funnel — Customer lifecycle conversion funnel
router.get('/funnel', requirePermission('analytics'), async (req, res) => {
  try {
    const funnel = await getUserFunnelMetrics();
    res.json(funnel);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
