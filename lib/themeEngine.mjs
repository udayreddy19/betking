import { resolveTenantContext } from './tenantEngine.mjs';

/**
 * Enterprise Theme Engine (lib/themeEngine.mjs)
 * Delegates branding and theme resolution to PostgreSQL-backed tenantEngine.
 */
export function getThemeConfig(themeId = 'dark', tenantBranding = {}) {
  const primary = tenantBranding.primaryColor || (themeId === 'neon' ? '#eab308' : '#10b981');
  const bg = themeId === 'light' ? '#f8fafc' : '#0b0f19';
  const surface = themeId === 'light' ? '#ffffff' : '#1e293b';

  return {
    name: tenantBranding.displayName || 'Tenant Theme',
    bg,
    primary,
    surface,
    logo: tenantBranding.logo || '/assets/logo.png',
  };
}
