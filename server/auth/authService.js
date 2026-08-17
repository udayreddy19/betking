/**
 * Auth Service — BetKing Authentication
 *
 * Core business logic for signup, login, logout, password reset,
 * email verification, and session management.
 *
 * NEVER logs: passwords, password hashes, reset tokens, OTP values, auth secrets.
 */

import crypto from 'crypto';
import { hashPassword, verifyPassword } from './passwordHasher.js';
import {
  generateAccessToken,
  generateRefreshToken,
  storeRefreshToken,
  revokeSingleToken,
  revokeAllUserTokens,
  generateSecureToken,
} from './tokenService.js';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedNotificationEmail,
} from './emailService.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;
const PASSWORD_RESET_EXPIRY_MINUTES = parseInt(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES) || 30;
const EMAIL_VERIFICATION_EXPIRY_HOURS = 24;
const MIN_PASSWORD_LENGTH = 8;

/**
 * Sign up a new user.
 * @param {Function} queryFn — db query function
 * @param {Function} withTransaction — transaction wrapper
 * @param {object} data — { email, password, firstName, lastName, phone, country, currency }
 * @returns {Promise<object>} — { success, userId, token, refreshToken } or { error, code }
 */
export async function signup(queryFn, withTransaction, data) {
  const { email, password, firstName, lastName, phone, country, currency } = data;

  // ── Validation ──
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { error: 'A valid email address is required.', code: 'INVALID_EMAIL', status: 400 };
  }

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, code: 'WEAK_PASSWORD', status: 400 };
  }

  const trimmedFirstName = String(firstName || '').trim();
  const trimmedLastName = String(lastName || '').trim();
  if (!trimmedFirstName) {
    return { error: 'First name is required.', code: 'MISSING_NAME', status: 400 };
  }

  // ── Check existing user ──
  const existing = await queryFn('SELECT user_id FROM users WHERE email = $1', [normalizedEmail]);
  if (existing.rows.length > 0) {
    // Generic message — do not reveal whether email exists
    return { error: 'Unable to create account. Please try again or contact support.', code: 'SIGNUP_FAILED', status: 400 };
  }

  // ── Hash password ──
  const passwordHash = await hashPassword(password);
  const userId = `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const walletId = `wal_${userId}`;

  // ── Create user + wallet + profile in a transaction ──
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO users (user_id, email, phone, password_hash, first_name, last_name, country, currency, role, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'USER', 'ACTIVE')`,
      [
        userId,
        normalizedEmail,
        phone?.trim() || null,
        passwordHash,
        trimmedFirstName,
        trimmedLastName || null,
        country || 'India',
        currency || 'INR',
      ]
    );

    await client.query(
      `INSERT INTO user_profiles (user_id, display_name, account_status)
       VALUES ($1, $2, 'ACTIVE')
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, `${trimmedFirstName}${trimmedLastName ? ' ' + trimmedLastName : ''}`]
    );

    await client.query(
      `INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, currency)
       VALUES ($1, $2, 0.00, 0.00, $3)
       ON CONFLICT (user_id) DO NOTHING`,
      [walletId, userId, currency || 'INR']
    );
  });

  // ── Generate tokens ──
  const accessToken = generateAccessToken(userId, 'USER');
  const { rawToken: refreshToken, tokenHash } = generateRefreshToken();
  await storeRefreshToken(queryFn, {
    tokenHash,
    userId,
    deviceInfo: data.deviceInfo || {},
    ipAddress: data.ipAddress || null,
  });

  // ── Generate email verification token ──
  const { rawToken: verifyToken, tokenHash: verifyHash } = generateSecureToken();
  const verifyExpiry = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000);
  await queryFn(
    `INSERT INTO email_verification_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
    [verifyHash, userId, verifyExpiry]
  );

  // ── Audit log ──
  await safeAuditLog(queryFn, userId, userId, 'USER_SIGNUP', {
    email: normalizedEmail,
    ip: data.ipAddress,
  });

  // ── Dispatch Verification Email ──
  const emailRes = await sendVerificationEmail({
    email: normalizedEmail,
    name: `${trimmedFirstName}${trimmedLastName ? ' ' + trimmedLastName : ''}`,
    token: verifyToken,
  });

  return {
    success: true,
    userId,
    email: normalizedEmail,
    displayName: `${trimmedFirstName}${trimmedLastName ? ' ' + trimmedLastName : ''}`,
    accessToken,
    refreshToken,
    verifyLink: emailRes.verifyLink,
    emailVerificationToken: verifyToken,
  };
}

