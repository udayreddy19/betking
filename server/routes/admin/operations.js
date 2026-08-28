/**
 * Phase 3 Operations API — Control Tower, Alerts, Incidents, Health, Notifications.
 * Observational layer; RBAC via requireRole. Does not mutate money paths.
 */

import { Router } from 'express';
import { requireRole } from '../../middleware/adminAuth.js';

const router = Router();

const OPS_ROLES = ['SUPER_ADMIN', 'OPERATIONS_ADMIN'];
const READ_OPS = ['SUPER_ADMIN', 'OPERATIONS_ADMIN', 'FINANCE_ADMIN', 'RISK_ANALYST'];

function adminId(req) {
  return req.admin?.id || req.admin?.adminId || 'admin';
}

function handle(err, res) {
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ success: false, error: err.message, code: err.code });
}

// ── Control Tower ──
router.get(
  '/control-tower',
  requireRole(...READ_OPS),
  async (req, res) => {
    try {
      const { buildOpsControlTower } = await import('../../../lib/opsControlTower.mjs');
      res.json(await buildOpsControlTower());
    } catch (err) {
      handle(err, res);
    }
  },
);

// ── Alerts ──
router.get(
  '/alerts',
  requireRole(...READ_OPS),
  async (req, res) => {
    try {
      const { listOpsAlerts } = await import('../../../lib/opsAlertEngine.mjs');
      res.json(await listOpsAlerts({
        status: req.query.status,
        severity: req.query.severity,
        category: req.query.category,
        limit: req.query.limit,
        offset: req.query.offset,
      }));
    } catch (err) {
      handle(err, res);
    }
  },
);

router.get(
  '/alerts/:id',
  requireRole(...READ_OPS),
  async (req, res) => {
    try {
      const { query } = await import('../../../db/pg.js');
      const r = await query(
        `SELECT * FROM admin_notifications WHERE notification_id = $1`,
        [req.params.id],
      );
      if (!r.rows[0]) return res.status(404).json({ success: false, error: 'Alert not found' });
      res.json({ success: true, alert: r.rows[0] });
    } catch (err) {
      handle(err, res);
    }
  },
);

async function transition(req, res, status) {
  try {
    const { transitionOpsAlert } = await import('../../../lib/opsAlertEngine.mjs');
    const result = await transitionOpsAlert(req.params.id, {
      status,
      adminId: adminId(req),
      note: req.body?.note || null,
    });
    const { logAdminAction } = await import('../../middleware/auditLogger.js');
    await logAdminAction({
      actorId: adminId(req),
      targetId: req.params.id,
      action: `OPS_ALERT_${status}`,
      details: { note: req.body?.note || null },
    });
    res.json(result);
  } catch (err) {
    handle(err, res);
  }
}

router.post('/alerts/:id/acknowledge', requireRole(...OPS_ROLES, 'FINANCE_ADMIN'), (req, res) => transition(req, res, 'ACKNOWLEDGED'));
router.post('/alerts/:id/resolve', requireRole(...OPS_ROLES, 'FINANCE_ADMIN'), (req, res) => transition(req, res, 'RESOLVED'));
router.post('/alerts/:id/dismiss', requireRole(...OPS_ROLES), (req, res) => transition(req, res, 'DISMISSED'));

router.post(
  '/alerts/:id/create-incident',
  requireRole(...OPS_ROLES),
  async (req, res) => {
    try {
      const { createIncidentFromAlert } = await import('../../../lib/opsIncidentEngine.mjs');
      const result = await createIncidentFromAlert(req.params.id, {
        actorId: adminId(req),
        title: req.body?.title,
        severity: req.body?.severity,
        note: req.body?.note,
      });
      res.json(result);
    } catch (err) {
      handle(err, res);
    }
  },
);

