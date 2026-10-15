import { PAN_REGEX, AADHAAR_REGEX } from '../../kycEngine.mjs';
import { normalizeTestResult, failResult } from '../result.mjs';
import { ERROR_CODES } from '../errorCodes.mjs';

const FUTURE_PROVIDERS = {
  'kyc-cashfree': { name: 'Cashfree Secure ID', pan: true, aadhaar: true, bank: true },
  'kyc-surepass': { name: 'Surepass', pan: true, aadhaar: true, bank: true },
  'kyc-hyperverge': { name: 'HyperVerge', pan: true, aadhaar: true, bank: false },
  'kyc-signzy': { name: 'Signzy', pan: true, aadhaar: true, bank: true },
};

export async function testInternalKycEngine() {
  const panOk = typeof PAN_REGEX?.test === 'function';
  const aadhaarOk = typeof AADHAAR_REGEX?.test === 'function';
  return normalizeTestResult({
    success: panOk && aadhaarOk,
    statusCode: 200,
    responseTimeMs: 0,
    implementation: 'REAL',
    summary: {
      engine: 'internal',
      panFormatValidator: panOk,
      aadhaarFormatValidator: aadhaarOk,
      externalProvider: false,
      panVerification: 'INTERNAL_FORMAT_ONLY',
      aadhaarVerification: 'INTERNAL_FORMAT_ONLY',
      note: 'No customer KYC lookup. No Aadhaar/PAN values are processed or returned.',
    },
    data: {
      engine: 'internal',
      panFormatValidator: panOk,
      aadhaarFormatValidator: aadhaarOk,
    },
  });
}

export async function testKycVendorPlaceholder(apiId) {
  const meta = FUTURE_PROVIDERS[apiId] || { name: apiId };
  return failResult({
    code: ERROR_CODES.NOT_CONFIGURED,
    message: `${meta.name} is OUT_OF_SCOPE — not integrated`,
    extra: {
      healthStatus: 'OUT_OF_SCOPE',
      summary: {
        provider: meta.name,
        panVerification: 'OUT_OF_SCOPE',
        aadhaarVerification: 'OUT_OF_SCOPE',
        bankVerification: meta.bank ? 'OUT_OF_SCOPE' : 'NOT_APPLICABLE',
        sandbox: false,
        health: 'OUT_OF_SCOPE',
        note: 'External KYC vendors are intentionally out of scope. Internal format-only KYC is the production path; verification is never faked.',
      },
    },
  });
}
