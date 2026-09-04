import { ADMIN_ROLES } from '../server/middleware/adminAuth.js';

function parseAdminEmails() {
  return String(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '')
    .split(/[,;\s]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeAdminRole(value) {
  return String(value || '').toUpperCase().replace(/[\s-]+/g, '_');
}

export function isAdminEligibleUser(user) {
  if (!user) return false;
  const role = normalizeAdminRole(user.admin_role || user.adminRole || user.role);
  if (['ADMIN', 'SUPER_ADMIN', 'SUPERADMIN'].includes(role)) return true;
  if (Object.values(ADMIN_ROLES).includes(role)) return true;
  const email = String(user.email || '').toLowerCase();
  return parseAdminEmails().includes(email);
}

/**
 * Resolve the admin JWT role for an eligible account.
 * Prefer DB `admin_role` / `role` when it is a known admin role.
 * Allowlisted emails with only USER (or unknown) role do NOT become SUPER_ADMIN:
 * use ADMIN_DEFAULT_ROLE when set to a valid ADMIN_ROLES value, else OPERATIONS_ADMIN.
 */
export function adminJwtRoleForUser(user, _ignoredRequestedRole) {
  const role = normalizeAdminRole(user?.admin_role || user?.adminRole || user?.role);
  if (Object.values(ADMIN_ROLES).includes(role)) return role;
  if (role === 'ADMIN' || role === 'SUPERADMIN') return ADMIN_ROLES.SUPER_ADMIN;

  const envDefault = normalizeAdminRole(process.env.ADMIN_DEFAULT_ROLE);
  if (Object.values(ADMIN_ROLES).includes(envDefault)) return envDefault;
  return ADMIN_ROLES.OPERATIONS_ADMIN;
}
