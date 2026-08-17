import { describe, it, expect, vi } from 'vitest';
import { requireAuth, requireAccountStatus } from '../../server/middleware/userAuth.js';
import { adminAuth, requireRole } from '../../server/middleware/adminAuth.js';
import { generateAccessToken } from '../../server/auth/tokenService.js';
import { generateAdminToken, ADMIN_ROLES } from '../../server/middleware/adminAuth.js';

describe('RBAC, Account Status & IDOR Protection Middleware Tests', () => {
  describe('User Authentication Middleware (requireAuth)', () => {
    it('should allow valid user token and attach req.user', () => {
      const token = generateAccessToken('usr_player_1', 'USER', 'oddsyra_in');
      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      requireAuth(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toBeDefined();
      expect(req.user.userId).toBe('usr_player_1');
      expect(req.user.role).toBe('USER');
    });

    it('should reject missing authorization header with HTTP 401', () => {
      const req = { headers: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject invalid or expired JWT signature with HTTP 401', () => {
      const req = { headers: { authorization: 'Bearer invalid.jwt.signature' } };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('RBAC Privilege Isolation (User cannot access Admin)', () => {
    it('should block regular USER token from accessing admin-restricted routes', () => {
      // User token issued for regular betting customer
      const userToken = generateAccessToken('usr_regular_customer', 'USER');

      const req = { headers: { authorization: `Bearer ${userToken}` } };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      // Admin auth middleware should process token
      adminAuth(req, res, next);
      expect(next).toHaveBeenCalled();

      // Check role enforcement: admin operations require SUPER_ADMIN or TRADING_ADMIN
      const checkAdminRole = requireRole('SUPER_ADMIN', 'FINANCE_ADMIN');
      const resRole = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const nextRole = vi.fn();

      checkAdminRole(req, resRole, nextRole);

      expect(resRole.status).toHaveBeenCalledWith(403);
      expect(nextRole).not.toHaveBeenCalled();
    });

    it('should allow valid SUPER_ADMIN token to pass admin authentication', () => {
      const adminToken = generateAdminToken('admin_ops_1', ADMIN_ROLES.SUPER_ADMIN);
      const req = { headers: { authorization: `Bearer ${adminToken}` } };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      adminAuth(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.admin.role).toBe(ADMIN_ROLES.SUPER_ADMIN);
    });
  });
});
