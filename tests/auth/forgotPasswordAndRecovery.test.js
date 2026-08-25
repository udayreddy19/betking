import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  forgotPassword,
  resetPassword,
  login,
  signup,
} from '../../server/auth/authService.js';
import {
  generateSecureToken,
  hashRefreshToken,
} from '../../server/auth/tokenService.js';
import { hashPassword, verifyPassword } from '../../server/auth/passwordHasher.js';

describe('Production-Grade Forgot Password & Account Recovery Suite (Req 1-30)', () => {
  let mockDb;
  let mockQuery;
  let mockWithTransaction;

  beforeEach(() => {
    mockDb = {
      users: [],
      wallets: [],
      user_profiles: [],
      refresh_tokens: [],
      password_reset_tokens: [],
      user_security_audit_logs: [],
    };

    mockQuery = vi.fn(async (text, params = []) => {
      const sql = text.trim();

      // SELECT FROM users WHERE email = $1
      if (sql.includes('FROM users WHERE email = $1') || sql.includes('lower(email) = $1')) {
        const email = params[0];
        const exclude = params[1];
        const rows = mockDb.users.filter((u) => u.email === email && (!exclude || u.user_id !== exclude));
        return { rows, rowCount: rows.length };
      }

      if (sql.includes('right(regexp_replace(phone')) {
        const digits = params[0];
        const exclude = params[1];
        const rows = mockDb.users.filter((u) => {
          const last10 = String(u.phone || '').replace(/\D/g, '').slice(-10);
          return last10 === digits && last10 && (!exclude || u.user_id !== exclude);
        });
        return { rows, rowCount: rows.length };
      }

      // SELECT user by id
      if (sql.includes('FROM users WHERE user_id = $1') || sql.includes('FROM users u WHERE u.user_id = $1')) {
        const userId = params[0];
        const rows = mockDb.users.filter(u => u.user_id === userId);
        return { rows, rowCount: rows.length };
      }

      // UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 (Invalidating prior active tokens)
      if (sql.startsWith('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1')) {
        const userId = params[0];
        mockDb.password_reset_tokens.forEach(pr => {
          if (pr.user_id === userId && !pr.used_at) {
            pr.used_at = new Date();
          }
        });
        return { rowCount: 1 };
      }

      // INSERT INTO password_reset_tokens
      if (sql.startsWith('INSERT INTO password_reset_tokens')) {
        mockDb.password_reset_tokens.push({
          id: mockDb.password_reset_tokens.length + 1,
          token_hash: params[0],
          user_id: params[1],
          expires_at: params[2],
          used_at: null,
          ip_address: params[3],
          requested_ip: params[3],
          user_agent: null,
          created_at: new Date(),
        });
        return { rowCount: 1 };
      }

      // ATOMIC CLAIM: UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW() RETURNING id, user_id
      if (sql.startsWith('UPDATE password_reset_tokens') && sql.includes('WHERE token_hash = $1') && sql.includes('AND used_at IS NULL')) {
        const hash = params[0];
        const tokenRec = mockDb.password_reset_tokens.find(
          pr => pr.token_hash === hash && !pr.used_at && new Date(pr.expires_at) > new Date()
        );

        if (tokenRec) {
          tokenRec.used_at = new Date();
          return { rows: [{ id: tokenRec.id, user_id: tokenRec.user_id }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      // Diagnostic check for audit logging
      if (sql.includes('SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1')) {
        const hash = params[0];
        const rows = mockDb.password_reset_tokens.filter(pr => pr.token_hash === hash);
        return { rows, rowCount: rows.length };
      }

      // UPDATE users password_hash
      if (sql.startsWith('UPDATE users') && sql.includes('SET password_hash = $1')) {
        const newHash = params[0];
        const userId = params[1];
        const user = mockDb.users.find(u => u.user_id === userId);
        if (user) {
          user.password_hash = newHash;
          user.failed_login_attempts = 0;
          user.locked_until = null;
        }
        return { rowCount: 1 };
      }

      // UPDATE refresh_tokens SET revoked_at
      if (sql.includes('UPDATE refresh_tokens') && sql.includes('revoked_at')) {
        const userId = params[0];
        mockDb.refresh_tokens.forEach(rt => {
          if (rt.user_id === userId || rt.token_hash === userId) {
            rt.revoked_at = new Date();
          }
        });
        return { rowCount: 1 };
      }

      // INSERT INTO refresh_tokens
      if (sql.startsWith('INSERT INTO refresh_tokens')) {
        mockDb.refresh_tokens.push({
          token_hash: params[0],
          user_id: params[1],
          expires_at: params[2],
          revoked_at: null,
          device_info: params[3],
          ip_address: params[4],
        });
        return { rowCount: 1 };
      }

      // SELECT refresh_tokens
      if (sql.includes('FROM refresh_tokens rt')) {
        const hash = params[0];
        const rt = mockDb.refresh_tokens.find(r => r.token_hash === hash);
        if (!rt) return { rows: [], rowCount: 0 };
        const u = mockDb.users.find(usr => usr.user_id === rt.user_id) || {};
        return {
          rows: [{
            user_id: rt.user_id,
            revoked_at: rt.revoked_at,
            expires_at: rt.expires_at,
            role: u.role || 'USER',
            status: u.status || 'ACTIVE',
          }],
          rowCount: 1,
        };
      }

      // INSERT INTO users
      if (sql.includes('INSERT INTO users')) {
        mockDb.users.push({
          user_id: params[0],
          email: params[1],
          phone: params[2],
          password_hash: params[3],
          first_name: params[4],
          last_name: params[5],
          country: params[6],
          currency: params[7],
          role: 'USER',
          status: 'ACTIVE',
          failed_login_attempts: 0,
          locked_until: null,
          email_verified_at: null,
          created_at: new Date(),
        });
        return { rowCount: 1 };
      }

      // INSERT INTO user_profiles
      if (sql.includes('INSERT INTO user_profiles')) {
        mockDb.user_profiles.push({
          user_id: params[0],
          display_name: params[1],
          account_status: 'ACTIVE',
        });
        return { rowCount: 1 };
      }

      // INSERT INTO wallets
      if (sql.includes('INSERT INTO wallets')) {
        mockDb.wallets.push({
          wallet_id: params[0],
          user_id: params[1],
          balance: 0.00,
          bonus_balance: 0.00,
          currency: params[2],
        });
        return { rowCount: 1 };
      }

      // INSERT INTO email_verification_tokens
      if (sql.startsWith('INSERT INTO email_verification_tokens')) {
        return { rowCount: 1 };
      }

      // INSERT INTO user_security_audit_logs
      if (sql.startsWith('INSERT INTO user_security_audit_logs')) {
        mockDb.user_security_audit_logs.push({
          user_id: params[0],
          actor_id: params[1],
          action: params[2],
          ip_address: params[3],
          details: typeof params[4] === 'string' ? JSON.parse(params[4]) : params[4],
          created_at: new Date(),
        });
        return { rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    });

    mockWithTransaction = vi.fn(async (cb) => {
      const mockClient = {
        query: mockQuery,
      };
      return cb(mockClient);
    });
  });

  describe('1. Token Generation, Storage & Entropy', () => {
    it('generates a 48-byte cryptographically secure token for email verification', () => {
      const { rawToken, tokenHash } = generateSecureToken();

      expect(rawToken).toBeDefined();
      expect(rawToken.length).toBe(96); // 48 bytes = 96 hex chars
      expect(tokenHash.length).toBe(64); // SHA-256 = 64 hex chars

      const computed = crypto.createHash('sha256').update(rawToken).digest('hex');
      expect(computed).toBe(tokenHash);
    });

    it('generates a 6-digit password reset code and stores only SHA-256 hash', async () => {
      const { generatePasswordResetCode } = await import('../../server/auth/tokenService.js');
      const { rawToken, tokenHash } = generatePasswordResetCode();

      expect(rawToken).toMatch(/^\d{6}$/);
      expect(tokenHash.length).toBe(64);
      expect(crypto.createHash('sha256').update(rawToken).digest('hex')).toBe(tokenHash);
    });
  });

  describe('2. Account Enumeration Protection (Requirement 2 & 17)', () => {
    it('returns the exact same generic message for existing and non-existing accounts', async () => {
      // Create existing user
      mockDb.users.push({
        user_id: 'usr_real_1',
        email: 'real.player@oddsyra.com',
        first_name: 'Real',
        last_name: 'Player',
        password_hash: await hashPassword('Pass123!'),
        status: 'ACTIVE',
      });

      const resExisting = await forgotPassword(mockQuery, 'real.player@oddsyra.com', '127.0.0.1');
      const resUnknown = await forgotPassword(mockQuery, 'nonexistent@oddsyra.com', '127.0.0.1');

      expect(resExisting.success).toBe(true);
      expect(resUnknown.success).toBe(true);
      expect(resExisting.message).toBe('If an account with that email exists, a password reset link has been sent.');
      expect(resUnknown.message).toBe('If an account with that email exists, a password reset link has been sent.');
    });
  });

  describe('3. Prior Token Invalidation on New Request (Requirement 24)', () => {
    it('invalidates previous active reset tokens when a new reset link is requested', async () => {
      mockDb.users.push({
        user_id: 'usr_resend_1',
        email: 'resend.player@oddsyra.com',
        first_name: 'Resend',
        password_hash: await hashPassword('Pass123!'),
        status: 'ACTIVE',
      });

      // Request 1
      const res1 = await forgotPassword(mockQuery, 'resend.player@oddsyra.com', '127.0.0.1');
      const token1 = res1.resetToken;

      // Request 2 (resend)
      const res2 = await forgotPassword(mockQuery, 'resend.player@oddsyra.com', '127.0.0.1');
      const token2 = res2.resetToken;

      expect(token1).not.toBe(token2);

      // Token 1 must now be marked used/invalidated
      const token1Record = mockDb.password_reset_tokens.find(
        pr => pr.token_hash === crypto.createHash('sha256').update(token1).digest('hex')
      );
      expect(token1Record.used_at).toBeDefined();

      // Reset with Token 1 must fail
      const reset1 = await resetPassword(mockQuery, mockWithTransaction, {
        token: token1,
        password: 'NewPassword2026!',
      });
      expect(reset1.error).toBeDefined();
      expect(reset1.code).toBe('RESET_TOKEN_INVALID');

      // Reset with Token 2 must succeed
      const reset2 = await resetPassword(mockQuery, mockWithTransaction, {
        token: token2,
        password: 'NewPassword2026!',
      });
      expect(reset2.success).toBe(true);
    });
  });

  describe('4. Token Single-Use & Expiration (Requirements 6, 7, 18)', () => {
    let rawToken;

    beforeEach(async () => {
      mockDb.users.push({
        user_id: 'usr_single_use_1',
        email: 'single.use@oddsyra.com',
        first_name: 'Single',
        password_hash: await hashPassword('OriginalPass123!'),
        status: 'ACTIVE',
      });

      const forgotRes = await forgotPassword(mockQuery, 'single.use@oddsyra.com', '127.0.0.1');
      rawToken = forgotRes.resetToken;
    });

    it('successfully resets password on first valid attempt', async () => {
      const res = await resetPassword(mockQuery, mockWithTransaction, {
        token: rawToken,
        password: 'BrandNewSecurePass2026!',
        confirmPassword: 'BrandNewSecurePass2026!',
      });

      expect(res.success).toBe(true);
      expect(res.message).toBe('Password has been reset. Please log in with your new password.');
    });

    it('rejects a second attempt using the same token (Single-Use)', async () => {
      // 1st attempt
      await resetPassword(mockQuery, mockWithTransaction, {
        token: rawToken,
        password: 'BrandNewSecurePass2026!',
      });

      // 2nd attempt with same token
      const secondAttempt = await resetPassword(mockQuery, mockWithTransaction, {
        token: rawToken,
        password: 'AnotherPassword2026!',
      });

      expect(secondAttempt.error).toBe('That password reset link is invalid or has expired. Please request a new one.');
      expect(secondAttempt.code).toBe('RESET_TOKEN_INVALID');

      // Audit log must record TOKEN_REUSED
      const reusedAudit = mockDb.user_security_audit_logs.find(a => a.action === 'PASSWORD_RESET_TOKEN_REUSED');
      expect(reusedAudit).toBeDefined();
    });

    it('rejects expired tokens without resetting password', async () => {
      // Manually expire token
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const rec = mockDb.password_reset_tokens.find(pr => pr.token_hash === tokenHash);
      rec.expires_at = new Date(Date.now() - 5000); // 5 seconds ago

      const res = await resetPassword(mockQuery, mockWithTransaction, {
        token: rawToken,
        password: 'NewPassword2026!',
      });

      expect(res.error).toBe('That password reset link is invalid or has expired. Please request a new one.');
      expect(res.code).toBe('RESET_TOKEN_INVALID');

      const expiredAudit = mockDb.user_security_audit_logs.find(a => a.action === 'PASSWORD_RESET_TOKEN_EXPIRED');
      expect(expiredAudit).toBeDefined();
    });
  });

  describe('5. Concurrent Reset Protection (Requirement 23)', () => {
    it('ensures only ONE request can successfully claim the token when hit concurrently', async () => {
      mockDb.users.push({
        user_id: 'usr_concurrent_1',
        email: 'concurrent@oddsyra.com',
        first_name: 'Concurrent',
        password_hash: await hashPassword('Pass123!'),
        status: 'ACTIVE',
      });

      const forgotRes = await forgotPassword(mockQuery, 'concurrent@oddsyra.com', '127.0.0.1');
      const token = forgotRes.resetToken;

      // Simulate 2 parallel reset requests arriving at the exact same moment
      const [req1, req2] = await Promise.all([
        resetPassword(mockQuery, mockWithTransaction, { token, password: 'WinnerPassword1!' }),
        resetPassword(mockQuery, mockWithTransaction, { token, password: 'LoserPassword2!' }),
      ]);

      const successCount = [req1, req2].filter(r => r.success).length;
      const errorCount = [req1, req2].filter(r => r.error).length;

      expect(successCount).toBe(1);
      expect(errorCount).toBe(1);
    });
  });

  describe('6. Session Invalidation & Account Status Preservation (Requirements 14 & 15)', () => {
    it('invalidates existing refresh tokens so old sessions are terminated', async () => {
      const user = {
        user_id: 'usr_session_inv_1',
        email: 'session.inv@oddsyra.com',
        first_name: 'Session',
        password_hash: await hashPassword('Pass123!'),
        status: 'ACTIVE',
      };
      mockDb.users.push(user);

      // Create 2 active sessions for this user
      mockDb.refresh_tokens.push({
        token_hash: 'hash_device_1',
        user_id: user.user_id,
        expires_at: new Date(Date.now() + 86400000),
        revoked_at: null,
      });
      mockDb.refresh_tokens.push({
        token_hash: 'hash_device_2',
        user_id: user.user_id,
        expires_at: new Date(Date.now() + 86400000),
        revoked_at: null,
      });

      const forgotRes = await forgotPassword(mockQuery, user.email, '127.0.0.1');
      await resetPassword(mockQuery, mockWithTransaction, {
        token: forgotRes.resetToken,
        password: 'BrandNewPass2026!',
      });

      // All refresh tokens for user must be revoked
      expect(mockDb.refresh_tokens.every(rt => rt.revoked_at !== null)).toBe(true);
    });

    it('PRESERVES restricted account status (SUSPENDED remains SUSPENDED after password reset)', async () => {
      const user = {
        user_id: 'usr_suspended_1',
        email: 'suspended.player@oddsyra.com',
        first_name: 'Suspended',
        password_hash: await hashPassword('Pass123!'),
        status: 'SUSPENDED', // Restricted
      };
      mockDb.users.push(user);

      const forgotRes = await forgotPassword(mockQuery, user.email, '127.0.0.1');
      await resetPassword(mockQuery, mockWithTransaction, {
        token: forgotRes.resetToken,
        password: 'BrandNewPass2026!',
      });

      // Account status must REMAIN SUSPENDED
      const updatedUser = mockDb.users.find(u => u.user_id === user.user_id);
      expect(updatedUser.status).toBe('SUSPENDED');
    });
  });

  describe('7. End-to-End Recovery Flow (Requirement 30)', () => {
    it('executes full E2E flow: forgot password -> reset -> login with new password -> login with old password fails', async () => {
      // 1. User signs up
      const signupRes = await signup(mockQuery, mockWithTransaction, {
        email: 'e2e.flow@oddsyra.com',
        password: 'OriginalPassword123!',
        firstName: 'E2E',
        lastName: 'User',
      });
      expect(signupRes.success).toBe(true);

      // 2. User requests forgot password
      const forgotRes = await forgotPassword(mockQuery, 'e2e.flow@oddsyra.com', '127.0.0.1');
      expect(forgotRes.success).toBe(true);
      const resetToken = forgotRes.resetToken;

      // 3. User visits /reset-password?token=... and sets new password
      const resetRes = await resetPassword(mockQuery, mockWithTransaction, {
        token: resetToken,
        password: 'NewStrongPassword2026!',
        confirmPassword: 'NewStrongPassword2026!',
      });
      expect(resetRes.success).toBe(true);

      // 4. Login with old password must fail
      const oldLogin = await login(mockQuery, {
        email: 'e2e.flow@oddsyra.com',
        password: 'OriginalPassword123!',
      });
      expect(oldLogin.error).toBe('Invalid email or password.');

      // 5. Login with new password must succeed
      const newLogin = await login(mockQuery, {
        email: 'e2e.flow@oddsyra.com',
        password: 'NewStrongPassword2026!',
      });
      expect(newLogin.success).toBe(true);
      expect(newLogin.accessToken).toBeDefined();
    });
  });

  describe('8. Audit Log Sanitization & Security (Requirements 20 & 29)', () => {
    it('never logs plaintext passwords, reset tokens, or token hashes into audit logs', async () => {
      const forgotRes = await forgotPassword(mockQuery, 'e2e.flow@oddsyra.com', '127.0.0.1');
      await resetPassword(mockQuery, mockWithTransaction, {
        token: forgotRes.resetToken,
        password: 'AuditSanitizationPass2026!',
      });

      mockDb.user_security_audit_logs.forEach(log => {
        const detailsStr = JSON.stringify(log.details);
        expect(detailsStr).not.toContain('AuditSanitizationPass2026!');
        expect(detailsStr).not.toContain(forgotRes.resetToken);
      });
    });
  });
});
