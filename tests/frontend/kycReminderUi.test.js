import { describe, it, expect } from 'vitest';
import { isKycCompleted, needsKycReminder } from '../../lib/kycReminder.mjs';

/**
 * Frontend-facing KYC reminder UI rules (shared with server helpers).
 * Column / filter / action visibility must follow these predicates.
 */
describe('KYC reminder admin UI rules', () => {
  it('hides reminder action when KYC is completed', () => {
    expect(needsKycReminder({ kyc: 'VERIFIED' })).toBe(false);
    expect(isKycCompleted({ kyc: 'VERIFIED' })).toBe(true);
  });

  it('shows reminder action for incomplete statuses', () => {
    expect(needsKycReminder({ kyc: 'NOT_STARTED' })).toBe(true);
    expect(needsKycReminder({ kyc: 'PENDING' })).toBe(true);
    expect(needsKycReminder({ kyc: 'REJECTED' })).toBe(true);
  });

  it('Needs KYC filter predicate matches incomplete set', () => {
    const users = [
      { id: '1', kyc: 'VERIFIED' },
      { id: '2', kyc: 'NOT_STARTED' },
      { id: '3', kyc: 'UNDER_REVIEW' },
    ];
    const needs = users.filter((u) => needsKycReminder(u));
    expect(needs.map((u) => u.id)).toEqual(['2', '3']);
  });
});
