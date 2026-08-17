import { describe, it, expect, vi } from 'vitest';
import { adminAuth, requirePermission, requireRole, generateAdminToken, ADMIN_ROLES } from '../../server/middleware/adminAuth.js';

describe('Admin Authentication & RBAC Middleware', () => {
  it('should generate and verify JWT admin tokens', () => {
    const token = generateAdminToken('admin_unit_test', ADMIN_ROLES.SUPER_ADMIN, 'oddsyra_in');
    expect(token).toBeTypeOf('string');
    expect(token.split('.').length).toBe(3);

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = {};
    const next = vi.fn();

    adminAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.admin).toBeDefined();
    expect(req.admin.id).toBe('admin_unit_test');
    expect(req.admin.role).toBe(ADMIN_ROLES.SUPER_ADMIN);
  });

  it('should handle X-Admin-Role dev header fallback', () => {
    const req = { headers: { 'x-admin-role': ADMIN_ROLES.FINANCE_ADMIN, 'x-admin-id': 'finance_user' } };
    const res = {};
    const next = vi.fn();

    adminAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.admin.id).toBe('finance_user');
    expect(req.admin.role).toBe(ADMIN_ROLES.FINANCE_ADMIN);
  });

  it('should allow SUPER_ADMIN to pass requireRole check', () => {
    const req = { admin: { role: ADMIN_ROLES.SUPER_ADMIN } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    const middleware = requireRole('OPERATIONS_ADMIN');
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should reject non-permitted role in requireRole check', () => {
    const req = { admin: { role: ADMIN_ROLES.SUPPORT_AGENT } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    const middleware = requireRole('OPERATIONS_ADMIN', 'SUPER_ADMIN');
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should enforce domain permissions correctly in requirePermission', () => {
    const reqFinance = { admin: { role: ADMIN_ROLES.FINANCE_ADMIN } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    const middleware = requirePermission('finance');
    middleware(reqFinance, res, next);
    expect(next).toHaveBeenCalled();
  });
});
