/**
 * Ops Incident Engine — extends durable `incidents` table (migration 014 + 070).
 * Does not use in-memory incidentEngine as source of truth.
 */

import crypto from 'crypto';
import { query } from '../db/pg.js';

const STATUSES = new Set([
  'OPEN',
  'INVESTIGATING',
  'MITIGATED',
  'MITIGATING',
  'RESOLVED',
  'CLOSED',
  'POSTMORTEM',
]);

const SEVERITIES = new Set(['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4']);

function normalizeStatus(s) {
  const u = String(s || 'OPEN').toUpperCase();
  if (u === 'MITIGATING') return 'MITIGATED';
  if (u === 'POSTMORTEM') return 'CLOSED';
  return u;
}

async function ensureIncidentExtras() {
  const stmts = [
    `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS description TEXT`,
    `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS category VARCHAR(64) DEFAULT 'SYSTEM'`,
    `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS created_by VARCHAR(64)`,
    `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(64)`,
    `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS resolution_summary TEXT`,
    `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS related_alert_ids JSONB DEFAULT '[]'::jsonb`,
    `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS related_entity_type VARCHAR(64)`,
    `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS related_entity_id VARCHAR(128)`,
    `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS incident_number VARCHAR(32)`,
    `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`,
    `CREATE TABLE IF NOT EXISTS incident_timeline (
       id VARCHAR(64) PRIMARY KEY,
       incident_id VARCHAR(64) NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
       event_type VARCHAR(64) NOT NULL,
       actor_id VARCHAR(64),
       note TEXT,
       metadata JSONB DEFAULT '{}'::jsonb,
       created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
     )`,
  ];
  for (const sql of stmts) {
    await query(sql).catch(() => null);
  }
}

async function appendTimeline(incidentId, eventType, actorId, note, metadata = {}) {
  const id = `itl_${crypto.randomBytes(8).toString('hex')}`;
  await query(
    `INSERT INTO incident_timeline (id, incident_id, event_type, actor_id, note, metadata, created_at)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,NOW())`,
    [id, incidentId, eventType, actorId || null, note || null, JSON.stringify(metadata || {})],
  ).catch(() => null);
  return id;
}

function incidentNumber() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `INC-${y}${m}${day}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

export async function createOpsIncident({
  title,
  description = '',
  severity = 'SEV-2',
  category = 'SYSTEM',
  service = 'oddsyra_api',
  createdBy = 'admin',
  assignedTo = null,
  rootCause = '',
  relatedAlertIds = [],
  relatedEntityType = null,
  relatedEntityId = null,
  metadata = {},
} = {}) {
  await ensureIncidentExtras();
  const sev = String(severity || 'SEV-2').toUpperCase();
  if (!SEVERITIES.has(sev)) {
    throw Object.assign(new Error('Invalid severity'), { status: 400, code: 'INVALID_SEVERITY' });
  }

  // Prevent duplicate open incident for same active alert
  const alertIds = Array.isArray(relatedAlertIds) ? relatedAlertIds.filter(Boolean) : [];
  if (alertIds.length) {
    const existing = await query(
      `SELECT id, incident_number, status, title FROM incidents
       WHERE UPPER(status) NOT IN ('RESOLVED','CLOSED','POSTMORTEM')
         AND related_alert_ids ?| $1::text[]
       ORDER BY created_at DESC LIMIT 1`,
      [alertIds],
    ).catch(() => ({ rows: [] }));
    if (existing.rows[0]) {
      return {
        success: true,
        duplicate: true,
        incidentId: existing.rows[0].id,
        incident: existing.rows[0],
      };
    }
  }

  const id = `inc_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
  const number = incidentNumber();

  try {
    await query(
      `INSERT INTO incidents (
         id, title, severity, service, status, root_cause,
         description, category, created_by, assigned_to,
         related_alert_ids, related_entity_type, related_entity_id,
         incident_number, updated_at, created_at
       ) VALUES (
         $1,$2,$3,$4,'OPEN',$5,
         $6,$7,$8,$9,
         $10::jsonb,$11,$12,
         $13,NOW(),NOW()
       )`,
      [
        id,
        String(title || 'Untitled incident').slice(0, 255),
        sev,
        service || 'oddsyra_api',
        rootCause || '',
        description || '',
        category || 'SYSTEM',
        createdBy,
        assignedTo,
        JSON.stringify(alertIds),
        relatedEntityType,
        relatedEntityId,
        number,
      ],
    );
  } catch {
    // Pre-070 fallback
    await query(
      `INSERT INTO incidents (id, title, severity, service, status, root_cause)
       VALUES ($1,$2,$3,$4,'OPEN',$5)`,
      [id, title, sev, service || 'oddsyra_api', rootCause || ''],
    );
  }

  await appendTimeline(id, 'CREATED', createdBy, description || title, {
    severity: sev,
    relatedAlertIds: alertIds,
    ...metadata,
  });

  try {
    const { logAdminAction } = await import('../server/middleware/auditLogger.js');
    await logAdminAction({
      actorId: createdBy,
      targetId: id,
      action: 'OPS_INCIDENT_CREATED',
      details: { severity: sev, relatedAlertIds: alertIds, relatedEntityType, relatedEntityId },
    });
  } catch { /* non-blocking */ }

  return {
    success: true,
    duplicate: false,
    incidentId: id,
    incidentNumber: number,
    title,
    severity: sev,
    status: 'OPEN',
  };
}

