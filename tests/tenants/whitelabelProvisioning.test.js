import { describe, it, expect } from 'vitest';
import { createWhiteLabelTenant, resolveTenantContext } from '../../lib/tenantEngine.mjs';

describe('Phase 14 Whitelabel Tenant Provisioning Tests', () => {
  it('Provisioning a white-label tenant creates database record and resolves domain context', async () => {
    const slug = `partner_${Date.now()}`;
    const domain = `${slug}.partner.com`;

    const provision = await createWhiteLabelTenant({
      name: `Partner ${slug}`,
      displayName: `Partner Sportsbook`,
      slug,
      domain,
      currency: 'INR',
      branding: { primaryColor: '#8b5cf6', logo: '/assets/partner.png' },
    });

    expect(provision.success).toBe(true);
    expect(provision.tenantId).toBe(`tenant_${slug}`);

    // Resolve tenant by custom domain
    const context = await resolveTenantContext({ headers: { host: domain } });
    expect(context.id).toBe(provision.tenantId);
    expect(context.displayName).toBe('Partner Sportsbook');
  });
});