/**
 * Log in an existing user.
 * @param {Function} queryFn
 * @param {object} data — { email, password, ip, userAgent }
 * @returns {Promise<object>}
 */
export async function login(queryFn, data) {
  const { email, password, ip, userAgent } = data;
  const normalizedEmail = String(email || '').trim().toLowerCase();

  // Generic error message — do not reveal whether email exists or password is wrong
  const GENERIC_AUTH_ERROR = 'Invalid email or password.';

  if (!normalizedEmail || !password) {
    return { error: GENERIC_AUTH_ERROR, code: 'INVALID_CREDENTIALS', status: 401 };
  }

  // ── Fetch user ──
  const result = await queryFn(
    `SELECT user_id, email, phone, password_hash, first_name, last_name,
            role, status, failed_login_attempts, locked_until,
            email_verified_at
     FROM users WHERE email = $1`,
    [normalizedEmail]
  );

  if (result.rows.length === 0) {
    // Perform a dummy hash to prevent timing attacks
    await hashPassword('dummy_password_timing_equalization');
    return { error: GENERIC_AUTH_ERROR, code: 'INVALID_CREDENTIALS', status: 401 };
  }

  const user = result.rows[0];

  // ── Check account lockout ──
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const remainingMin = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    return {
      error: `Account temporarily locked. Please try again in ${remainingMin} minute${remainingMin > 1 ? 's' : ''}.`,
      code: 'ACCOUNT_LOCKED',
      status: 423,
    };
  }

  // ── Check account status ──
  if (user.status === 'BANNED') {
    return { error: 'This account has been permanently suspended. Contact support.', code: 'ACCOUNT_BANNED', status: 403 };
  }
  if (user.status === 'SUSPENDED') {
    return { error: 'This account is suspended. Contact support for assistance.', code: 'ACCOUNT_SUSPENDED', status: 403 };
  }

  // ── Verify password ──
  const { valid, needsUpgrade } = await verifyPassword(password, user.password_hash);

  if (!valid) {
    // Increment failed attempts
    const newAttempts = (user.failed_login_attempts || 0) + 1;
    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
      await queryFn(
        `UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE user_id = $3`,
        [newAttempts, lockedUntil, user.user_id]
      );
      await safeAuditLog(queryFn, user.user_id, user.user_id, 'ACCOUNT_LOCKED', {
        reason: 'max_failed_attempts',
        ip,
      });
    } else {
      await queryFn(
        `UPDATE users SET failed_login_attempts = $1 WHERE user_id = $2`,
        [newAttempts, user.user_id]
      );
    }

    await safeAuditLog(queryFn, user.user_id, user.user_id, 'LOGIN_FAILED', {
      attempt: newAttempts,
      ip,
    });

    return { error: GENERIC_AUTH_ERROR, code: 'INVALID_CREDENTIALS', status: 401 };
  }

  // ── Successful login: reset failed attempts ──
  const updateFields = ['failed_login_attempts = 0', 'locked_until = NULL', 'last_login_at = NOW()'];

  // Auto-upgrade legacy hash to scrypt
  if (needsUpgrade) {
    const newHash = await hashPassword(password);
    updateFields.push(`password_hash = '${newHash}'`);
  }

  // Clear lockout if expired
  await queryFn(
    `UPDATE users SET ${updateFields.join(', ')} WHERE user_id = $1`,
    [user.user_id]
  );

  // ── Generate tokens ──
  const accessToken = generateAccessToken(user.user_id, user.role || 'USER');
  const { rawToken: refreshToken, tokenHash } = generateRefreshToken();
  await storeRefreshToken(queryFn, {
    tokenHash,
    userId: user.user_id,
    deviceInfo: { userAgent: userAgent || null },
    ipAddress: ip || null,
  });

  await safeAuditLog(queryFn, user.user_id, user.user_id, 'LOGIN_SUCCESS', { ip });

  return {
    success: true,
    accessToken,
    refreshToken,
    user: {
      userId: user.user_id,
      email: user.email,
      phone: user.phone,
      displayName: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role || 'USER',
      status: user.status || 'ACTIVE',
      emailVerified: !!user.email_verified_at,
    },
  };
}