export async function listOpsIncidents({
  status = null,
  severity = null,
  limit = 50,
  offset = 0,
} = {}) {
  await ensureIncidentExtras();
  const params = [];
  const conds = [];
  if (status) {
    params.push(normalizeStatus(status));
    conds.push(`UPPER(status) = $${params.length}`);
  }
  if (severity) {
    params.push(String(severity).toUpperCase());
    conds.push(`UPPER(severity) = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  params.push(Math.min(200, Math.max(1, Number(limit) || 50)));
  params.push(Math.max(0, Number(offset) || 0));
  const res = await query(
    `SELECT * FROM incidents ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { success: true, incidents: res.rows, count: res.rows.length };
}

export async function getOpsIncident(incidentId) {
  await ensureIncidentExtras();
  const res = await query(`SELECT * FROM incidents WHERE id = $1`, [incidentId]);
  if (!res.rows[0]) {
    throw Object.assign(new Error('Incident not found'), { status: 404 });
  }
  const timeline = await query(
    `SELECT * FROM incident_timeline WHERE incident_id = $1 ORDER BY created_at ASC LIMIT 200`,
    [incidentId],
  ).catch(() => ({ rows: [] }));
  return { success: true, incident: res.rows[0], timeline: timeline.rows };
}

export async function updateOpsIncident(incidentId, {
  status = null,
  severity = null,
  assignedTo = undefined,
  resolutionSummary = null,
  rootCause = null,
  description = null,
  actorId = 'admin',
  note = null,
} = {}) {
  await ensureIncidentExtras();
  const current = await query(`SELECT * FROM incidents WHERE id = $1`, [incidentId]);
  if (!current.rows[0]) {
    throw Object.assign(new Error('Incident not found'), { status: 404 });
  }
  const row = current.rows[0];
  const nextStatus = status ? normalizeStatus(status) : null;
  if (nextStatus && !STATUSES.has(nextStatus) && !STATUSES.has(String(status).toUpperCase())) {
    throw Object.assign(new Error('Invalid status'), { status: 400, code: 'INVALID_STATUS' });
  }
  const nextSev = severity ? String(severity).toUpperCase() : null;
  if (nextSev && !SEVERITIES.has(nextSev)) {
    throw Object.assign(new Error('Invalid severity'), { status: 400, code: 'INVALID_SEVERITY' });
  }

  const storeStatus = nextStatus === 'MITIGATED' ? 'MITIGATED'
    : nextStatus === 'CLOSED' ? 'CLOSED'
      : nextStatus;

  const res = await query(
    `UPDATE incidents SET
       status = COALESCE($2, status),
       severity = COALESCE($3, severity),
       assigned_to = CASE WHEN $4::boolean THEN $5 ELSE assigned_to END,
       resolution_summary = COALESCE($6, resolution_summary),
       root_cause = COALESCE($7, root_cause),
       description = COALESCE($8, description),
       resolved_at = CASE
         WHEN $2 IN ('RESOLVED','CLOSED') THEN COALESCE(resolved_at, NOW())
         ELSE resolved_at
       END,
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      incidentId,
      storeStatus,
      nextSev,
      assignedTo !== undefined,
      assignedTo ?? null,
      resolutionSummary,
      rootCause,
      description,
    ],
  ).catch(async () => {
    // Minimal columns fallback
    return query(
      `UPDATE incidents SET
         status = COALESCE($2, status),
         severity = COALESCE($3, severity),
         root_cause = COALESCE($4, root_cause),
         resolved_at = CASE WHEN $2 IN ('RESOLVED','CLOSED','POSTMORTEM') THEN COALESCE(resolved_at, NOW()) ELSE resolved_at END
       WHERE id = $1 RETURNING *`,
      [incidentId, storeStatus, nextSev, rootCause],
    );
  });

  if (nextStatus && nextStatus !== normalizeStatus(row.status)) {
    await appendTimeline(incidentId, `STATUS_${nextStatus}`, actorId, note || `Status → ${nextStatus}`);
  }
  if (nextSev && nextSev !== row.severity) {
    await appendTimeline(incidentId, 'SEVERITY_CHANGED', actorId, note || `Severity → ${nextSev}`, {
      from: row.severity,
      to: nextSev,
    });
  }
  if (assignedTo !== undefined && assignedTo !== row.assigned_to) {
    await appendTimeline(incidentId, 'ASSIGNED', actorId, note || `Assigned to ${assignedTo}`, {
      assignedTo,
    });
  }
  if (resolutionSummary) {
    await appendTimeline(incidentId, 'RESOLUTION', actorId, resolutionSummary);
  }

  try {
    const { logAdminAction } = await import('../server/middleware/auditLogger.js');
    await logAdminAction({
      actorId,
      targetId: incidentId,
      action: 'OPS_INCIDENT_UPDATED',
      details: { status: nextStatus, severity: nextSev, assignedTo },
    });
  } catch { /* non-blocking */ }

  return { success: true, incident: res.rows[0] };
}

export async function addOpsIncidentNote(incidentId, { note, actorId = 'admin', metadata = {} } = {}) {
  if (!note) {
    throw Object.assign(new Error('note required'), { status: 400 });
  }
  await ensureIncidentExtras();
  const exists = await query(`SELECT id FROM incidents WHERE id = $1`, [incidentId]);
  if (!exists.rows[0]) {
    throw Object.assign(new Error('Incident not found'), { status: 404 });
  }
  const tid = await appendTimeline(incidentId, 'NOTE', actorId, note, metadata);
  await query(`UPDATE incidents SET updated_at = NOW() WHERE id = $1`, [incidentId]).catch(() => null);
  try {
    const { logAdminAction } = await import('../server/middleware/auditLogger.js');
    await logAdminAction({
      actorId,
      targetId: incidentId,
      action: 'OPS_INCIDENT_NOTE',
      details: { note: String(note).slice(0, 500) },
    });
  } catch { /* non-blocking */ }
  return { success: true, timelineId: tid };
}

export async function linkAlertToIncident(incidentId, alertId, actorId = 'admin') {
  await ensureIncidentExtras();
  const res = await query(
    `UPDATE incidents SET
       related_alert_ids = (
         SELECT jsonb_agg(DISTINCT x)
         FROM jsonb_array_elements_text(COALESCE(related_alert_ids,'[]'::jsonb) || to_jsonb($2::text)) t(x)
       ),
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [incidentId, alertId],
  );
  if (!res.rows[0]) {
    throw Object.assign(new Error('Incident not found'), { status: 404 });
  }
  await appendTimeline(incidentId, 'ALERT_LINKED', actorId, `Linked alert ${alertId}`, { alertId });
  return { success: true, incident: res.rows[0] };
}

/**
 * Create incident from CRITICAL alert — pre-populated, duplicate-safe.
 */
export async function createIncidentFromAlert(alertId, {
  actorId = 'admin',
  title = null,
  severity = null,
  note = null,
} = {}) {
  const alertRes = await query(
    `SELECT * FROM admin_notifications WHERE notification_id = $1`,
    [alertId],
  ).catch(() => ({ rows: [] }));
  const alert = alertRes.rows[0];
  if (!alert) {
    throw Object.assign(new Error('Alert not found'), { status: 404 });
  }
  const sevMap = {
    CRITICAL: 'SEV-1',
    HIGH: 'SEV-2',
    WARNING: 'SEV-3',
    INFO: 'SEV-4',
  };
  const alertSev = String(alert.severity || alert.priority || 'HIGH').toUpperCase();
  return createOpsIncident({
    title: title || `Incident: ${alert.title}`,
    description: note || alert.message || '',
    severity: severity || sevMap[alertSev] || 'SEV-2',
    category: alert.category || 'SYSTEM',
    service: alert.source || 'ops',
    createdBy: actorId,
    relatedAlertIds: [alertId],
    relatedEntityType: alert.entity_type || alert.action_target_type,
    relatedEntityId: alert.entity_id || alert.action_target_id,
    metadata: { fromAlert: true },
  });
}
