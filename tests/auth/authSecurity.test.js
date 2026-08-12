import { describe, it, expect, vi } from 'vitest';
import { adminAuth, requirePermission, requireRole, generateAdminToken, ADMIN_ROLES } from '../../server/middleware/adminAuth.js';

describe('Phase 1 Auth & Security Tests', () => {
  it('should accept a valid JWT admin token', () => {
    const token = generateAdminToken('admin_sec_1', ADMIN_ROLES.SUPER_ADMIN, 'betking_in');
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    adminAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.admin).toBeDefined();
    expect(req.admin.id).toBe('admin_sec_1');
    expect(req.admin.role).toBe(ADMIN_ROLES.SUPER_ADMIN);
  });

  it('should reject invalid JWT signature', () => {
    const req = { headers: { authorization: 'Bearer invalid.token.signature' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    adminAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject missing JWT token in production environment', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const req = { headers: {} };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    adminAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();

    process.env.NODE_ENV = originalEnv;
  });

  it('CRITICAL: should NOT allow X-Admin-Role header bypass in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const req = { headers: { 'x-admin-role': 'SUPER_ADMIN', 'x-admin-id': 'hacker_1' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    adminAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(req.admin).toBeUndefined();

    process.env.NODE_ENV = originalEnv;
  });

  it('should enforce RBAC role requirements', () => {
    const reqOps = { admin: { role: ADMIN_ROLES.OPERATIONS_ADMIN } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    const checkSuperAdmin = requireRole('SUPER_ADMIN');
    checkSuperAdmin(reqOps, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should enforce domain permissions correctly', () => {
    const reqFinance = { admin: { role: ADMIN_ROLES.FINANCE_ADMIN } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    const checkFinance = requirePermission('finance');
    checkFinance(reqFinance, res, next);
    expect(next).toHaveBeenCalled();

    const checkTrading = requirePermission('trading');
    checkTrading(reqFinance, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
