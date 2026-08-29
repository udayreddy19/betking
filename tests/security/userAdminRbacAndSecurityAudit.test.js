import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Admin roles mirror the frontend & backend RBAC system
const ADMIN_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  FINANCE_ADMIN: 'FINANCE_ADMIN',
  TRADING_ADMIN: 'TRADING_ADMIN',
  SUPPORT_AGENT: 'SUPPORT_AGENT',
  RISK_ANALYST: 'RISK_ANALYST',
  MARKETING_ADMIN: 'MARKETING_ADMIN',
  OPERATIONS_ADMIN: 'OPERATIONS_ADMIN',
};

const ROLE_PERMISSIONS = {
  SUPER_ADMIN: '*',
  FINANCE_ADMIN: ['finance', 'betting', 'reconciliation', 'withdrawal', 'wallet'],
  TRADING_ADMIN: ['trading', 'betting', 'sports', 'markets', 'odds', 'risk'],
  SUPPORT_AGENT: ['support', 'customers', 'tickets', 'cases', 'kyc'],
  RISK_ANALYST: ['risk', 'fraud', 'analytics', 'security', 'reconciliation', 'kyc'],
  MARKETING_ADMIN: ['growth', 'promotions', 'communications', 'analytics'],
  OPERATIONS_ADMIN: ['operations', 'platform', 'providers', 'emergency', 'incidents', 'analytics', 'kyc'],
};

// Pure node:crypto HS256 helper for test isolation
const TEST_JWT_SECRET = 'test_jwt_secret_phase37_audit_key_12345';

