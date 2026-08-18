import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  signup,
  login,
  logout,
  forgotPassword,
  resetPassword,
  verifyEmail,
  getMe,
} from '../../server/auth/authService.js';
import {
  generateAccessToken,
  verifyAccessToken,
  rotateRefreshToken,
} from '../../server/auth/tokenService.js';
import { hashPassword } from '../../server/auth/passwordHasher.js';

describe('Auth Service & Endpoints Test Suite', () => {
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
      email_verification_tokens: [],
      user_security_audit_logs: [],
    };

    mockQuery = vi.fn(async (text, params = []) => {
      const sql = text.trim();

      // SELECT FROM users WHERE email = $1
      if (sql.startsWith('SELECT user_id FROM users WHERE email = $1') || sql.includes('lower(email) = $1')) {
        const email = params[0];
        const exclude = params[1];
        const rows = mockDb.users
          .filter((u) => u.email === email && (!exclude || u.user_id !== exclude))
          .map((u) => ({ user_id: u.user_id }));
        return { rows, rowCount: rows.length };
      }

      if (sql.includes('right(regexp_replace(phone')) {
        const digits = params[0];
        const exclude = params[1];
        const rows = mockDb.users
          .filter((u) => {
            const last10 = String(u.phone || '').replace(/\D/g, '').slice(-10);
            return last10 === digits && (!exclude || u.user_id !== exclude);
          })
          .map((u) => ({ user_id: u.user_id }));
        return { rows, rowCount: rows.length };
      }

      // SELECT user for login
      if (sql.includes('FROM users WHERE email = $1')) {
        const email = params[0];
        const rows = mockDb.users.filter(u => u.email === email);
        return { rows, rowCount: rows.length };
      }

      // SELECT user by user_id
      if (sql.includes('FROM users WHERE user_id = $1')) {
        const userId = params[0];
        const rows = mockDb.users.filter(u => u.user_id === userId);
        return { rows, rowCount: rows.length };
      }

      // SELECT user for getMe
      if (sql.includes('FROM users u') && sql.includes('WHERE u.user_id = $1')) {
        const userId = params[0];
        const u = mockDb.users.find(usr => usr.user_id === userId);
        if (!u) return { rows: [], rowCount: 0 };
        const p = mockDb.user_profiles.find(prof => prof.user_id === userId) || {};
        const w = mockDb.wallets.find(wal => wal.user_id === userId) || {};
        return {
          rows: [{
            ...u,
            display_name: p.display_name,
            kyc_status: p.kyc_status || 'NOT_STARTED',
            risk_tier: p.risk_tier || 'LOW_RISK',
            account_status: p.account_status || 'ACTIVE',
            balance: w.balance || 0,
            bonus_balance: w.bonus_balance || 0,
          }],
          rowCount: 1,
        };
      }

      // UPDATE users failed_login_attempts / locked_until
      if (sql.startsWith('UPDATE users SET failed_login_attempts')) {
        const attempts = params[0];
        const userId = params[params.length - 1];
        const user = mockDb.users.find(u => u.user_id === userId);
        if (user) {
          user.failed_login_attempts = attempts;
          if (params.length === 3) {
            user.locked_until = params[1];
          }
        }
        return { rowCount: 1 };
      }

      // UPDATE users reset login on success
      if (sql.startsWith('UPDATE users SET failed_login_attempts = 0')) {
        const userId = params[0];
        const user = mockDb.users.find(u => u.user_id === userId);
        if (user) {
          user.failed_login_attempts = 0;
          user.locked_until = null;
          user.last_login_at = new Date();
        }
        return { rowCount: 1 };
      }

      // UPDATE users password_hash
      if (sql.includes('UPDATE users') && sql.includes('password_hash')) {
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

      // UPDATE users email_verified_at
      if (sql.startsWith('UPDATE users SET email_verified_at = NOW()')) {
        const userId = params[0];
        const user = mockDb.users.find(u => u.user_id === userId);
        if (user) {
          user.email_verified_at = new Date();
        }
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

      // UPDATE refresh_tokens SET revoked_at
      if (sql.includes('UPDATE refresh_tokens') && sql.includes('revoked_at')) {
        const hashOrUserId = params[0];
        mockDb.refresh_tokens.forEach(rt => {
          if (rt.token_hash === hashOrUserId || rt.user_id === hashOrUserId) {
            rt.revoked_at = new Date();
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
        });
        return { rowCount: 1 };
      }

      // SELECT password_reset_tokens
      if (sql.includes('FROM password_reset_tokens')) {
        const hash = params[0];
        const rows = mockDb.password_reset_tokens.filter(pr => pr.token_hash === hash);
        return { rows, rowCount: rows.length };
      }

      // UPDATE password_reset_tokens (Atomic Claiming & Revocation)
      if (sql.startsWith('UPDATE password_reset_tokens')) {
        if (sql.includes('WHERE token_hash = $1') && sql.includes('AND used_at IS NULL')) {
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

        const idOrUserId = params[0];
        mockDb.password_reset_tokens.forEach(pr => {
          if (pr.id === idOrUserId || pr.user_id === idOrUserId) {
            pr.used_at = new Date();
          }
        });
        return { rowCount: 1 };
      }

      // INSERT INTO email_verification_tokens
      if (sql.startsWith('INSERT INTO email_verification_tokens')) {
        mockDb.email_verification_tokens.push({
          id: mockDb.email_verification_tokens.length + 1,
          token_hash: params[0],
          user_id: params[1],
          expires_at: params[2],
          used_at: null,
        });
        return { rowCount: 1 };
      }

      // SELECT email_verification_tokens
      if (sql.includes('FROM email_verification_tokens')) {
        const hash = params[0];
        const rows = mockDb.email_verification_tokens.filter(ev => ev.token_hash === hash);
        return { rows, rowCount: rows.length };
      }

      // UPDATE email_verification_tokens
      if (sql.startsWith('UPDATE email_verification_tokens SET used_at')) {
        const id = params[0];
        const ev = mockDb.email_verification_tokens.find(e => e.id === id);
        if (ev) ev.used_at = new Date();
        return { rowCount: 1 };
      }

      // INSERT INTO user_security_audit_logs
      if (sql.startsWith('INSERT INTO user_security_audit_logs')) {
        mockDb.user_security_audit_logs.push({
          user_id: params[0],
          actor_id: params[1],
          action: params[2],
          ip_address: params[3],
          details: params[4],
        });
        return { rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    });

    mockWithTransaction = vi.fn(async (cb) => {
      const mockClient = {
        query: vi.fn(async (text, params = []) => {
          if (text.includes('INSERT INTO users')) {
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
          }
          if (text.includes('INSERT INTO user_profiles')) {
            mockDb.user_profiles.push({
              user_id: params[0],
              display_name: params[1],
              account_status: 'ACTIVE',
            });
          }
          if (text.includes('INSERT INTO wallets')) {
            mockDb.wallets.push({
              wallet_id: params[0],
              user_id: params[1],
              balance: 0.00,
              bonus_balance: 0.00,
              currency: params[2],
            });
          }
          return { rowCount: 1 };
        }),
      };
      return cb(mockClient);
    });
  });

  describe('User Signup Flow', () => {
    it('should successfully register a new user and create wallet & verification token', async () => {
      const result = await signup(mockQuery, mockWithTransaction, {
        email: 'virat.kohli@oddsyra.com',
        password: 'SuperSecurePassword2026!',
        firstName: 'Virat',
        lastName: 'Kohli',
        phone: '+919876543210',
      });

      expect(result.success).toBe(true);
      expect(result.userId).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.emailVerificationToken).toBeDefined();

      expect(mockDb.users.length).toBe(1);
      expect(mockDb.users[0].email).toBe('virat.kohli@oddsyra.com');
      expect(mockDb.users[0].password_hash.startsWith('scrypt:')).toBe(true);

      expect(mockDb.wallets.length).toBe(1);
      expect(mockDb.email_verification_tokens.length).toBe(1);
    });

    it('should reject signup with invalid email format', async () => {
      const result = await signup(mockQuery, mockWithTransaction, {
        email: 'invalid_email_format',
        password: 'SuperSecurePassword2026!',
        firstName: 'Test',
      });

      expect(result.error).toBeDefined();
      expect(result.code).toBe('INVALID_EMAIL');
      expect(mockDb.users.length).toBe(0);
    });

    it('should reject signup with weak password (< 8 characters)', async () => {
      const result = await signup(mockQuery, mockWithTransaction, {
        email: 'test@oddsyra.com',
        password: 'short',
        firstName: 'Test',
      });

      expect(result.error).toBeDefined();
      expect(result.code).toBe('WEAK_PASSWORD');
    });

    it('should reject duplicate email as already linked', async () => {
      await signup(mockQuery, mockWithTransaction, {
        email: 'duplicate@oddsyra.com',
        password: 'Password123!',
        firstName: 'Original',
      });

      const dupResult = await signup(mockQuery, mockWithTransaction, {
        email: 'duplicate@oddsyra.com',
        password: 'AnotherPassword123!',
        firstName: 'Duplicate',
      });

      expect(dupResult.error).toMatch(/already linked to another account/i);
      expect(dupResult.code).toBe('DUPLICATE_EMAIL');
      expect(mockDb.users.length).toBe(1);
    });

    it('should reject duplicate mobile number as already linked', async () => {
      await signup(mockQuery, mockWithTransaction, {
        email: 'first@oddsyra.com',
        password: 'Password123!',
        firstName: 'First',
        phone: '9876543210',
      });

      const dupResult = await signup(mockQuery, mockWithTransaction, {
        email: 'second@oddsyra.com',
        password: 'Password123!',
        firstName: 'Second',
        phone: '+91 98765 43210',
      });

      expect(dupResult.error).toMatch(/already linked to another account/i);
      expect(dupResult.code).toBe('DUPLICATE_PHONE');
      expect(mockDb.users.length).toBe(1);
    });
  });

  describe('User Login Flow & Lockout Protection', () => {
    beforeEach(async () => {
      await signup(mockQuery, mockWithTransaction, {
        email: 'player@oddsyra.com',
        password: 'ValidPassword123!',
        firstName: 'Rohit',
        lastName: 'Sharma',
      });
    });

    it('should log in successfully with valid credentials and return tokens', async () => {
      const res = await login(mockQuery, {
        email: 'player@oddsyra.com',
        password: 'ValidPassword123!',
        ip: '127.0.0.1',
      });

      expect(res.success).toBe(true);
      expect(res.accessToken).toBeDefined();
      expect(res.refreshToken).toBeDefined();
      expect(res.user.displayName).toBe('Rohit Sharma');
      expect(res.user.email).toBe('player@oddsyra.com');
    });

    it('should fail on incorrect password with generic error message', async () => {
      const res = await login(mockQuery, {
        email: 'player@oddsyra.com',
        password: 'WrongPassword!',
        ip: '127.0.0.1',
      });

      expect(res.error).toBe('Invalid email or password.');
      expect(res.code).toBe('INVALID_CREDENTIALS');
      expect(mockDb.users[0].failed_login_attempts).toBe(1);
    });

    it('should lock account after 5 consecutive failed login attempts', async () => {
      for (let i = 1; i <= 4; i++) {
        await login(mockQuery, {
          email: 'player@oddsyra.com',
          password: 'BadPassword',
          ip: '10.0.0.1',
        });
      }

      expect(mockDb.users[0].failed_login_attempts).toBe(4);
      expect(mockDb.users[0].locked_until).toBeNull();

      // 5th attempt triggers lockout
      const lockRes = await login(mockQuery, {
        email: 'player@oddsyra.com',
        password: 'BadPassword',
        ip: '10.0.0.1',
      });

      expect(lockRes.code).toBe('INVALID_CREDENTIALS');
      expect(mockDb.users[0].failed_login_attempts).toBe(5);
      expect(mockDb.users[0].locked_until).toBeDefined();

      // Subsequent attempt blocked with ACCOUNT_LOCKED (423)
      const blockedRes = await login(mockQuery, {
        email: 'player@oddsyra.com',
        password: 'ValidPassword123!',
        ip: '10.0.0.1',
      });

      expect(blockedRes.code).toBe('ACCOUNT_LOCKED');
      expect(blockedRes.status).toBe(423);
    });
  });

  describe('Password Reset & Email Verification Flows', () => {
    let userId;

    beforeEach(async () => {
      const res = await signup(mockQuery, mockWithTransaction, {
        email: 'reset.user@oddsyra.com',
        password: 'InitialPassword123!',
        firstName: 'Hardik',
        lastName: 'Pandya',
      });
      userId = res.userId;
    });

    it('should generate password reset token and successfully update password', async () => {
      const forgotRes = await forgotPassword(mockQuery, 'reset.user@oddsyra.com', '127.0.0.1');
      expect(forgotRes.success).toBe(true);
      expect(forgotRes.resetToken).toBeDefined();

      const resetRes = await resetPassword(mockQuery, forgotRes.resetToken, 'BrandNewPassword2026!');
      expect(resetRes.success).toBe(true);

      // Verify login works with new password
      const loginRes = await login(mockQuery, {
        email: 'reset.user@oddsyra.com',
        password: 'BrandNewPassword2026!',
      });
      expect(loginRes.success).toBe(true);

      // Verify old password is now rejected
      const oldLoginRes = await login(mockQuery, {
        email: 'reset.user@oddsyra.com',
        password: 'InitialPassword123!',
      });
      expect(oldLoginRes.error).toBeDefined();
    });

    it('should verify email successfully using verification token', async () => {
      const signupRes = await signup(mockQuery, mockWithTransaction, {
        email: 'verify.me@oddsyra.com',
        password: 'Password123!',
        firstName: 'Jasprit',
      });

      const token = signupRes.emailVerificationToken;
      expect(token).toBeDefined();

      const verifyRes = await verifyEmail(mockQuery, token);
      expect(verifyRes.success).toBe(true);

      const user = mockDb.users.find(u => u.email === 'verify.me@oddsyra.com');
      expect(user.email_verified_at).toBeDefined();
    });
  });

  describe('JWT and Refresh Token Lifecycle', () => {
    it('should generate valid JWT access token and verify signature', () => {
      const token = generateAccessToken('usr_12345', 'USER', 'oddsyra_in');
      const payload = verifyAccessToken(token);

      expect(payload).toBeDefined();
      expect(payload.sub).toBe('usr_12345');
      expect(payload.role).toBe('USER');
      expect(payload.type).toBe('access');
    });

    it('should reject tampered JWT tokens', () => {
      const token = generateAccessToken('usr_12345', 'USER');
      const tampered = token.slice(0, -4) + 'abcd';
      expect(verifyAccessToken(tampered)).toBeNull();
    });
  });
});
