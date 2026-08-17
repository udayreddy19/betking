/**
 * Token Service — BetKing Authentication
 *
 * Manages JWT access tokens and opaque refresh tokens.
 * Access tokens: short-lived (15min), HS256 signed.
 * Refresh tokens: long-lived (7 days), stored as hash in PostgreSQL.
 *
 * NEVER logs token values or secrets.
 */

import crypto from 'crypto';
import { getJwtSecret } from '../../lib/jwtSecret.mjs';
import { timingSafeEqualStrings } from '../../lib/cryptoUtils.mjs';

const JWT_SECRET = getJwtSecret();
const ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

// ─── JWT Helpers (HS256) ───

/**
 * Generate a signed JWT access token.
 * @param {string} userId
 * @param {string} role — 'USER' | 'ADMIN' | admin role
 * @param {string} tenantId
 * @returns {string} — JWT string
 */
export function generateAccessToken(userId, role = 'USER', tenantId = 'betking_in') {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    role,
    tenant: tenantId,
    type: 'access',
    iat: now,
    exp: now + ACCESS_TOKEN_EXPIRY_SECONDS,
  })).toString('base64url');

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

/**
 * Verify and decode a JWT access token.
 * @param {string} token
 * @returns {object|null} — decoded payload or null if invalid/expired
 */
export function verifyAccessToken(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    if (!timingSafeEqualStrings(expectedSig, signatureB64)) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    // Check expiry
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
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
 * Generate a secure random token for password resets or email verification.
 * @returns {{ rawToken: string, tokenHash: string }}
 */
export function generateSecureToken() {
  const rawToken = crypto.randomBytes(48).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

export { ACCESS_TOKEN_EXPIRY_SECONDS, REFRESH_TOKEN_EXPIRY_DAYS };
