import { describe, it, expect, beforeEach } from 'vitest';
import { updateTenantSportsConfig, getTenantSportsConfig, createWhiteLabelTenant } from '../../lib/tenantEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 14 Tenant Odds Configuration Isolation Tests', () => {
  beforeEach(async () => {
    await query(`INSERT INTO sports (sport_id, name, slug) VALUES ('CRICKET', 'Cricket', 'cricket') ON CONFLICT DO NOTHING;`);
  });

  it('Updating Tenant A odds margin does NOT affect Tenant B margin', async () => {
    const runTag = Date.now();
    const tenantA = `tenant_margin_a_${runTag}`;
    const tenantB = `tenant_margin_b_${runTag}`;

    await createWhiteLabelTenant({ id: tenantA, name: `Tenant A ${runTag}`, displayName: 'Tenant A', slug: `slug_a_${runTag}`, domain: `dom_a_${runTag}.com` });
    await createWhiteLabelTenant({ id: tenantB, name: `Tenant B ${runTag}`, displayName: 'Tenant B', slug: `slug_b_${runTag}`, domain: `dom_b_${runTag}.com` });

    // Set 8.5% margin for Tenant A
    await updateTenantSportsConfig(tenantA, 'CRICKET', { marginPercentage: 8.50 });

    // Set 3.5% margin for Tenant B
    await updateTenantSportsConfig(tenantB, 'CRICKET', { marginPercentage: 3.50 });

    const configA = await getTenantSportsConfig(tenantA, 'CRICKET');
    const configB = await getTenantSportsConfig(tenantB, 'CRICKET');

    expect(configA.marginPercentage).toBe(8.50);
    expect(configB.marginPercentage).toBe(3.50);
  });
});