router.get(
  '/alert-rules',
  requireRole(...OPS_ROLES, 'FINANCE_ADMIN'),
  async (req, res) => {
    try {
      const { listOpsAlertRules } = await import('../../../lib/opsAlertEngine.mjs');
      res.json(await listOpsAlertRules());
    } catch (err) {
      handle(err, res);
    }
  },
);

router.patch(
  '/alert-rules/:id',
  requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN'),
  async (req, res) => {
    try {
      const { updateOpsAlertRule } = await import('../../../lib/opsAlertEngine.mjs');
      const result = await updateOpsAlertRule(req.params.id, req.body || {});
      const { logAdminAction } = await import('../../middleware/auditLogger.js');
      await logAdminAction({
        actorId: adminId(req),
        targetId: req.params.id,
        action: 'OPS_ALERT_RULE_UPDATED',
        details: req.body || {},
      });
      res.json(result);
    } catch (err) {
      handle(err, res);
    }
  },
);

router.post(
  '/alert-rules/evaluate',
  requireRole(...OPS_ROLES),
  async (req, res) => {
    try {
      const { evaluateOpsThresholds } = await import('../../../lib/opsAlertEngine.mjs');
      res.json(await evaluateOpsThresholds());
    } catch (err) {
      handle(err, res);
    }
  },
);

// ── Incidents ──
router.get(
  '/incidents',
  requireRole(...OPS_ROLES, 'FINANCE_ADMIN'),
  async (req, res) => {
    try {
      const { listOpsIncidents } = await import('../../../lib/opsIncidentEngine.mjs');
      res.json(await listOpsIncidents({
        status: req.query.status,
        severity: req.query.severity,
        limit: req.query.limit,
        offset: req.query.offset,
      }));
    } catch (err) {
      handle(err, res);
    }
  },
);

router.post(
  '/incidents',
  requireRole(...OPS_ROLES),
  async (req, res) => {
    try {
      const { createOpsIncident } = await import('../../../lib/opsIncidentEngine.mjs');
      const body = req.body || {};
      res.json(await createOpsIncident({
        ...body,
        createdBy: adminId(req),
        relatedAlertIds: body.relatedAlertIds || body.related_alert_ids || [],
      }));
    } catch (err) {
      handle(err, res);
    }
  },
);

router.get(
  '/incidents/:id',
  requireRole(...OPS_ROLES, 'FINANCE_ADMIN'),
  async (req, res) => {
    try {
      const { getOpsIncident } = await import('../../../lib/opsIncidentEngine.mjs');
      res.json(await getOpsIncident(req.params.id));
    } catch (err) {
      handle(err, res);
    }
  },
);

router.patch(
  '/incidents/:id',
  requireRole(...OPS_ROLES),
  async (req, res) => {
    try {
      const { updateOpsIncident } = await import('../../../lib/opsIncidentEngine.mjs');
      res.json(await updateOpsIncident(req.params.id, {
        ...req.body,
        actorId: adminId(req),
        assignedTo: req.body?.assignedTo !== undefined ? req.body.assignedTo : undefined,
        resolutionSummary: req.body?.resolutionSummary || req.body?.resolution_summary,
      }));
    } catch (err) {
      handle(err, res);
    }
  },
);

router.post(
  '/incidents/:id/notes',
  requireRole(...OPS_ROLES),
  async (req, res) => {
    try {
      const { addOpsIncidentNote } = await import('../../../lib/opsIncidentEngine.mjs');
      res.json(await addOpsIncidentNote(req.params.id, {
        note: req.body?.note,
        actorId: adminId(req),
        metadata: req.body?.metadata,
      }));
    } catch (err) {
      handle(err, res);
    }
  },
);

router.post(
  '/incidents/:id/assign',
  requireRole(...OPS_ROLES),
  async (req, res) => {
    try {
      const { updateOpsIncident } = await import('../../../lib/opsIncidentEngine.mjs');
      res.json(await updateOpsIncident(req.params.id, {
        assignedTo: req.body?.assignedTo || req.body?.assignee,
        actorId: adminId(req),
        note: req.body?.note,
      }));
    } catch (err) {
      handle(err, res);
    }
  },
);

