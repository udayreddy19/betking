/**
 * Authenticated Encryption and Blind Indexing for Sensitive KYC Data (Priority 25)
 *
 * Requirements:
 * - Field-level AES-256-GCM authenticated encryption for sensitive PII at rest (PAN, Aadhaar, ID documents).
 * - Non-reversible HMAC-SHA256 blind index hash for duplicate detection and uniqueness lookups.
 * - Never store or query plaintext sensitive data.
 * - Zero plaintext leakage in database dumps, logs, or error traces.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

function getKycMasterKey() {
  const secret = process.env.KYC_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'oddsyra_kyc_master_key_default_32b_salt';
  // Derive deterministic 32-byte key via SHA-256
  return crypto.createHash('sha256').update(secret).digest();
}

function getKycHashPepper() {
  return process.env.KYC_HASH_PEPPER || process.env.PEPPER || 'oddsyra_kyc_blind_index_pepper_2026';
}

/**
 * Generate non-reversible blind index hash for exact matching & uniqueness
 * Prevents rainbow table attacks via dedicated HMAC pepper.
 */
export function generateBlindIndex(value) {
  if (!value) return null;
  const normalized = String(value).trim().toUpperCase();
  return crypto.createHmac('sha256', getKycHashPepper()).update(normalized).digest('hex');
}

/**
 * Encrypt sensitive plaintext field using AES-256-GCM.
 * Output format: `enc:v1:<base64-iv>:<base64-ciphertext>:<base64-tag>`
 */
export function encryptKycField(plaintext) {
  if (!plaintext) return null;
  const str = String(plaintext);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKycMasterKey(), iv);
  
  let encrypted = cipher.update(str, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag().toString('base64');

  return `enc:v1:${iv.toString('base64')}:${encrypted}:${tag}`;
}

/**
 * Decrypt field encrypted with encryptKycField.
 * Returns null if input is falsy or decryption fails.
 */
export function decryptKycField(encryptedString) {
  if (!encryptedString) return null;
  const str = String(encryptedString).trim();
  
  // If not in standard enc:v1 format, return as-is (e.g. legacy or masked)
  if (!str.startsWith('enc:v1:')) {
    return str;
  }

  try {
    const parts = str.split(':');
    if (parts.length !== 5) return null;
    const [, , ivB64, ciphertextB64, tagB64] = parts;

    const iv = Buffer.from(ivB64, 'base64');
    const ciphertext = Buffer.from(ciphertextB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, getKycMasterKey(), iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(ciphertext, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return null;
  }
}

/**
 * Test whether a value is stored in encrypted ciphertext format.
 */
export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith('enc:v1:');
}