/**
 * Log out — revoke the refresh token.
 * @param {Function} queryFn
 * @param {string} refreshToken — raw refresh token from cookie
 * @param {string} userId — from access token
 */
export async function logout(queryFn, refreshToken, userId) {
  if (refreshToken) {
    await revokeSingleToken(queryFn, refreshToken);
  }
  if (userId) {
    await safeAuditLog(queryFn, userId, userId, 'LOGOUT', {});
  }
  return { success: true };
}

/**
 * Initiate a password reset — generate a token.
 * @param {Function} queryFn
 * @param {string} email
 * @param {string} ip
 * @returns {Promise<object>} — always returns generic success to prevent enumeration
 */
export async function forgotPassword(queryFn, email, ip) {
  const normalizedEmail = String(email || '').trim().toLowerCase();

  // Always return success — do not reveal if email exists
  const GENERIC_RESPONSE = {
    success: true,
    message: 'If an account with that email exists, a password reset link has been sent.',
  };

  if (!normalizedEmail) return GENERIC_RESPONSE;

  const result = await queryFn('SELECT user_id FROM users WHERE email = $1', [normalizedEmail]);
  if (result.rows.length === 0) return GENERIC_RESPONSE;

  const userId = result.rows[0].user_id;

  // Invalidate existing tokens
  await queryFn(
    `UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  );

  // Generate new token
  const { rawToken, tokenHash } = generateSecureToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000);

  await queryFn(
    `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, ip_address)
     VALUES ($1, $2, $3, $4)`,
    [tokenHash, userId, expiresAt, ip || null]
  );

  await safeAuditLog(queryFn, userId, userId, 'PASSWORD_RESET_REQUESTED', { ip });

  // Fetch user name for personalized email
  const userProfile = await queryFn('SELECT first_name, last_name FROM users WHERE user_id = $1', [userId]);
  const u = userProfile.rows[0] || {};
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || normalizedEmail.split('@')[0];

  const emailRes = await sendPasswordResetEmail({
    email: normalizedEmail,
    name,
    token: rawToken,
  });

  return {
    ...GENERIC_RESPONSE,
    ...(process.env.NODE_ENV !== 'production' ? {
      resetLink: emailRes.resetLink,
      resetToken: rawToken,
    } : {}),
  };
}

/**
 * Reset password using a valid reset token (Atomic & Concurrency-Protected).
 * Supports both signatures for backward compatibility:
 * 1. resetPassword(queryFn, withTransaction, { token, password, confirmPassword, ip, userAgent })
 * 2. resetPassword(queryFn, token, newPassword)
 */
export async function resetPassword(queryFn, arg2, arg3) {
  let withTx = null;
  let token = null;
  let newPassword = null;
  let confirmPassword = null;
  let ip = null;
  let userAgent = null;

  if (typeof arg2 === 'function') {
    // Called with withTransaction
    withTx = arg2;
    const data = arg3 || {};
    token = data.token;
    newPassword = data.password;
    confirmPassword = data.confirmPassword;
    ip = data.ip;
    userAgent = data.userAgent;
  } else {
    // Legacy signature: (queryFn, token, newPassword)
    token = arg2;
    newPassword = arg3;
  }

  const GENERIC_RESET_ERROR = 'That password reset link is invalid or has expired. Please request a new one.';

  if (!token || !newPassword) {
    return { error: 'Token and new password are required.', code: 'MISSING_FIELDS', status: 400 };
  }

  if (confirmPassword && newPassword !== confirmPassword) {
    return { error: 'Passwords do not match.', code: 'PASSWORD_MISMATCH', status: 400 };
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, code: 'WEAK_PASSWORD', status: 400 };
  }

  const tokenHash = crypto.createHash('sha256').update(String(token).trim()).digest('hex');

  // ── Atomic Token Claim (Requirement 7 & 23: Concurrent Reset Protection) ──
  // Only ONE request will successfully update used_at = NOW()
  const claimResult = await queryFn(
    `UPDATE password_reset_tokens
     SET used_at = NOW()
     WHERE token_hash = $1
       AND used_at IS NULL
       AND expires_at > NOW()
     RETURNING id, user_id`,
    [tokenHash]
  );

  if (claimResult.rows.length === 0) {
    // Investigate failure reason for audit logging (never expose to client)
    const checkResult = await queryFn(
      `SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1`,
      [tokenHash]
    );

    if (checkResult.rows.length > 0) {
      const row = checkResult.rows[0];
      if (row.used_at) {
        await safeAuditLog(queryFn, row.user_id, row.user_id, 'PASSWORD_RESET_TOKEN_REUSED', { ip, userAgent });
      } else if (new Date(row.expires_at) <= new Date()) {
        await safeAuditLog(queryFn, row.user_id, row.user_id, 'PASSWORD_RESET_TOKEN_EXPIRED', { ip, userAgent });
      }
    } else {
      await safeAuditLog(queryFn, 'unknown', 'unknown', 'PASSWORD_RESET_FAILED', { reason: 'invalid_token', ip, userAgent });
    }

    return { error: GENERIC_RESET_ERROR, code: 'RESET_TOKEN_INVALID', status: 400 };
  }

  const userId = claimResult.rows[0].user_id;

  // ── Fetch user to preserve account status & get details for notification ──
  const userResult = await queryFn(
    `SELECT user_id, email, first_name, last_name, status FROM users WHERE user_id = $1`,
    [userId]
  );

  if (userResult.rows.length === 0) {
    return { error: GENERIC_RESET_ERROR, code: 'RESET_TOKEN_INVALID', status: 400 };
  }

  const user = userResult.rows[0];

  // ── Hash new password ──
  const passwordHash = await hashPassword(newPassword);

  // ── Execute Password Update + Session Invalidation ──
  const executeUpdates = async (client) => {
    // 1. Update password, reset failed attempts & lockout — PRESERVE existing account status (Requirement 15)
    await client.query(
      `UPDATE users
       SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL
       WHERE user_id = $2`,
      [passwordHash, userId]
    );

    // 2. Invalidate all active sessions / refresh tokens (Requirement 14)
    await client.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );
  };

  if (withTx) {
    await withTx(executeUpdates);
  } else {
    await executeUpdates({ query: queryFn });
  }

  // ── Audit Log Success (Requirement 20) ──
  await safeAuditLog(queryFn, userId, userId, 'PASSWORD_RESET_SUCCEEDED', { ip, userAgent });

  // ── Send Security Email Notification (Requirement 19) ──
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email;
  sendPasswordChangedNotificationEmail({
    email: user.email,
    name: displayName,
  }).catch(() => {});

  return {
    success: true,
    message: 'Password has been reset. Please log in with your new password.',
  };
}

/**
 * Verify email using a verification token.
 * @param {Function} queryFn
 * @param {string} token
 */
export async function verifyEmail(queryFn, token) {
  if (!token) {
    return { error: 'Verification token is required.', code: 'MISSING_TOKEN', status: 400 };
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const result = await queryFn(
    `SELECT id, user_id, expires_at, used_at
     FROM email_verification_tokens
     WHERE token_hash = $1`,
    [tokenHash]
  );

  if (result.rows.length === 0) {
    return { error: 'Invalid verification link.', code: 'INVALID_TOKEN', status: 400 };
  }

  const row = result.rows[0];

  if (row.used_at) {
    return { error: 'Email has already been verified.', code: 'ALREADY_VERIFIED', status: 400 };
  }

  if (new Date(row.expires_at) < new Date()) {
    return { error: 'This verification link has expired. Please request a new one.', code: 'TOKEN_EXPIRED', status: 400 };
  }

  await queryFn(`UPDATE users SET email_verified_at = NOW() WHERE user_id = $1`, [row.user_id]);
  await queryFn(`UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1`, [row.id]);

  await safeAuditLog(queryFn, row.user_id, row.user_id, 'EMAIL_VERIFIED', {});

  return { success: true, message: 'Email verified successfully.' };
}

/**
 * Get the current user's profile (safe projection — no secrets).
 * @param {Function} queryFn
 * @param {string} userId
 */
export async function getMe(queryFn, userId) {
  const result = await queryFn(
    `SELECT u.user_id, u.email, u.phone, u.first_name, u.last_name,
            u.role, u.status, u.email_verified_at, u.phone_verified_at,
            u.country, u.currency, u.created_at, u.last_login_at,
            p.display_name, p.kyc_status, p.risk_tier, p.account_status,
            w.balance, w.bonus_balance
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.user_id
     LEFT JOIN wallets w ON w.user_id = u.user_id
     WHERE u.user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return { error: 'User not found.', code: 'USER_NOT_FOUND', status: 404 };
  }

  const u = result.rows[0];
  return {
    success: true,
    user: {
      userId: u.user_id,
      email: u.email,
      phone: u.phone,
      firstName: u.first_name,
      lastName: u.last_name,
      displayName: u.display_name || [u.first_name, u.last_name].filter(Boolean).join(' '),
      role: u.role || 'USER',
      status: u.status || 'ACTIVE',
      emailVerified: !!u.email_verified_at,
      phoneVerified: !!u.phone_verified_at,
      country: u.country,
      currency: u.currency,
      kycStatus: u.kyc_status,
      balance: parseFloat(u.balance || 0),
      bonusBalance: parseFloat(u.bonus_balance || 0),
      createdAt: u.created_at,
      lastLoginAt: u.last_login_at,
    },
  };
}

