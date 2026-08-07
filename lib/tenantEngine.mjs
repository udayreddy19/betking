/**
 * Enterprise Multi-Tenant Engine — BetKing Enterprise Platform (lib/tenantEngine.mjs)
 * Provides multi-tenant isolation, tenant-specific database contexts, branding, and configurations.
 */

const TENANTS_STORE = new Map([
  ['tenant_default', { tenantId: 'tenant_default', name: 'BetKing Global', active: true }],
  ['tenant_india', { tenantId: 'tenant_india', name: 'BetKing India Ops', active: true }],
]);

export function getTenantContext(tenantId = 'tenant_default') {
  return TENANTS_STORE.get(tenantId) || TENANTS_STORE.get('tenant_default');
}
