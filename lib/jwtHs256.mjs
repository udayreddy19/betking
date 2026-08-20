import jwt from 'jsonwebtoken';
import { getJwtSecret } from './jwtSecret.mjs';

function secret() {
  return getJwtSecret();
}

/**
 * Sign an HS256 JWT with jsonwebtoken (no custom HMAC).
 * @param {object} payload
 * @param {string} expiresIn
 */
export function signHs256(payload, expiresIn) {
  const { exp, iat, ...claims } = payload || {};
  return jwt.sign(claims, secret(), {
    algorithm: 'HS256',
    expiresIn,
  });
}

/**
 * Verify HS256 JWT. Returns payload or null (never throws).
 */
export function verifyHs256(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    return jwt.verify(token, secret(), { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}
