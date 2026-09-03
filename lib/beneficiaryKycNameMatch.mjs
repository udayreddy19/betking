/**
 * Bank beneficiary name ↔ verified KYC identity name matching.
 *
 * IMPORTANT (CASE C — current platform):
 * - KYC verifies PAN/Aadhaar document numbers only; no verified legal name is stored.
 * - No penny-drop / bank name-enquiry source exists; withdrawal bank_details is user-entered.
 * - Therefore authoritative match cannot succeed until those sources exist.
 *
 * This module is the single reusable matcher + eligibility evaluator.
 * It never treats user-entered bank strings or signup display names as verified.
 */

import { query } from '../db/pg.js';

export const BENEFICIARY_KYC_MATCH_CODES = Object.freeze({
  MATCHED: 'BENEFICIARY_NAME_MATCHED',
  MISMATCH: 'BENEFICIARY_NAME_MISMATCH',
  AMBIGUOUS: 'BENEFICIARY_NAME_AMBIGUOUS',
  KYC_NOT_VERIFIED: 'KYC_NOT_VERIFIED',
  KYC_NAME_MISSING: 'KYC_IDENTITY_NAME_NOT_AVAILABLE',
  BANK_NOT_VERIFIED: 'BANK_ACCOUNT_NOT_VERIFIED',
  BENEFICIARY_NOT_VERIFIED: 'BENEFICIARY_NOT_VERIFIED',
  BENEFICIARY_NAME_MISSING: 'BENEFICIARY_NAME_MISSING',
});

/** Opt-in hard gate. Default OFF so existing withdrawals keep working until providers exist. */
export function isBeneficiaryKycMatchEnforced() {
  return String(process.env.WITHDRAWAL_REQUIRE_BENEFICIARY_KYC_MATCH || '').trim() === '1';
}

/**
 * Normalize for comparison only — does not mutate stored legal names.
 */
export function normalizeNameForMatch(raw) {
  if (raw == null) return '';
  let s = String(raw).normalize('NFKC');
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  s = s.replace(/\s+/g, ' ').trim().toUpperCase();
  return s;
}

/**
 * Exact match after normalization. Name-order variants → AMBIGUOUS (manual review).
 * Never auto-approve fuzzy/partial matches.
 */
export function compareBeneficiaryToKycName(kycName, beneficiaryName) {
  const kyc = normalizeNameForMatch(kycName);
  const bank = normalizeNameForMatch(beneficiaryName);
  if (!kyc || !bank) {
    return {
      outcome: 'AMBIGUOUS',
      code: BENEFICIARY_KYC_MATCH_CODES.AMBIGUOUS,
      reason: 'One or both names empty after normalization',
    };
  }
  if (kyc === bank) {
    return {
      outcome: 'MATCHED',
      code: BENEFICIARY_KYC_MATCH_CODES.MATCHED,
      reason: 'Normalized names are identical',
    };
  }
  const kycTokens = kyc.split(' ').filter(Boolean).sort().join(' ');
  const bankTokens = bank.split(' ').filter(Boolean).sort().join(' ');
  if (kycTokens === bankTokens && kyc !== bank) {
    return {
      outcome: 'AMBIGUOUS',
      code: BENEFICIARY_KYC_MATCH_CODES.AMBIGUOUS,
      reason: 'Same tokens different order — manual review required',
    };
  }
  return {
    outcome: 'MISMATCH',
    code: BENEFICIARY_KYC_MATCH_CODES.MISMATCH,
    reason: 'Normalized names differ',
  };
}

/**
 * Authoritative KYC legal name — not present on this platform today.
 * Looks only for explicitly verified name columns if a future migration adds them.
 * Never falls back to users.first_name / display_name (self-reported).
 */
export async function resolveVerifiedKycName(userId, exec = query) {
  if (!userId) return null;
  try {
    const res = await exec(
      `SELECT status,
              NULLIF(TRIM(COALESCE(
                to_jsonb(kyc_cases)->>'verified_full_name',
                to_jsonb(kyc_cases)->>'legal_name',
                to_jsonb(kyc_cases)->>'full_name',
                ''
              )), '') AS verified_name
       FROM kyc_cases
       WHERE user_id = $1 AND status = 'VERIFIED'
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 1`,
      [userId],
    );
    const row = res.rows[0];
    if (!row || row.status !== 'VERIFIED') return null;
    return row.verified_name || null;
  } catch {
    return null;
  }
}

