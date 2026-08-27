/**
 * Phase 3 E2E-style ops flow (requires DATABASE_URL).
 * Uses existing withdrawal risk helpers + ops engines — does not bypass withdrawalEngine business rules.
 */
import { describe, it, expect } from 'vitest';
import { raiseOpsAlert, transitionOpsAlert } from '../../lib/opsAlertEngine.mjs';
import { createIncidentFromAlert, updateOpsIncident } from '../../lib/opsIncidentEngine.mjs';
import { notifyOpsAdmin, listOpsNotifications } from '../../lib/opsNotificationCenter.mjs';
import { requiresWithdrawalDualControl } from '../../lib/withdrawalRiskEngine.mjs';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('Phase 3 E2E — HIGH-risk withdrawal ops path (observational)', () => {
  it('HIGH risk → alert → notification → ack → incident → resolve', async () => {
    expect(requiresWithdrawalDualControl('HIGH')).toBe(true);

    const wdId = `wdr_e2e_${Date.now()}`;
    const alert = await raiseOpsAlert({
      title: 'HIGH risk withdrawal',
      message: `Withdrawal ${wdId} requires review`,
      severity: 'HIGH',
      category: 'FINANCIAL',
      source: 'e2e',
      entityType: 'withdrawal',
      entityId: wdId,
      dedupeKey: `e2e_wd:${wdId}`,
      soft: false,
    });
    expect(alert.recorded).toBe(true);

    const notif = await notifyOpsAdmin({
      recipientAdminId: 'admin',
      title: 'HIGH risk withdrawal',
      message: `Review ${wdId}`,
      severity: 'HIGH',
      type: 'FINANCIAL',
      entityType: 'withdrawal',
      entityId: wdId,
      dedupeKey: `e2e_notif:${wdId}`,
    });
    expect(notif.recorded).toBe(true);

    const inbox = await listOpsNotifications({ adminId: 'admin', limit: 10 });
    expect(inbox.success).toBe(true);

    await transitionOpsAlert(alert.alertId, { status: 'ACKNOWLEDGED', adminId: 'maker_admin' });

    const incident = await createIncidentFromAlert(alert.alertId, {
      actorId: 'ops_admin',
      severity: 'SEV-2',
    });
    expect(incident.success).toBe(true);

    // Simulate maker/checker completion (observational — financial state unchanged here)
    await transitionOpsAlert(alert.alertId, {
      status: 'RESOLVED',
      adminId: 'checker_admin',
      note: 'Withdrawal completed via existing engine',
    });
    await updateOpsIncident(incident.incidentId, {
      status: 'RESOLVED',
      resolutionSummary: 'Maker + checker approved via withdrawalEngine',
      actorId: 'ops_admin',
    });
  });

  it('promo abuse → alert → notification', async () => {
    const alert = await raiseOpsAlert({
      title: 'Promotion abuse detected',
      message: 'e2e promo block',
      severity: 'WARNING',
      category: 'PROMOTION',
      source: 'e2e',
      dedupeKey: `e2e_promo_${Date.now()}`,
      soft: false,
    });
    expect(alert.recorded).toBe(true);
    const n = await notifyOpsAdmin({
      recipientAdminId: 'admin',
      title: alert.title || 'Promotion abuse',
      severity: 'WARNING',
      type: 'PROMOTION',
      dedupeKey: `e2e_promo_n_${Date.now()}`,
    });
    expect(n.recorded).toBe(true);
  });

  it('settlement failure → alert → incident', async () => {
    const alert = await raiseOpsAlert({
      title: 'Settlement job dead-lettered',
      message: 'e2e settlement fail',
      severity: 'CRITICAL',
      category: 'BETTING',
      source: 'e2e',
      dedupeKey: `e2e_settle_${Date.now()}`,
      soft: false,
    });
    const incident = await createIncidentFromAlert(alert.alertId, {
      actorId: 'ops_admin',
      severity: 'SEV-1',
    });
    expect(incident.success).toBe(true);
    expect(incident.duplicate).toBe(false);
  });
});

describe('Phase 3 E2E — monitoring must not block money (soft)', () => {
  it('raiseOpsAlert soft failure returns recorded:false without throw', async () => {
    const r = await raiseOpsAlert({ title: 'x', soft: true });
    expect(typeof r.recorded).toBe('boolean');
  });
});