router.post(
  '/incidents/:id/resolve',
  requireRole(...OPS_ROLES),
  async (req, res) => {
    try {
      const { updateOpsIncident } = await import('../../../lib/opsIncidentEngine.mjs');
      res.json(await updateOpsIncident(req.params.id, {
        status: 'RESOLVED',
        resolutionSummary: req.body?.resolutionSummary || req.body?.resolution_summary || req.body?.note,
        rootCause: req.body?.rootCause || req.body?.root_cause,
        actorId: adminId(req),
      }));
    } catch (err) {
      handle(err, res);
    }
  },
);

// ── Production Health ──
// Legacy infrastructure matrix (services[]) — keep for existing UI
router.get(
  '/health',
  requireRole(...OPS_ROLES),
  async (req, res) => {
    try {
      const { buildOperationsHealth } = await import('../../../lib/adminDomainData.mjs');
      res.json(await buildOperationsHealth());
    } catch (err) {
      handle(err, res);
    }
  },
);

router.get(
  '/production-health',
  requireRole(...OPS_ROLES),
  async (req, res) => {
    try {
      const { buildProductionHealth } = await import('../../../lib/opsProductionHealth.mjs');
      res.json(await buildProductionHealth());
    } catch (err) {
      handle(err, res);
    }
  },
);

router.get(
  '/production-health/drilldown',
  requireRole(...READ_OPS),
  async (req, res) => {
    try {
      const { getAdminKpiDrilldown } = await import('../../../lib/adminKpiDrilldown.mjs');
      const result = await getAdminKpiDrilldown(req.query.metric, {
        limit: req.query.limit,
      });
      if (result?.success === false && result?.status === 404) {
        return res.status(404).json(result);
      }
      res.json(result);
    } catch (err) {
      handle(err, res);
    }
  },
);

/** Shared KPI drill-down for all Control Center modules / tiles */
router.get(
  '/kpi-drilldown',
  requireRole(...READ_OPS),
  async (req, res) => {
    try {
      const { getAdminKpiDrilldown } = await import('../../../lib/adminKpiDrilldown.mjs');
      const result = await getAdminKpiDrilldown(req.query.metric, {
        limit: req.query.limit,
      });
      if (result?.success === false && result?.status === 404) {
        return res.status(404).json(result);
      }
      res.json(result);
    } catch (err) {
      handle(err, res);
    }
  },
);

// ── Notifications ──
router.get(
  '/notifications',
  requireRole(...READ_OPS),
  async (req, res) => {
    try {
      const { listOpsNotifications } = await import('../../../lib/opsNotificationCenter.mjs');
      res.json(await listOpsNotifications({
        adminId: adminId(req),
        severity: req.query.severity,
        type: req.query.type,
        unreadOnly: req.query.unread === '1' || req.query.unreadOnly === 'true',
        limit: req.query.limit,
        offset: req.query.offset,
      }));
    } catch (err) {
      handle(err, res);
    }
  },
);

router.post(
  '/notifications/:id/read',
  requireRole(...READ_OPS),
  async (req, res) => {
    try {
      const { markNotificationRead } = await import('../../../lib/opsNotificationCenter.mjs');
      res.json(await markNotificationRead(req.params.id, adminId(req), true));
    } catch (err) {
      handle(err, res);
    }
  },
);

router.post(
  '/notifications/:id/unread',
  requireRole(...READ_OPS),
  async (req, res) => {
    try {
      const { markNotificationRead } = await import('../../../lib/opsNotificationCenter.mjs');
      res.json(await markNotificationRead(req.params.id, adminId(req), false));
    } catch (err) {
      handle(err, res);
    }
  },
);

