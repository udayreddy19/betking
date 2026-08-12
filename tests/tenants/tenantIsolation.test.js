import { describe, it, expect } from 'vitest';
import { validateTenantAccess } from '../../lib/tenantEngine.mjs';

describe('Phase 14 Tenant Authorization Isolation Tests', () => {
  it('Requester tenant matching target tenant succeeds', () => {
    const res = validateTenantAccess({
      requesterTenantId: 'tenant_alpha',
      targetTenantId: 'tenant_alpha',
      isSuperAdmin: false,
    });
    expect(res.allowed).toBe(true);
  });

  it('Cross-tenant access attempt by non-Super-Admin throws TENANT_ACCESS_DENIED', () => {
    expect(() =>
      validateTenantAccess({
        requesterTenantId: 'tenant_alpha',
        targetTenantId: 'tenant_beta',
        isSuperAdmin: false,
      })
    ).toThrow("TENANT_ACCESS_DENIED: Requester tenant 'tenant_alpha' cannot access target tenant 'tenant_beta' data");
  });

  it('Super Admin bypasses tenant isolation with SUPER_ADMIN_OVERRIDE', () => {
    const res = validateTenantAccess({
      requesterTenantId: 'tenant_alpha',
      targetTenantId: 'tenant_beta',
      isSuperAdmin: true,
    });
    expect(res.allowed).toBe(true);
    expect(res.reason).toBe('SUPER_ADMIN_OVERRIDE');
  });
});
