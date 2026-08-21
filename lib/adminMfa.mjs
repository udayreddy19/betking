import { query } from '../db/pg.js';
import { encryptSecret, decryptSecret } from './secretBox.mjs';
import { generateTotpSecret, totpOtpauthUrl, verifyTotp } from './totp.mjs';

export function isAdminMfaEnforced() {
  if (process.env.NODE_ENV === 'production') return true;
  return process.env.ADMIN_MFA_REQUIRED === '1';
}

export async function getAdminMfaRow(userId) {
  try {
    const res = await query(
      `SELECT user_id, secret_ciphertext, secret_iv, secret_tag, enabled
       FROM admin_mfa WHERE user_id = $1`,
      [userId],
    );
    return res.rows[0] || null;
  } catch (err) {
    if (err.code === '42P01') return null;
    throw err;
  }
}

function decryptRow(row) {
  return decryptSecret({
    ciphertext: row.secret_ciphertext,
    iv: row.secret_iv,
    tag: row.secret_tag,
  });
}

export async function startAdminMfaEnrollment(userId, accountLabel) {
  const existing = await getAdminMfaRow(userId);
  // Reuse an in-progress secret so re-login / retries don't invalidate the authenticator entry.
  if (existing && !existing.enabled && existing.secret_ciphertext) {
    try {
      const secret = decryptRow(existing);
      return {
        secret,
        otpauthUrl: totpOtpauthUrl({ secret, account: accountLabel || userId }),
        reused: true,
      };
    } catch {
      // Key rotation or corrupt row — fall through and issue a fresh secret.
    }
  }

  const secret = generateTotpSecret();
  const boxed = encryptSecret(secret);
  await query(
    `INSERT INTO admin_mfa (user_id, secret_ciphertext, secret_iv, secret_tag, enabled, updated_at)
     VALUES ($1, $2, $3, $4, FALSE, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       secret_ciphertext = EXCLUDED.secret_ciphertext,
       secret_iv = EXCLUDED.secret_iv,
       secret_tag = EXCLUDED.secret_tag,
       enabled = FALSE,
       enrolled_at = NULL,
       updated_at = NOW()`,
    [userId, boxed.ciphertext, boxed.iv, boxed.tag],
  );
  return {
    secret,
    otpauthUrl: totpOtpauthUrl({ secret, account: accountLabel || userId }),
    reused: false,
  };
}

export async function confirmAdminMfaEnrollment(userId, code) {
  const row = await getAdminMfaRow(userId);
  if (!row) {
    const err = new Error('No MFA enrollment in progress');
    err.code = 'MFA_NOT_STARTED';
    throw err;
  }
  const secret = decryptRow(row);
  if (!verifyTotp(secret, code)) {
    const err = new Error('Invalid authenticator code');
    err.code = 'MFA_INVALID';
    throw err;
  }
  await query(
    `UPDATE admin_mfa SET enabled = TRUE, enrolled_at = NOW(), last_used_at = NOW(), updated_at = NOW()
     WHERE user_id = $1`,
    [userId],
  );
  return true;
}

export async function verifyAdminMfaCode(userId, code) {
  const row = await getAdminMfaRow(userId);
  if (!row?.enabled) {
    const err = new Error('Authenticator is not enabled for this admin');
    err.code = 'MFA_NOT_ENABLED';
    throw err;
  }
  const secret = decryptRow(row);
  if (!verifyTotp(secret, code)) {
    const err = new Error('Invalid authenticator code');
    err.code = 'MFA_INVALID';
    throw err;
  }
  await query(
    `UPDATE admin_mfa SET last_used_at = NOW(), updated_at = NOW() WHERE user_id = $1`,
    [userId],
  );
  return true;
}
