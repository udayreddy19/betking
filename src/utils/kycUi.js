/** Detect KYC / age-gate errors from API or engines. */
export function isKycError(message) {
  return /KYC_AGE_REQUIRED|KYC_REQUIRED|Verify your identity \(KYC\)|Verify Aadhaar and PAN|verified date of birth|18 or older/i
    .test(String(message || ''));
}

/** Strip machine prefixes like `KYC_AGE_REQUIRED:` for display. */
export function cleanKycMessage(message) {
  return String(message || '')
    .replace(/^KYC_AGE_REQUIRED:\s*/i, '')
    .replace(/^KYC_REQUIRED:\s*/i, '')
    .trim();
}

export const KYC_PROFILE_PATH = '/profile#kyc';

/** Machine codes the API returns in `{ code }` for KYC / age-gate failures. */
export const KYC_ERROR_CODES = Object.freeze([
  'KYC_AGE_REQUIRED',
  'KYC_REQUIRED',
]);

/** Machine codes for bank-beneficiary vs. KYC-identity mismatches (see lib/beneficiaryKycNameMatch.mjs). */
export const BENEFICIARY_ERROR_CODES = Object.freeze([
  'BENEFICIARY_NAME_MISMATCH',
  'BENEFICIARY_NAME_AMBIGUOUS',
  'BENEFICIARY_NAME_MISSING',
  'BENEFICIARY_NOT_VERIFIED',
  'KYC_IDENTITY_NAME_NOT_AVAILABLE',
  'KYC_NOT_VERIFIED',
]);

export const BENEFICIARY_MISMATCH_MESSAGE = 'Your verified bank account holder name does not match your verified identity (or bank beneficiary verification is not yet available). Please update or verify your bank account details before requesting this withdrawal.';

function normalizeCode(data) {
  return String(data?.code || '').trim().toUpperCase();
}

/**
 * Classify an API error payload. Prefers the structured `code` and only falls back to
 * regex matching on the message for legacy responses that carry no code.
 * @returns {{ kind: 'kyc'|'beneficiary'|'other', code: string, message: string }}
 */
export function classifyApiError(data, fallbackMessage = 'Request failed.') {
  const raw = String(data?.error || data?.message || data?.code || fallbackMessage);
  const code = normalizeCode(data);

  if (code) {
    if (BENEFICIARY_ERROR_CODES.includes(code)) {
      return { kind: 'beneficiary', code, message: BENEFICIARY_MISMATCH_MESSAGE };
    }
    if (KYC_ERROR_CODES.includes(code)) {
      return { kind: 'kyc', code, message: cleanKycMessage(raw) || raw };
    }
    return { kind: 'other', code, message: raw };
  }

  // Legacy fallback: no structured code on the response.
  if (/BENEFICIARY_NAME_MISMATCH|BENEFICIARY_NOT_VERIFIED|KYC_IDENTITY_NAME_NOT_AVAILABLE/i.test(raw)) {
    return { kind: 'beneficiary', code: '', message: BENEFICIARY_MISMATCH_MESSAGE };
  }
  if (isKycError(raw)) {
    return { kind: 'kyc', code: '', message: cleanKycMessage(raw) || raw };
  }
  return { kind: 'other', code: '', message: raw };
}

/** Toast action that deep-links the user to the KYC section of their profile. */
export const KYC_TOAST_ACTION = Object.freeze({ label: 'Proceed to KYC', path: KYC_PROFILE_PATH });
