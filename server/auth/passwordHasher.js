/**
 * Password Hasher — BetKing Authentication
 *
 * Uses Node.js built-in crypto.scrypt() with 32-byte random salt.
 * Provides equivalent security to bcrypt cost-10 with zero native dependencies.
 *
 * Format: "scrypt:<salt_hex>:<hash_hex>"
 *
 * Supports legacy SHA-256 verification for existing users (auto-upgrade on login).
 * NEVER logs passwords, hashes, or salts.
 */

import crypto from 'crypto';

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384; // N = 2^14, equivalent to bcrypt cost ~10
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELISM = 1;
const SALT_LENGTH = 32;

/**
 * Hash a plaintext password using scrypt.
 * @param {string} password — plaintext password
 * @returns {Promise<string>} — "scrypt:<salt_hex>:<hash_hex>"
 */
export async function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }

  const salt = crypto.randomBytes(SALT_LENGTH);

  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      SCRYPT_KEYLEN,
      { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELISM },
      (err, derivedKey) => {
        if (err) return reject(err);
        resolve(`scrypt:${salt.toString('hex')}:${derivedKey.toString('hex')}`);
      }
    );
  });
}

/**
 * Verify a plaintext password against a stored hash.
 * Supports both scrypt and legacy SHA-256 formats.
 * @param {string} password — plaintext password
 * @param {string} storedHash — stored hash string
 * @returns {Promise<{valid: boolean, needsUpgrade: boolean}>}
 */
export async function verifyPassword(password, storedHash) {
  if (!password || !storedHash) {
    return { valid: false, needsUpgrade: false };
  }

  // Scrypt format: "scrypt:<salt_hex>:<hash_hex>"
  if (storedHash.startsWith('scrypt:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 3) {
      return { valid: false, needsUpgrade: false };
    }

    const salt = Buffer.from(parts[1], 'hex');
    const expectedHash = parts[2];

    return new Promise((resolve) => {
      crypto.scrypt(
        password,
        salt,
        SCRYPT_KEYLEN,
        { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELISM },
        (err, derivedKey) => {
          if (err) {
            resolve({ valid: false, needsUpgrade: false });
            return;
          }
          const valid = crypto.timingSafeEqual(
            Buffer.from(expectedHash, 'hex'),
            derivedKey
          );
          resolve({ valid, needsUpgrade: false });
        }
      );
    });
  }

  // Legacy SHA-256 format: 64-char hex string
  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
    const valid = crypto.timingSafeEqual(
      Buffer.from(storedHash, 'hex'),
      Buffer.from(legacyHash, 'hex')
    );
    return { valid, needsUpgrade: valid }; // Flag for upgrade if valid
  }

  return { valid: false, needsUpgrade: false };
}

/**
 * Check if a stored hash needs upgrading to scrypt.
 * @param {string} storedHash
 * @returns {boolean}
 */
export function isLegacyHash(storedHash) {
  return storedHash && !storedHash.startsWith('scrypt:');
}