/**
 * Authoritative verified bank beneficiary name.
 * No user_bank_accounts / penny-drop table exists today.
 * Never parses user-entered withdrawals.bank_details as verified.
 */
export async function resolveVerifiedBeneficiaryName(userId, _bankDetails = null, exec = query) {
  if (!userId) return null;
  try {
    const res = await exec(
      `SELECT to_regclass('public.user_bank_accounts') AS rel`,
    );
    if (!res.rows[0]?.rel) return null;
    const bankRes = await exec(
      `SELECT NULLIF(TRIM(COALESCE(verified_beneficiary_name, account_holder_name, '')), '') AS name
       FROM user_bank_accounts
       WHERE user_id = $1
         AND UPPER(COALESCE(verification_status, status, '')) IN ('VERIFIED', 'SUCCESS', 'CONFIRMED')
       ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
       LIMIT 1`,
      [userId],
    );
    return bankRes.rows[0]?.name || null;
  } catch {
    return null;
  }
}

export async function getKycVerificationStatus(userId, exec = query) {
  const res = await exec(
    `SELECT status, pan_number, aadhaar_number
     FROM kyc_cases
     WHERE user_id = $1 AND status = 'VERIFIED'
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 1`,
    [userId],
  );
  const row = res.rows[0];
  if (!row) {
    return { verified: false, hasPan: false, hasAadhaar: false };
  }
  return {
    verified: true,
    hasPan: Boolean(row.pan_number),
    hasAadhaar: Boolean(row.aadhaar_number),
  };
}

/**
 * Full eligibility evaluation for Admin UI + withdrawal gates.
 * Safe: never uses untrusted user-entered bank name as a verified source.
 */
export async function evaluateBeneficiaryKycMatch(userId, bankDetails = null, exec = query) {
  const kyc = await getKycVerificationStatus(userId, exec);
  const kycName = await resolveVerifiedKycName(userId, exec);
  const beneficiaryName = await resolveVerifiedBeneficiaryName(userId, bankDetails, exec);
  const enforced = isBeneficiaryKycMatchEnforced();

  const base = {
    enforced,
    kycVerified: kyc.verified && kyc.hasPan && kyc.hasAadhaar,
    bankAccountVerified: Boolean(beneficiaryName),
    beneficiaryVerified: Boolean(beneficiaryName),
    kycNameAvailable: Boolean(kycName),
    beneficiaryNameAvailable: Boolean(beneficiaryName),
    /** Masked / withheld — never return full names to clients from this helper's public surface */
    nameMatch: 'UNAVAILABLE',
    code: null,
    reason: null,
    approvalAllowed: !enforced,
    dependency: null,
  };

  if (!base.kycVerified) {
    return {
      ...base,
      nameMatch: 'BLOCKED',
      code: BENEFICIARY_KYC_MATCH_CODES.KYC_NOT_VERIFIED,
      reason: 'KYC is not verified (PAN + Aadhaar required)',
      approvalAllowed: false,
    };
  }

  if (!kycName) {
    return {
      ...base,
      nameMatch: 'UNAVAILABLE',
      code: BENEFICIARY_KYC_MATCH_CODES.KYC_NAME_MISSING,
      reason: 'Verified KYC identity name is not available for matching',
      approvalAllowed: !enforced,
      dependency: 'KYC_IDENTITY_NAME_SOURCE_REQUIRED',
    };
  }

  if (!beneficiaryName) {
    return {
      ...base,
      nameMatch: 'UNAVAILABLE',
      code: BENEFICIARY_KYC_MATCH_CODES.BENEFICIARY_NOT_VERIFIED,
      reason: 'Verified bank beneficiary name is not available (no penny-drop / bank name-enquiry source)',
      approvalAllowed: !enforced,
      dependency: 'BANK_BENEFICIARY_VERIFICATION_SOURCE_REQUIRED',
    };
  }

  const cmp = compareBeneficiaryToKycName(kycName, beneficiaryName);
  return {
    ...base,
    nameMatch: cmp.outcome,
    code: cmp.code,
    reason: cmp.reason,
    // When enforcement is OFF, preserve existing withdrawal behaviour (never hard-block here).
    // When ON, only exact MATCHED after normalization may proceed; AMBIGUOUS/MISMATCH never auto-approve.
    approvalAllowed: enforced ? cmp.outcome === 'MATCHED' : true,
  };
}

