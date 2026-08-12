import { resolveTenantContext, createWhiteLabelTenant } from './tenantEngine.mjs';

/**
 * Enterprise White Label Engine (lib/whiteLabelEngine.mjs)
 * Re-exports PostgreSQL-backed tenantEngine functions to eliminate in-memory store duplication.
 */
export {
  resolveTenantContext,
  createWhiteLabelTenant,
};

export async function getWhiteLabelConfig(tenantId = 'tenant_default') {
  return resolveTenantContext({ headers: { 'x-tenant-id': tenantId } });
}
