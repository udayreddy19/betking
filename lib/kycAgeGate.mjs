import { query } from '../db/pg.js';

export const MIN_LEGAL_AGE = 18;

export function shouldEnforceKycAge() {
  const inVitest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
  if (inVitest && process.env.ENFORCE_KYC_AGE !== '1') return false;
  return true;
}

export function ageFromDob(dob, now = new Date()) {
  if (!dob) return null;
  const d = dob instanceof Date ? dob : new Date(`${String(dob).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - d.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < d.getUTCDate())) age -= 1;
  return age;
}

export function kycAgeGateError(message) {
  return Object.assign(new Error(`KYC_AGE_REQUIRED: ${message}`), {
    code: 'KYC_AGE_REQUIRED',
    status: 403,
  });
}

/** Withdrawals require VERIFIED KYC and date of birth proving 18+. */
export async function assertRealMoneyKycAge(userId) {
  if (!shouldEnforceKycAge()) return { ok: true, skipped: true };
  if (!userId) throw kycAgeGateError('Sign in to use real money.');

  let row = null;
  try {
    const res = await query(
      `SELECT kyc_status, date_of_birth FROM user_profiles WHERE user_id = $1`,
      [userId],
    );
    row = res.rows[0] || null;
  } catch {
    throw kycAgeGateError('Could not verify identity. Try again.');
  }

  if (!row || String(row.kyc_status || '').toUpperCase() !== 'VERIFIED') {
    throw kycAgeGateError('Verify your identity (KYC) before withdrawing.');
  }

  const age = ageFromDob(row.date_of_birth, new Date());
  if (age == null) {
    throw kycAgeGateError('Add a verified date of birth before withdrawing.');
  }
  if (age < MIN_LEGAL_AGE) {
    throw kycAgeGateError('You must be 18 or older to withdraw.');
  }

  return { ok: true, age };
}