router.post(
  '/notifications/read-all',
  requireRole(...READ_OPS),
  async (req, res) => {
    try {
      const { markAllNotificationsRead } = await import('../../../lib/opsNotificationCenter.mjs');
      res.json(await markAllNotificationsRead(adminId(req)));
    } catch (err) {
      handle(err, res);
    }
  },
);

router.get(
  '/notification-preferences',
  requireRole(...READ_OPS),
  async (req, res) => {
    try {
      const { getNotificationPreferences } = await import('../../../lib/opsNotificationCenter.mjs');
      res.json(await getNotificationPreferences(adminId(req)));
    } catch (err) {
      handle(err, res);
    }
  },
);

router.patch(
  '/notification-preferences',
  requireRole(...READ_OPS),
  async (req, res) => {
    try {
      const { updateNotificationPreferences } = await import('../../../lib/opsNotificationCenter.mjs');
      res.json(await updateNotificationPreferences(adminId(req), req.body || {}));
    } catch (err) {
      handle(err, res);
    }
  },
);

/** GET /operations/production-readiness — evidence-based readiness matrix */
router.get(
  '/production-readiness',
  requireRole(...READ_OPS),
  async (req, res) => {
    try {
      const { buildProductionReadiness } = await import('../../../lib/productionReadinessEngine.mjs');
      const environment = req.query.environment || process.env.READINESS_ENV || 'local';
      res.json(await buildProductionReadiness({ environment }));
    } catch (err) {
      handle(err, res);
    }
  },
);


/** GET /operations/production-certification — Phase 10 certification (evidence-gated; never force-GREEN) */
router.get(
  '/production-certification',
  requireRole(...READ_OPS),
  async (req, res) => {
    try {
      const { buildProductionCertification } = await import('../../../lib/productionCertificationEngine.mjs');
      const environment = req.query.environment || process.env.READINESS_ENV || 'local';
      const body = await buildProductionCertification({ environment });
      try {
        const { logAdminAction } = await import('../../middleware/auditLogger.js');
        await logAdminAction({
          actorId: adminId(req),
          action: 'production_certification_read',
          details: {
            environment,
            status: body.PRODUCTION_CERTIFICATION_STATUS,
            productionClaimAllowed: body.productionClaimAllowed,
          },
          ip: req.ip,
          userAgent: req.get?.('user-agent'),
          requestId: req.requestId || req.id || null,
        });
      } catch {
        /* non-blocking audit */
      }
      res.json(body);
    } catch (err) {
      handle(err, res);
    }
  },
);

/** GET /operations/test-funding — known test accounts (read-only; no auto-zero) */
router.get(
  '/test-funding',
  requireRole(...READ_OPS),
  async (req, res) => {
    try {
      const { inspectKnownTestFundingAccounts } = await import('../../../lib/knownTestFundingExclusions.mjs');
      res.json(await inspectKnownTestFundingAccounts());
    } catch (err) {
      handle(err, res);
    }
  },
);

/** GET /operations/backups — backup log (metadata only) */
router.get(
  '/backups',
  requireRole(...READ_OPS),
  async (req, res) => {
    try {
      const { query } = await import('../../../db/pg.js');
      const lim = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const bkpRes = await query(
        `SELECT id, backup_type, status, size_bytes, duration_ms, created_at
         FROM backups_log
         ORDER BY created_at DESC
         LIMIT $1`,
        [lim],
      );
      const latest = bkpRes.rows[0] || null;
      let ageHours = null;
      if (latest?.created_at) {
        ageHours = Math.round((Date.now() - new Date(latest.created_at).getTime()) / 3600000);
      }
      res.json({
        success: true,
        count: bkpRes.rows.length,
        backups: bkpRes.rows,
        summary: {
          lastBackupAt: latest?.created_at || null,
          lastStatus: latest?.status || null,
          ageHours,
          note: 'Local dump restore RPO/RTO is NOT production claim. See DR verification reports.',
        },
      });
    } catch (err) {
      handle(err, res);
    }
  },
);

export default router;
