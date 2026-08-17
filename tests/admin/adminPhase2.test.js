import { describe, it, expect, vi } from 'vitest';
import { adminAuth, requireRole, requirePermission, generateAdminToken, ADMIN_ROLES } from '../../server/middleware/adminAuth.js';

describe('Phase 2 Admin Control Center & RBAC Security Tests', () => {
  it('CRITICAL: unauthenticated request to admin API must be rejected with 401', () => {
    const req = { headers: {} };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    adminAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('CRITICAL: SUPPORT_AGENT must NOT perform SUPER_ADMIN emergency operation (403)', () => {
    const token = generateAdminToken('agent_1', ADMIN_ROLES.SUPPORT_AGENT, 'oddsyra_in');
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    adminAuth(req, res, next);
    expect(next).toHaveBeenCalled();

    const superAdminGuard = requireRole(ADMIN_ROLES.SUPER_ADMIN);
    const res2 = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next2 = vi.fn();

    superAdminGuard(req, res2, next2);
    expect(res2.status).toHaveBeenCalledWith(403);
    expect(next2).not.toHaveBeenCalled();
  });

  it('SUPPORT_AGENT should be allowed to access support domain permission', () => {
    const token = generateAdminToken('agent_2', ADMIN_ROLES.SUPPORT_AGENT, 'oddsyra_in');
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    adminAuth(req, res, next);

    const supportGuard = requirePermission('support', 'tickets');
    const res2 = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next2 = vi.fn();

    supportGuard(req, res2, next2);
    expect(next2).toHaveBeenCalled();
  });

  it('FINANCE_ADMIN should be allowed withdrawal domain permissions', () => {
    const token = generateAdminToken('fin_1', ADMIN_ROLES.FINANCE_ADMIN, 'oddsyra_in');
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    adminAuth(req, res, next);

    const finGuard = requirePermission('finance', 'withdrawal');
    const res2 = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next2 = vi.fn();

    finGuard(req, res2, next2);
    expect(next2).toHaveBeenCalled();
  });

  it('CRITICAL: forged frontend permission header cannot bypass backend RBAC', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const req = {
      headers: {
        'x-admin-role': 'SUPER_ADMIN',
        'x-user-permission': 'all',
      },
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    adminAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();

    process.env.NODE_ENV = originalEnv;
  });

  it('should support pagination limits and offset on user list searches', async () => {
    const { query } = await import('../../db/pg.js');
    const res = await query('SELECT user_id, email FROM users LIMIT 10 OFFSET 0;');
    expect(res.rows).toBeDefined();
    expect(Array.isArray(res.rows)).toBe(true);
  });

  it('should record audit event for account restriction and release', async () => {
    const { enterpriseAuditEngine } = await import('../../lib/enterpriseAuditEngine.mjs');
    
    enterpriseAuditEngine.recordEvent({
      who: 'admin_test_p2',
      what: 'ACCOUNT_SUSPENDED',
      reason: 'Risk review under Phase 2 test',
      referenceId: 'usr_test_p2',
    });

    const recent = enterpriseAuditEngine.getLogs({ referenceId: 'usr_test_p2' });
    const event = recent.find(e => e.referenceId === 'usr_test_p2');
    expect(event).toBeDefined();
    expect(event.what).toBe('ACCOUNT_SUSPENDED');
  });

  it('should validate bulk operation max batch limit (max 100 items per batch)', async () => {
    const { bulkOperationsEngine } = await import('../../lib/bulkOperationsEngine.mjs');
    
    const hugeBatch = Array.from({ length: 150 }, (_, i) => ({ id: `usr_${i}` }));
    let errorThrown = false;
    try {
      bulkOperationsEngine.validateBatchSize(hugeBatch, 100);
    } catch (err) {
      errorThrown = true;
      expect(err.message).toContain('Batch size exceeds maximum limit');
    }
    expect(errorThrown).toBe(true);
  });
});