/**
 * Resend email verification token.
 */
export async function resendEmailVerification(queryFn, userId) {
  const userResult = await queryFn(`SELECT email, email_verified_at FROM users WHERE user_id = $1`, [userId]);
  if (userResult.rows.length === 0) {
    return { error: 'User not found.', code: 'USER_NOT_FOUND', status: 404 };
  }

  if (userResult.rows[0].email_verified_at) {
    return { error: 'Email is already verified.', code: 'ALREADY_VERIFIED', status: 400 };
  }

  // Invalidate old tokens
  await queryFn(`UPDATE email_verification_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`, [userId]);

  const { rawToken, tokenHash } = generateSecureToken();
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000);

  await queryFn(
    `INSERT INTO email_verification_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
    [tokenHash, userId, expiresAt]
  );

  await safeAuditLog(queryFn, userId, userId, 'EMAIL_VERIFICATION_RESENT', {});

  const profile = await queryFn(
    `SELECT first_name, last_name FROM users WHERE user_id = $1`,
    [userId]
  );
  const u = profile.rows[0] || {};
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || userResult.rows[0].email.split('@')[0];
  await sendVerificationEmail({
    email: userResult.rows[0].email,
    name,
    token: rawToken,
  });

  return {
    success: true,
    message: 'Verification email has been resent.',
    ...(process.env.NODE_ENV !== 'production' ? { verificationToken: rawToken } : {}),
  };
}

// ─── Internal Helpers ───

async function safeAuditLog(queryFn, actorId, targetId, action, details) {
  try {
    await queryFn(
      `INSERT INTO user_security_audit_logs (user_id, actor_id, action, ip_address, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        targetId,
        actorId,
        action,
        details?.ip || null,
        JSON.stringify(sanitizeAuditDetails(details)),
      ]
    );
  } catch {
    // Audit log failure must not break auth flow
  }
}

