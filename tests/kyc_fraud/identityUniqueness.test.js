import { describe, it, expect } from 'vitest';
import {
  normalizeIndianPhone,
  normalizeAadhaar,
  alreadyLinkedError,
} from '../../lib/userIdentity.mjs';

describe('identity uniqueness helpers', () => {
  it('treats +91, 0-prefix, and spaced numbers as the same mobile', () => {
    expect(normalizeIndianPhone('+91 98765 43210')).toBe('9876543210');
    expect(normalizeIndianPhone('09876543210')).toBe('9876543210');
    expect(normalizeIndianPhone('9876543210')).toBe('9876543210');
    expect(normalizeIndianPhone('12345')).toBeNull();
  });

  it('strips Aadhaar spaces', () => {
    expect(normalizeAadhaar('2345 6789 0123')).toBe('234567890123');
  });

  it('uses the same already-linked copy for email, phone, PAN, and Aadhaar', () => {
    expect(alreadyLinkedError('email').message).toBe('This email is already linked to another account.');
    expect(alreadyLinkedError('phone').message).toBe('This mobile number is already linked to another account.');
    expect(alreadyLinkedError('pan').message).toBe('This PAN is already linked to another account.');
    expect(alreadyLinkedError('aadhaar').message).toBe('This Aadhaar is already linked to another account.');
    expect(alreadyLinkedError('aadhaar').code).toBe('DUPLICATE_AADHAAR');
    expect(alreadyLinkedError('email').status).toBe(409);
  });
});
