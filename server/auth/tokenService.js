/**
 * Token Service — OddsYra Authentication
 *
 * Manages JWT access tokens and opaque refresh tokens.
 * Access tokens: short-lived (15min), HS256 signed.
 * Refresh tokens: long-lived (7 days), stored as hash in PostgreSQL.
 *
 * NEVER logs token values or secrets.
 */

import crypto from 'crypto';
import { signHs256, verifyHs256 } from '../../lib/jwtHs256.mjs';

const ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export function generateAccessToken(userId, role = 'USER', tenantId = 'oddsyra_in') {
  return signHs256({
    sub: userId,
    role,
    tenant: tenantId,
    type: 'access',
  }, `${ACCESS_TOKEN_EXPIRY_SECONDS}s`);
}

export function verifyAccessToken(token) {
  return verifyHs256(token);
}

// ─── Refresh Token Helpers ───

/**
 * Generate a cryptographically secure opaque refresh token.
 * @returns {{ rawToken: string, tokenHash: string }}
 */
export function generateRefreshToken() {
  const rawToken = crypto.randomBytes(64).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

/**
 * Hash a raw refresh token for DB lookup.
 * @param {string} rawToken
 * @returns {string}
 */
export function hashRefreshToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Store a refresh token hash in the database.
 * @param {Function} queryFn — db query function
 * @param {object} params
 */
export async function storeRefreshToken(queryFn, { tokenHash, userId, deviceInfo, ipAddress }) {
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  await queryFn(
    `INSERT INTO refresh_tokens (token_hash, user_id, expires_at, device_info, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [tokenHash, userId, expiresAt, JSON.stringify(deviceInfo || {}), ipAddress || null]
  );
}

/**
 * Rotate a refresh token: revoke old, issue new.
 * @param {Function} queryFn — db query function
 * @param {string} oldRawToken — the raw refresh token from client
 * @param {object} meta — { deviceInfo, ipAddress }
 * @returns {{ accessToken: string, refreshToken: string, userId: string, role: string } | null}
 */
export async function rotateRefreshToken(queryFn, oldRawToken, meta = {}) {
  const oldHash = hashRefreshToken(oldRawToken);

  // Find and validate the old token
  const result = await queryFn(
    `SELECT rt.user_id, rt.revoked_at, rt.expires_at, u.role, u.status
     FROM refresh_tokens rt
     JOIN users u ON u.user_id = rt.user_id
     WHERE rt.token_hash = $1`,
    [oldHash]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];

  // If already revoked, this is a reuse attack — revoke ALL tokens for this user
  if (row.revoked_at) {
    await queryFn(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
      [row.user_id]
    );
    return null;
  }

  // Check expiry
  if (new Date(row.expires_at) < new Date()) {
    await queryFn(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
      [oldHash]
    );
    return null;
  }

  // Check account status
  if (row.status === 'BANNED' || row.status === 'SUSPENDED') {
    return null;
  }

  // Revoke old token
  await queryFn(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
    [oldHash]
  );

  // Issue new tokens
  const { rawToken: newRawToken, tokenHash: newHash } = generateRefreshToken();
  await storeRefreshToken(queryFn, {
    tokenHash: newHash,
    userId: row.user_id,
    deviceInfo: meta.deviceInfo,
    ipAddress: meta.ipAddress,
  });

  const accessToken = generateAccessToken(row.user_id, row.role || 'USER');

  return {
    accessToken,
    refreshToken: newRawToken,
    userId: row.user_id,
    role: row.role || 'USER',
  };
}

/**
 * Revoke all refresh tokens for a user (logout all sessions).
 * @param {Function} queryFn
 * @param {string} userId
 */
export async function revokeAllUserTokens(queryFn, userId) {
  await queryFn(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
}

/**
 * Revoke a single refresh token.
 * @param {Function} queryFn
 * @param {string} rawToken
 */
export async function revokeSingleToken(queryFn, rawToken) {
  const hash = hashRefreshToken(rawToken);
  await queryFn(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
    [hash]
  );
}

/**
 * Generate a secure random token for email verification (long opaque).
 * @returns {{ rawToken: string, tokenHash: string }}
 */
export function generateSecureToken() {
  const rawToken = crypto.randomBytes(48).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

/**
 * Generate a 6-digit password-reset code (for email + manual entry).
 * Stored as SHA-256 hash only — same claim/expiry rules as long tokens.
 * @returns {{ rawToken: string, tokenHash: string }}
 */
export function generatePasswordResetCode() {
  const rawToken = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

/** Normalize user-entered reset code (spaces/dashes stripped). */
export function normalizePasswordResetCode(token = '') {
  return String(token || '').replace(/[\s-]/g, '').trim();
}

export { ACCESS_TOKEN_EXPIRY_SECONDS, REFRESH_TOKEN_EXPIRY_DAYS };
