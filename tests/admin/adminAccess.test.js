import { describe, it, expect, afterEach } from 'vitest';
import { isAdminEligibleUser, adminJwtRoleForUser } from '../../lib/adminAccess.mjs';

describe('admin access eligibility', () => {
  const originalEmails = process.env.ADMIN_EMAILS;

  afterEach(() => {
    if (originalEmails == null) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = originalEmails;
  });

  it('allows ADMIN and SUPER_ADMIN roles', () => {
    expect(isAdminEligibleUser({ email: 'a@x.com', role: 'ADMIN' })).toBe(true);
    expect(isAdminEligibleUser({ email: 'a@x.com', role: 'SUPER_ADMIN' })).toBe(true);
  });

  it('allows emails listed in ADMIN_EMAILS', () => {
    process.env.ADMIN_EMAILS = 'ops@oddsyra.com, owner@oddsyra.com';
    expect(isAdminEligibleUser({ email: 'owner@oddsyra.com', role: 'USER' })).toBe(true);
    expect(isAdminEligibleUser({ email: 'player@oddsyra.com', role: 'USER' })).toBe(false);
  });

  it('maps ADMIN accounts to SUPER_ADMIN and preserves explicit admin roles', () => {
    expect(adminJwtRoleForUser({ role: 'ADMIN' })).toBe('SUPER_ADMIN');
    expect(adminJwtRoleForUser({ role: 'FINANCE_ADMIN' })).toBe('FINANCE_ADMIN');
    expect(adminJwtRoleForUser({ admin_role: 'RISK_ANALYST', role: 'USER' })).toBe('RISK_ANALYST');
  });

  it('defaults allowlisted USER accounts to OPERATIONS_ADMIN (not SUPER_ADMIN)', () => {
    expect(adminJwtRoleForUser({ role: 'USER' }, 'FINANCE_ADMIN')).toBe('OPERATIONS_ADMIN');
    expect(adminJwtRoleForUser({ role: 'ADMIN' }, 'FINANCE_ADMIN')).toBe('SUPER_ADMIN');
  });

  it('honors ADMIN_DEFAULT_ROLE for allowlisted users without an admin role', () => {
    const prev = process.env.ADMIN_DEFAULT_ROLE;
    process.env.ADMIN_DEFAULT_ROLE = 'FINANCE_ADMIN';
    try {
      expect(adminJwtRoleForUser({ role: 'USER' })).toBe('FINANCE_ADMIN');
    } finally {
      if (prev == null) delete process.env.ADMIN_DEFAULT_ROLE;
      else process.env.ADMIN_DEFAULT_ROLE = prev;
    }
  });
});
