/**
 * Verified Aadhaar + PAN identity for promo uniqueness and withdrawals.
 * Hashes are SHA-256 of normalized document numbers so promos can be linked
 * without storing extra copies of raw PII (raw values stay on kyc_cases).
 */

import crypto from 'crypto';
import { query } from '../db/pg.js';

export function normalizePan(raw) {
  return String(raw || '').trim().toUpperCase();
}

export function normalizeAadhaar(raw) {
  return String(raw || '').replace(/\D/g, '');
}

export function normalizeIndianPhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return digits;
}

export function alreadyLinkedError(kind) {
  const messages = {
    email: 'This email is already linked to another account.',
    phone: 'This mobile number is already linked to another account.',
    pan: 'This PAN is already linked to another account.',
    aadhaar: 'This Aadhaar is already linked to another account.',
  };
  const codes = {
    email: 'DUPLICATE_EMAIL',
    phone: 'DUPLICATE_PHONE',
    pan: 'DUPLICATE_PAN',
    aadhaar: 'DUPLICATE_AADHAAR',
  };
  return Object.assign(new Error(messages[kind] || 'This detail is already linked to another account.'), {
    code: codes[kind] || 'DUPLICATE_IDENTITY',
    status: 409,
  });
}

const ACTIVE_KYC_STATUSES = `('UNDER_REVIEW', 'VERIFIED', 'PENDING', 'NOT_STARTED', 'VERIFICATION_REQUIRED')`;

export async function assertEmailAvailable(email, excludeUserId = null, exec) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return;
  const run = runner(exec);
  const res = await run(
    `SELECT user_id FROM users
     WHERE lower(email) = $1
       AND ($2::text IS NULL OR user_id <> $2)
     LIMIT 1`,
    [normalized, excludeUserId],
  );
  if (res.rows.length > 0) throw alreadyLinkedError('email');
}

export async function assertPhoneAvailable(phone, excludeUserId = null, exec) {
  const digits = normalizeIndianPhone(phone);
  if (!digits) return;
  const run = runner(exec);
  const res = await run(
    `SELECT user_id FROM users
     WHERE phone IS NOT NULL
       AND right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = $1
       AND ($2::text IS NULL OR user_id <> $2)
     LIMIT 1`,
    [digits, excludeUserId],
  );
  if (res.rows.length > 0) throw alreadyLinkedError('phone');
}

export async function assertPanAvailable(pan, excludeUserId, exec) {
  const value = normalizePan(pan);
  if (!value) return;
  const run = runner(exec);
  const res = await run(
    `SELECT user_id FROM kyc_cases
     WHERE pan_number IS NOT NULL
       AND upper(btrim(pan_number)) = $1
       AND status IN ${ACTIVE_KYC_STATUSES}
       AND ($2::text IS NULL OR user_id <> $2)
     LIMIT 1`,
    [value, excludeUserId],
  );
  if (res.rows.length > 0) throw alreadyLinkedError('pan');
}

export async function assertAadhaarAvailable(aadhaar, excludeUserId, exec) {
  const value = normalizeAadhaar(aadhaar);
  if (!value) return;
  const run = runner(exec);
  const res = await run(
    `SELECT user_id FROM kyc_cases
     WHERE aadhaar_number IS NOT NULL
       AND regexp_replace(aadhaar_number, '[^0-9]', '', 'g') = $1
       AND status IN ${ACTIVE_KYC_STATUSES}
       AND ($2::text IS NULL OR user_id <> $2)
     LIMIT 1`,
    [value, excludeUserId],
  );
  if (res.rows.length > 0) throw alreadyLinkedError('aadhaar');
}

export function hashIdentityValue(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  return crypto.createHash('sha256').update(value).digest('hex');
}

function runner(exec) {
  if (!exec) return query;
  if (typeof exec === 'function') return exec;
  return exec.query.bind(exec);
}

export async function getVerifiedIdentity(userId, exec) {
  if (!userId) return null;
  const run = runner(exec);

  const panRes = await run(
    `SELECT pan_number
     FROM kyc_cases
     WHERE user_id = $1
       AND status = 'VERIFIED'
       AND pan_number IS NOT NULL
       AND pan_number <> ''
     ORDER BY updated_at DESC
     LIMIT 1`,
    [userId],
  );
  const aadhaarRes = await run(
    `SELECT aadhaar_number
     FROM kyc_cases
     WHERE user_id = $1
       AND status = 'VERIFIED'
       AND aadhaar_number IS NOT NULL
       AND aadhaar_number <> ''
     ORDER BY updated_at DESC
     LIMIT 1`,
    [userId],
  );

  const pan = normalizePan(panRes.rows[0]?.pan_number);
  const aadhaar = normalizeAadhaar(aadhaarRes.rows[0]?.aadhaar_number);
  if (!pan || !aadhaar) return null;

  return {
    pan,
    aadhaar,
    panHash: hashIdentityValue(pan),
    aadhaarHash: hashIdentityValue(aadhaar),
  };
}

export function identityRequiredError(action = 'continue') {
  return Object.assign(
    new Error(`KYC_REQUIRED: Verify Aadhaar and PAN to ${action}.`),
    { code: 'KYC_REQUIRED', status: 403 },
  );
}

export async function requireVerifiedIdentity(userId, exec, action = 'continue') {
  const identity = await getVerifiedIdentity(userId, exec);
  if (!identity) throw identityRequiredError(action);
  return identity;
}

export async function assertIdentityHasNotClaimedPromo({
  exec,
  promotionId,
  codeId,
  panHash,
  aadhaarHash,
  excludeUserId = null,
}) {
  const run = runner(exec);

  if (codeId) {
    const dup = await run(
      `SELECT user_id
       FROM signup_promo_redemptions
       WHERE code_id = $1
         AND revoked_at IS NULL
         AND (
           ($2::text IS NOT NULL AND pan_hash = $2)
           OR ($3::text IS NOT NULL AND aadhaar_hash = $3)
         )
         AND ($4::text IS NULL OR user_id <> $4)
       LIMIT 1`,
      [codeId, panHash, aadhaarHash, excludeUserId],
    );
    if (dup.rows.length > 0) {
      throw Object.assign(
        new Error('PROMO_IDENTITY_USED: This Aadhaar or PAN has already claimed this promo code.'),
        { code: 'PROMO_IDENTITY_USED', status: 409 },
      );
    }
  }

  if (promotionId) {
    const dup = await run(
      `SELECT user_id
       FROM user_bonuses
       WHERE promotion_id = $1
         AND status IN ('ACTIVE', 'COMPLETED', 'RELEASED')
         AND (
           ($2::text IS NOT NULL AND pan_hash = $2)
           OR ($3::text IS NOT NULL AND aadhaar_hash = $3)
         )
         AND ($4::text IS NULL OR user_id <> $4)
       LIMIT 1`,
      [promotionId, panHash, aadhaarHash, excludeUserId],
    );
    if (dup.rows.length > 0) {
      throw Object.assign(
        new Error('PROMO_IDENTITY_USED: This Aadhaar or PAN has already claimed this promotion.'),
        { code: 'PROMO_IDENTITY_USED', status: 409 },
      );
    }
  }
}
