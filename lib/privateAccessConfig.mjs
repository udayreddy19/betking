/**
 * Centralized Private Access Mode Configuration (Priority 30)
 *
 * Provides a single source of truth for:
 * - PRIVATE_ACCESS_MODE (boolean)
 * - REGISTRATION_ENABLED (boolean)
 * - SEO_INDEXING_ENABLED (boolean)
 * - PUBLIC_SITEMAP_ENABLED (boolean)
 */

export function getPrivateAccessConfig() {
  const isPrivateMode = process.env.PRIVATE_ACCESS_MODE === 'true';
  const registrationExplicit = process.env.REGISTRATION_ENABLED;
  const seoIndexingExplicit = process.env.SEO_INDEXING_ENABLED;
  const sitemapExplicit = process.env.PUBLIC_SITEMAP_ENABLED;

  // In private mode, registration is disabled by default unless explicitly forced
  const registrationEnabled = registrationExplicit != null
    ? registrationExplicit === 'true'
    : !isPrivateMode;

  // In private mode, SEO indexing is disabled by default
  const seoIndexingEnabled = seoIndexingExplicit != null
    ? seoIndexingExplicit === 'true'
    : !isPrivateMode;

  // In private mode, sitemap is excluded by default
  const publicSitemapEnabled = sitemapExplicit != null
    ? sitemapExplicit === 'true'
    : !isPrivateMode;

  return {
    privateAccessMode: isPrivateMode,
    registrationEnabled,
    seoIndexingEnabled,
    publicSitemapEnabled,
  };
}

export function isPrivateAccessModeActive() {
  return getPrivateAccessConfig().privateAccessMode;
}

export function isRegistrationAllowed() {
  return getPrivateAccessConfig().registrationEnabled;
}

export function isSeoIndexingAllowed() {
  return getPrivateAccessConfig().seoIndexingEnabled;
}

export function isPublicSitemapAllowed() {
  return getPrivateAccessConfig().publicSitemapEnabled;
}

/**
 * Check whether a user has permission to access private sportsbook functionality.
 * Centralized authorization — no scattered hard-coded email checks.
 */
export function canAccessPrivateSportsbook(user) {
  if (!isPrivateAccessModeActive()) {
    return true; // Public access mode — open to all
  }
  if (!user) {
    return false;
  }
  const role = String(user.role || '').toUpperCase();
  const allowedRoles = ['ADMIN', 'SUPER_ADMIN', 'SUPERADMIN', 'TESTER', 'VIP', 'AUTHORIZED_USER'];
  if (allowedRoles.includes(role)) {
    return true;
  }
  if (Array.isArray(user.permissions) && user.permissions.includes('sportsbook_access')) {
    return true;
  }
  return false;
}
