import { describe, expect, it } from 'vitest';
import { classifyApiError, BENEFICIARY_MISMATCH_MESSAGE } from '../../src/utils/kycUi.js';

describe('classifyApiError', () => {
  it('prefers structured code over message text', () => {
    expect(classifyApiError({ code: 'KYC_REQUIRED', error: 'Something unrelated' }).kind).toBe('kyc');
    expect(classifyApiError({ code: 'BENEFICIARY_NAME_MISMATCH', error: 'whatever' })).toMatchObject({
      kind: 'beneficiary',
      message: BENEFICIARY_MISMATCH_MESSAGE,
    });
    // A coded, non-KYC error is never reclassified by regex on its message.
    expect(classifyApiError({ code: 'INSUFFICIENT_BALANCE', error: 'KYC_REQUIRED: look-alike' }).kind).toBe('other');
  });

  it('falls back to message matching only for legacy uncoded errors', () => {
    expect(classifyApiError({ error: 'KYC_AGE_REQUIRED: must be 18 or older' })).toMatchObject({
      kind: 'kyc',
      message: 'must be 18 or older',
    });
    expect(classifyApiError({ error: 'BENEFICIARY_NOT_VERIFIED' }).kind).toBe('beneficiary');
    expect(classifyApiError({ error: 'boom' })).toMatchObject({ kind: 'other', message: 'boom' });
  });
});
