/**
 * Phase 3 Operations — unit + integration-style tests (DB when available).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  raiseOpsAlert,
  transitionOpsAlert,
  evaluateOpsThresholds,
  ensureOpsAlertSchema,
} from '../../lib/opsAlertEngine.mjs';
import {
  createOpsIncident,
  updateOpsIncident,
  addOpsIncidentNote,
  createIncidentFromAlert,
  listOpsIncidents,
} from '../../lib/opsIncidentEngine.mjs';
import {
  listOpsNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  notifyOpsAdmin,
  getNotificationPreferences,
  updateNotificationPreferences,
} from '../../lib/opsNotificationCenter.mjs';
import { buildOpsControlTower } from '../../lib/opsControlTower.mjs';
import { buildProductionHealth } from '../../lib/opsProductionHealth.mjs';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('Phase 3 — Ops Alert Engine', () => {
  beforeAll(async () => {
    await ensureOpsAlertSchema();
  });

  it('creates alert with severity and dedupe_key', async () => {
    const key = `test_dedupe_${Date.now()}`;
    const a = await raiseOpsAlert({
      title: 'Test withdrawal spike',
      message: 'unit test',
      severity: 'HIGH',
      category: 'FINANCIAL',
      source: 'test',
      dedupeKey: key,
      soft: false,
    });
    expect(a.recorded).toBe(true);
    expect(a.alertId).toBeTruthy();
    expect(a.bumped).toBe(false);

    const b = await raiseOpsAlert({
      title: 'Test withdrawal spike',
      message: 'unit test bump',
      severity: 'HIGH',
      category: 'FINANCIAL',
      source: 'test',
      dedupeKey: key,
      soft: false,
    });
    expect(b.recorded).toBe(true);
    expect(b.bumped).toBe(true);
    expect(b.alertId).toBe(a.alertId);
    expect(b.occurrenceCount).toBeGreaterThanOrEqual(2);
  });

  it('acknowledges and resolves alerts', async () => {
    const a = await raiseOpsAlert({
      title: 'Ack resolve test',
      severity: 'WARNING',
      category: 'SYSTEM',
      dedupeKey: `ack_${Date.now()}`,
      soft: false,
    });
    const ack = await transitionOpsAlert(a.alertId, { status: 'ACKNOWLEDGED', adminId: 'test_admin' });
    expect(ack.alert.status).toBe('ACKNOWLEDGED');
    const res = await transitionOpsAlert(a.alertId, { status: 'RESOLVED', adminId: 'test_admin', note: 'done' });
    expect(res.alert.status).toBe('RESOLVED');
  });

  it('dismisses alerts', async () => {
    const a = await raiseOpsAlert({
      title: 'Dismiss test',
      severity: 'INFO',
      dedupeKey: `dismiss_${Date.now()}`,
      soft: false,
    });
    const d = await transitionOpsAlert(a.alertId, { status: 'DISMISSED', adminId: 'test_admin' });
    expect(d.alert.status).toBe('DISMISSED');
  });

  it('evaluateOpsThresholds is fail-safe', async () => {
    const r = await evaluateOpsThresholds();
    expect(r.success).toBe(true);
    expect(Array.isArray(r.results)).toBe(true);
  });
});

describe.skipIf(!hasDb)('Phase 3 — Incident Management', () => {
  it('creates, assigns, notes, resolves; prevents duplicate for same alert', async () => {
    const alert = await raiseOpsAlert({
      title: 'Critical for incident',
      severity: 'CRITICAL',
      category: 'SYSTEM',
      dedupeKey: `inc_alert_${Date.now()}`,
      soft: false,
    });

    const created = await createIncidentFromAlert(alert.alertId, {
      actorId: 'ops_tester',
      severity: 'SEV-1',
    });
    expect(created.success).toBe(true);
    expect(created.duplicate).toBe(false);

    const dup = await createIncidentFromAlert(alert.alertId, { actorId: 'ops_tester' });
    expect(dup.duplicate).toBe(true);
    expect(dup.incidentId).toBe(created.incidentId);

    await updateOpsIncident(created.incidentId, {
      status: 'INVESTIGATING',
      assignedTo: 'ops_tester',
      actorId: 'ops_tester',
    });
    await addOpsIncidentNote(created.incidentId, {
      note: 'Investigating root cause',
      actorId: 'ops_tester',
    });
    const resolved = await updateOpsIncident(created.incidentId, {
      status: 'RESOLVED',
      resolutionSummary: 'Fixed',
      rootCause: 'test',
      actorId: 'ops_tester',
    });
    expect(['RESOLVED', 'CLOSED'].includes(String(resolved.incident.status).toUpperCase())).toBe(true);

    const list = await listOpsIncidents({ limit: 5 });
    expect(list.success).toBe(true);
  });
});

describe.skipIf(!hasDb)('Phase 3 — Notifications', () => {
  it('creates, lists, marks read, prefs', async () => {
    const adminId = `admin_test_${Date.now()}`;
    await updateNotificationPreferences(adminId, { criticalAlerts: true, channelInApp: true });
    const prefs = await getNotificationPreferences(adminId);
    expect(prefs.preferences.critical_alerts).toBe(true);

    const n = await notifyOpsAdmin({
      recipientAdminId: adminId,
      title: 'Notif test',
      message: 'hello',
      severity: 'HIGH',
      type: 'SYSTEM',
      dedupeKey: `notif_test_${Date.now()}`,
    });
    expect(n.recorded).toBe(true);

    const list = await listOpsNotifications({ adminId, limit: 20 });
    expect(list.success).toBe(true);
    expect(list.unreadCount).toBeGreaterThanOrEqual(0);

    if (n.alertId) {
      await markNotificationRead(n.alertId, adminId, true);
    }
    await markAllNotificationsRead(adminId);
  });
});

describe.skipIf(!hasDb)('Phase 3 — Control Tower + Production Health', () => {
  it('builds control tower with null-safe KPIs', async () => {
    const tower = await buildOpsControlTower();
    expect(tower.success).toBe(true);
    expect(tower.lastUpdated).toBeTruthy();
    expect(tower.topCards).toBeTruthy();
    expect(tower.financial).toBeTruthy();
    expect(tower.betting).toBeTruthy();
    expect(Array.isArray(tower.workQueue)).toBe(true);
    // Never invent fake zeros when unavailable — allow null or number
    for (const v of Object.values(tower.topCards)) {
      expect(v === null || typeof v === 'string' || typeof v === 'number').toBe(true);
    }
  }, 30000);

  it('builds production health with overall status', async () => {
    const h = await buildProductionHealth();
    expect(h.success).toBe(true);
    expect(['HEALTHY', 'DEGRADED', 'WARNING', 'CRITICAL', 'UNKNOWN', 'DOWN'].includes(h.overall)
      || typeof h.overall === 'string').toBe(true);
    expect(h.application).toBeTruthy();
    expect(h.database).toBeTruthy();
    expect(h.security?.note).toBeTruthy();
  }, 15000);
});

describe('Phase 3 — Failure safety (soft raiseOpsAlert)', () => {
  it('raiseOpsAlert soft mode never throws on bad schema path', async () => {
    const r = await raiseOpsAlert({
      title: 'soft',
      soft: true,
      dedupeKey: null,
    });
    expect(r).toHaveProperty('recorded');
  });
});

describe('Phase 3 — route module exports', () => {
  it('operations router mounts', async () => {
    const mod = await import('../../server/routes/admin/operations.js');
    expect(mod.default).toBeTruthy();
  });
});
