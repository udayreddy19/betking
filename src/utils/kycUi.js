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