/**
 * Throws structured Error when enforcement is ON and match is not MATCHED.
 * No-op when enforcement is OFF (preserves existing withdrawal behaviour).
 */
export async function assertBeneficiaryKycNameMatchForWithdrawal(userId, bankDetails = null, exec = query) {
  const evaluation = await evaluateBeneficiaryKycMatch(userId, bankDetails, exec);
  if (!evaluation.enforced) {
    return evaluation;
  }
  if (evaluation.nameMatch === 'MATCHED' && evaluation.approvalAllowed) {
    return evaluation;
  }

  const code = evaluation.code || BENEFICIARY_KYC_MATCH_CODES.BENEFICIARY_NAME_MISSING;
  const message = `${code}: ${evaluation.reason || 'Beneficiary / KYC name check failed'}`;
  const err = new Error(message);
  err.code = code;
  err.status = 403;
  err.evaluation = evaluation;
  throw err;
}

/**
 * Extract user-declared account-holder name from withdrawal bank_details.
 * For Admin display only — NEVER treat as verified beneficiary identity.
 */
export function extractDeclaredAccountHolderFromBankDetails(bankDetails) {
  if (bankDetails == null) return null;
  let bd = bankDetails;
  if (typeof bd === 'string') {
    try {
      bd = JSON.parse(bd);
    } catch {
      const m = bd.match(/(?:^|\|\s*)Name:\s*([^|]+)/i);
      return m ? m[1].trim() || null : null;
    }
  }
  if (!bd || typeof bd !== 'object') return null;

  const direct = [
    bd.accountHolderName,
    bd.account_holder_name,
    bd.beneficiaryName,
    bd.beneficiary_name,
    bd.accountName,
    bd.name,
  ].find((v) => v != null && String(v).trim());
  if (direct) return String(direct).trim();

  const details = String(bd.details || '');
  const m = details.match(/(?:^|\|\s*)Name:\s*([^|]+)/i);
  return m ? m[1].trim() || null : null;
}

/** Mask account number fragments in a free-text bank details string. */
export function maskBankDetailsForAdmin(raw) {
  if (raw == null || raw === '') return '—';
  return String(raw)
    .replace(/(A\/C:\s*)(\d{4,})/gi, (_, p, digits) => `${p}${'•'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`)
    .replace(/(\d{6,})/g, (digits) => `${'•'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`);
}

const UPI_VPA_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,64}$/;

/**
 * Normalize withdrawal destination into structured bank_details fields.
 * Accepts legacy free-text `details` and always emits upiId / accountNumber / etc.
 */