function sanitizeAuditDetails(details) {
  if (!details || typeof details !== 'object') return {};
  const safe = { ...details };
  // NEVER log these
  delete safe.password;
  delete safe.passwordHash;
  delete safe.token;
  delete safe.resetToken;
  delete safe.otp;
  delete safe.secret;
  return safe;
}

export { MAX_FAILED_ATTEMPTS, LOCKOUT_DURATION_MINUTES, MIN_PASSWORD_LENGTH };

/**
 * Change password for authenticated user.
 */
export async function changePassword(queryFn, userId, currentPassword, newPassword) {
  if (!currentPassword || !newPassword) {
    return { error: 'Current and new password are required.', code: 'MISSING_FIELDS', status: 400 };
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, code: 'WEAK_PASSWORD', status: 400 };
  }

  const result = await queryFn(
    `SELECT password_hash, email, first_name, last_name FROM users WHERE user_id = $1`,
    [userId]
  );
  if (result.rows.length === 0) {
    return { error: 'User not found.', code: 'USER_NOT_FOUND', status: 404 };
  }

  const row = result.rows[0];
  const valid = await verifyPassword(currentPassword, row.password_hash);
  if (!valid.ok) {
    return { error: 'Current password is incorrect.', code: 'INVALID_PASSWORD', status: 401 };
  }

  const newHash = await hashPassword(newPassword);
  await queryFn(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE user_id = $2`, [newHash, userId]);
  await revokeAllUserTokens(queryFn, userId);

  const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email.split('@')[0];
  await sendPasswordChangedNotificationEmail({ email: row.email, name });
  await safeAuditLog(queryFn, userId, userId, 'PASSWORD_CHANGED', {});

  return { success: true, message: 'Password changed successfully.' };
}