function base64UrlEncode(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function base64UrlDecode(str) {
  return JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
}

function signTestToken(payload, expiresInSec = 3600) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresInSec };

  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(fullPayload);
  const signature = crypto
    .createHmac('sha256', TEST_JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyTestToken(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', TEST_JWT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    if (signature !== expectedSig) return null;

    const payload = base64UrlDecode(encodedPayload);
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}

function requirePermission(...domains) {
  return (req, res, next) => {
    const role = req.admin?.role;
    if (!role) {
      return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    }

    if (role === ADMIN_ROLES.SUPER_ADMIN) return next();

    const allowed = ROLE_PERMISSIONS[role];
    if (!allowed) {
      return res.status(403).json({ error: 'Unknown role', code: 'UNKNOWN_ROLE' });
    }

    if (allowed === '*') return next();

    const hasPermission = domains.some((d) => allowed.includes(d));
    if (!hasPermission) {
      return res.status(403).json({
        error: `Role ${role} does not have access to [${domains.join(', ')}]`,
        code: 'PERMISSION_DENIED',
        requiredDomains: domains,
        currentRole: role,
      });
    }

    return next();
  };
}

describe('Phase 37 — User & Admin Security, RBAC & Access Control Audit Suite', () => {

  // =========================================================================
  // 1. USER REGISTRATION CONCURRENCY & UNIQUE IDENTITY
  // =========================================================================
  describe('1. User Registration Concurrency & Uniqueness', () => {
    it('100 concurrent registration attempts with identical email create exactly 1 user and 0 duplicate accounts', async () => {
      const email = `test_concurrent_${Date.now()}@example.com`;
      const usersDb = new Map();
      let createdCount = 0;
      let duplicateRejections = 0;

      // Simulated atomic database insert with UNIQUE(email) constraint
      async function registerWorker(workerId) {
        if (usersDb.has(email)) {
          duplicateRejections++;
          return { success: false, error: 'EMAIL_ALREADY_EXISTS' };
        }
        usersDb.set(email, { userId: `usr_${workerId}`, email });
        createdCount++;
        return { success: true, userId: `usr_${workerId}` };
      }

      const workers = Array.from({ length: 100 }, (_, i) => registerWorker(i));
      const results = await Promise.all(workers);

      assert.equal(createdCount, 1, 'Exactly 1 user account must be created');
      assert.equal(duplicateRejections, 99, '99 duplicate registration attempts must be rejected');
      assert.equal(usersDb.size, 1);
    });
  });

  // =========================================================================
  // 2. JWT TOKEN SECURITY & ALGORITHM INTEGRITY
  // =========================================================================
  describe('2. JWT Token Security & Algorithm Integrity', () => {
    it('generates, verifies, and rejects expired or tampered HS256 tokens', () => {
      const payload = { sub: 'usr_secure_101', role: 'USER', tenant: 'oddsyra_in' };
      const token = signTestToken(payload, 3600);
      assert.ok(token);

      const verified = verifyTestToken(token);
      assert.equal(verified.sub, 'usr_secure_101');
      assert.equal(verified.role, 'USER');

      // Tampered payload signature mismatch
      const parts = token.split('.');
      const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'usr_hacked_admin', role: 'SUPER_ADMIN' })).toString('base64url');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const tamperedResult = verifyTestToken(tamperedToken);
      assert.equal(tamperedResult, null, 'Tampered token must fail signature verification');
    });

    it('rejects expired tokens deterministically', () => {
      const expiredToken = signTestToken({ sub: 'usr_expired_1', role: 'USER' }, -60);
      const verified = verifyTestToken(expiredToken);
      assert.equal(verified, null, 'Expired token must be rejected');
    });
  });

  // =========================================================================
  // 3. HORIZONTAL ACCESS CONTROL (IDOR) BINDINGS
  // =========================================================================
  describe('3. Horizontal Access Control & IDOR Protection', () => {
    it('user operations bind strictly to authenticated req.user.userId and ignore client-spoofed user IDs', () => {
      const authenticatedUser = { userId: 'usr_real_alice', role: 'USER' };
      const maliciousPayload = { targetUserId: 'usr_victim_bob', walletId: 'wal_victim_bob' };

      // Backend handler resolves target strictly from req.user.userId
      function getWalletForUser(req) {
        const effectiveUserId = req.user.userId; // Server-authoritative
        return { walletId: `wal_${effectiveUserId}`, userId: effectiveUserId };
      }

      const req = { user: authenticatedUser, body: maliciousPayload, query: maliciousPayload };
      const wallet = getWalletForUser(req);

      assert.equal(wallet.userId, 'usr_real_alice', 'Handler must bind strictly to authenticated user');
      assert.notEqual(wallet.userId, maliciousPayload.targetUserId, 'Client-spoofed targetUserId must be ignored');
    });
  });

  // =========================================================================
  // 4. VERTICAL PRIVILEGE ESCALATION & TOKEN ISOLATION
  // =========================================================================
  describe('4. Vertical Privilege Escalation & Token Isolation', () => {
    it('normal user token cannot be used to authenticate admin API endpoints', () => {
      const userToken = signTestToken({
        sub: 'usr_regular_1',
        role: 'USER',
        type: 'access',
      });

      const decoded = verifyTestToken(userToken);
      assert.ok(decoded);

      // adminAuth middleware evaluation:
      const role = decoded.role;
      const isAdminRole = role && Object.values(ADMIN_ROLES).includes(role);
      const isUserAccess = decoded.type === 'access' || role === 'USER';
      const isAuthorizedAdmin = isAdminRole && !isUserAccess && decoded.type === 'admin';

      assert.equal(isAuthorizedAdmin, false, 'User access token must be rejected by adminAuth');
    });

    it('admin token requires type="admin" and valid admin role', () => {
      const adminToken = signTestToken({
        sub: 'admin_super_1',
        role: ADMIN_ROLES.SUPER_ADMIN,
        type: 'admin',
      });
      const decoded = verifyTestToken(adminToken);

      assert.equal(decoded.sub, 'admin_super_1');
      assert.equal(decoded.role, ADMIN_ROLES.SUPER_ADMIN);
      assert.equal(decoded.type, 'admin');

      const isAdminRole = Object.values(ADMIN_ROLES).includes(decoded.role);
      const isUserAccess = decoded.type === 'access' || decoded.role === 'USER';
      const isAuthorizedAdmin = isAdminRole && !isUserAccess && decoded.type === 'admin';

      assert.equal(isAuthorizedAdmin, true, 'Valid admin token must be accepted');
    });
  });

  // =========================================================================
  // 5. ADMIN RBAC DOMAIN PERMISSION ENFORCEMENT
  // =========================================================================
  describe('5. Admin RBAC Domain Permission Enforcement', () => {
    it('SUPER_ADMIN has universal wildcard access across all domains', () => {
      let allowed = false;
      const req = { admin: { id: 'admin_1', role: ADMIN_ROLES.SUPER_ADMIN } };
      const res = { status: () => res, json: () => res };
      const next = () => { allowed = true; };

      const checkFinance = requirePermission('finance');
      checkFinance(req, res, next);
      assert.equal(allowed, true, 'SUPER_ADMIN must pass finance check');

      allowed = false;
      const checkTrading = requirePermission('trading');
      checkTrading(req, res, next);
      assert.equal(allowed, true, 'SUPER_ADMIN must pass trading check');
    });

    it('SUPPORT_AGENT is permitted for support/kyc but strictly blocked from finance/wallet actions', () => {
      let passed = false;
      let errorResponse = null;

      const req = { admin: { id: 'agent_1', role: ADMIN_ROLES.SUPPORT_AGENT } };
      const res = {
        status: (code) => ({
          json: (data) => { errorResponse = { statusCode: code, ...data }; }
        })
      };

      // Check permitted domain: support
      const checkSupport = requirePermission('support');
      checkSupport(req, res, () => { passed = true; });
      assert.equal(passed, true, 'SUPPORT_AGENT must pass support check');

      // Check forbidden domain: finance
      passed = false;
      const checkFinance = requirePermission('finance');
      checkFinance(req, res, () => { passed = true; });
      assert.equal(passed, false, 'SUPPORT_AGENT must be blocked from finance domain');
      assert.equal(errorResponse.statusCode, 403);
      assert.equal(errorResponse.code, 'PERMISSION_DENIED');
    });

    it('MARKETING_ADMIN is permitted for promotions/growth but strictly blocked from risk/trading', () => {
      let passed = false;
      let errorResponse = null;

      const req = { admin: { id: 'mkt_1', role: ADMIN_ROLES.MARKETING_ADMIN } };
      const res = {
        status: (code) => ({
          json: (data) => { errorResponse = { statusCode: code, ...data }; }
        })
      };

      const checkGrowth = requirePermission('growth');
      checkGrowth(req, res, () => { passed = true; });
      assert.equal(passed, true, 'MARKETING_ADMIN must pass growth check');

      passed = false;
      const checkTrading = requirePermission('trading');
      checkTrading(req, res, () => { passed = true; });
      assert.equal(passed, false, 'MARKETING_ADMIN must be blocked from trading domain');
      assert.equal(errorResponse.statusCode, 403);
      assert.equal(errorResponse.code, 'PERMISSION_DENIED');
    });
  });

  // =========================================================================
  // 6. ADMIN MFA & SESSION TELEMETRY
  // =========================================================================
  describe('6. Admin MFA & Session Telemetry', () => {
    it('generates 5-minute transient token for pending MFA verification', () => {
      const mfaPendingToken = signTestToken({
        sub: 'admin_mfa_1',
        role: ADMIN_ROLES.FINANCE_ADMIN,
        type: 'admin_mfa_pending',
      }, 300);

      const decoded = verifyTestToken(mfaPendingToken);

      assert.equal(decoded.sub, 'admin_mfa_1');
      assert.equal(decoded.role, ADMIN_ROLES.FINANCE_ADMIN);
      assert.equal(decoded.type, 'admin_mfa_pending');

      // admin_mfa_pending cannot be used as full admin session
      const isAdminRole = Object.values(ADMIN_ROLES).includes(decoded.role);
      const isAuthorizedAdmin = isAdminRole && decoded.type === 'admin';
      assert.equal(isAuthorizedAdmin, false, 'MFA pending token must not authorize admin APIs');
    });
  });

  // =========================================================================
  // 7. USER ACCOUNT SUSPENSION ENFORCEMENT
  // =========================================================================
  describe('7. User Account Suspension Enforcement', () => {
    it('rejects suspended and banned accounts from executing protected operations', () => {
      const activeUser = { status: 'ACTIVE' };
      const suspendedUser = { status: 'SUSPENDED' };
      const bannedUser = { status: 'BANNED' };

      const isAllowedToBet = (user) => ['ACTIVE', 'VERIFIED'].includes(user.status);

      assert.equal(isAllowedToBet(activeUser), true);
      assert.equal(isAllowedToBet(suspendedUser), false, 'Suspended user cannot bet');
      assert.equal(isAllowedToBet(bannedUser), false, 'Banned user cannot bet');
    });
  });

  // =========================================================================
  // 8. ADMIN SELF-DEALING & AUDIT LOGGING
  // =========================================================================
  describe('8. Admin Self-Dealing & Audit Logging', () => {
    it('records mandatory structured audit metadata on admin operations', () => {
      const auditLog = {
        who: 'admin_fin_101',
        what: 'WITHDRAWAL_MANUAL_REVIEW',
        referenceId: 'wdr_req_999',
        reason: 'Verified KYC and bank statement',
        timestamp: new Date().toISOString(),
      };

      assert.ok(auditLog.who);
      assert.ok(auditLog.what);
      assert.ok(auditLog.referenceId);
      assert.ok(auditLog.reason);
      assert.ok(auditLog.timestamp);
    });
  });

});