export function normalizeWithdrawalBankDetails(raw = {}) {
  let bd = raw;
  if (typeof bd === 'string') {
    try {
      bd = JSON.parse(bd);
    } catch {
      bd = { details: raw };
    }
  }
  if (!bd || typeof bd !== 'object') bd = {};

  const method = String(bd.method || bd.type || 'UPI').toUpperCase().replace(/\s+/g, '_');
  const detailsText = String(bd.details || '').trim();

  let upiId = String(bd.upiId || bd.upi_id || bd.vpa || '').trim();
  if (!upiId) {
    const m = detailsText.match(/UPI\s*ID:\s*([^\s|]+)/i)
      || detailsText.match(/\b([a-zA-Z0-9.\-_]{2,}@[a-zA-Z][a-zA-Z0-9.\-]{1,})\b/);
    if (m) upiId = m[1].trim();
  }

  let accountHolderName = extractDeclaredAccountHolderFromBankDetails(bd);
  let bankName = String(bd.bankName || bd.bank_name || '').trim();
  let accountNumber = String(bd.accountNumber || bd.account_number || bd.account || '').trim();
  let ifsc = String(bd.ifsc || bd.ifscCode || bd.ifsc_code || '').trim().toUpperCase();
  let paytmNumber = String(bd.paytmNumber || bd.paytm_number || bd.mobile || '').trim();

  if (!bankName) {
    const m = detailsText.match(/Bank:\s*([^|]+)/i);
    if (m) bankName = m[1].trim();
  }
  if (!accountNumber) {
    const m = detailsText.match(/A\/C:\s*([^\s|]+)/i);
    if (m) accountNumber = m[1].trim();
  }
  if (!ifsc) {
    const m = detailsText.match(/IFSC:\s*([A-Z0-9]+)/i);
    if (m) ifsc = m[1].trim().toUpperCase();
  }
  if (!paytmNumber) {
    const m = detailsText.match(/Paytm(?:\s*Wallet)?:\s*([0-9]{10})/i);
    if (m) paytmNumber = m[1].trim();
  }

  let details = detailsText;
  if (method === 'UPI' && upiId) {
    details = `UPI ID: ${upiId}`;
  } else if (method === 'BANK_TRANSFER' && (accountNumber || ifsc || bankName)) {
    details = [
      bankName ? `Bank: ${bankName}` : null,
      accountNumber ? `A/C: ${accountNumber}` : null,
      ifsc ? `IFSC: ${ifsc}` : null,
      accountHolderName ? `Name: ${accountHolderName}` : null,
    ].filter(Boolean).join(' | ');
  } else if (method === 'PAYTM' && paytmNumber) {
    details = `Paytm Wallet: ${paytmNumber}`;
  }

  const out = {
    ...bd,
    method,
    details: details || detailsText || '',
  };
  if (upiId) {
    out.upiId = upiId;
    out.vpa = upiId;
  }
  if (accountHolderName) out.accountHolderName = accountHolderName;
  if (bankName) out.bankName = bankName;
  if (accountNumber) out.accountNumber = accountNumber;
  if (ifsc) out.ifsc = ifsc;
  if (paytmNumber) out.paytmNumber = paytmNumber;

  return out;
}

/** Validate normalized destination before accepting a withdrawal. */
export function assertWithdrawalDestinationComplete(bankDetails) {
  const bd = normalizeWithdrawalBankDetails(bankDetails);
  const method = String(bd.method || 'UPI').toUpperCase();

  if (method === 'UPI') {
    if (!bd.upiId) {
      const err = new Error('UPI_ID_REQUIRED: Please enter a valid UPI ID (e.g. name@upi)');
      err.code = 'UPI_ID_REQUIRED';
      throw err;
    }
    if (!UPI_VPA_RE.test(bd.upiId)) {
      const err = new Error('INVALID_UPI_ID: UPI ID must look like name@bank (e.g. name@upi)');
      err.code = 'INVALID_UPI_ID';
      throw err;
    }
  } else if (method === 'BANK_TRANSFER') {
    if (!bd.accountHolderName) {
      const err = new Error('ACCOUNT_HOLDER_REQUIRED: Please enter the account holder name');
      err.code = 'ACCOUNT_HOLDER_REQUIRED';
      throw err;
    }
    if (!bd.bankName) {
      const err = new Error('BANK_NAME_REQUIRED: Please enter the bank name');
      err.code = 'BANK_NAME_REQUIRED';
      throw err;
    }
    if (!bd.accountNumber || String(bd.accountNumber).length < 6) {
      const err = new Error('ACCOUNT_NUMBER_REQUIRED: Please enter a valid bank account number');
      err.code = 'ACCOUNT_NUMBER_REQUIRED';
      throw err;
    }
    if (!bd.ifsc || String(bd.ifsc).length < 4) {
      const err = new Error('IFSC_REQUIRED: Please enter a valid IFSC code');
      err.code = 'IFSC_REQUIRED';
      throw err;
    }
  } else if (method === 'PAYTM') {
    if (!bd.paytmNumber || !/^[0-9]{10}$/.test(String(bd.paytmNumber))) {
      const err = new Error('PAYTM_NUMBER_REQUIRED: Please enter a valid 10-digit Paytm mobile number');
      err.code = 'PAYTM_NUMBER_REQUIRED';
      throw err;
    }
  }

  return bd;
}
