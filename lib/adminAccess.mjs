import { ADMIN_ROLES } from '../server/middleware/adminAuth.js';

function parseAdminEmails() {
  return String(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '')
    .split(/[,;\s]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEligibleUser(user) {
  if (!user) return false;
  const role = String(user.role || '').toUpperCase().replace(/[\s-]+/g, '_');
  if (['ADMIN', 'SUPER_ADMIN', 'SUPERADMIN'].includes(role)) return true;
  if (Object.values(ADMIN_ROLES).includes(role)) return true;
  const email = String(user.email || '').toLowerCase();
  return parseAdminEmails().includes(email);
}

export function adminJwtRoleForUser(user, _ignoredRequestedRole) {
  const role = String(user?.role || '').toUpperCase().replace(/[\s-]+/g, '_');
  if (Object.values(ADMIN_ROLES).includes(role)) return role;
  if (role === 'ADMIN' || role === 'SUPERADMIN') return ADMIN_ROLES.SUPER_ADMIN;
  return ADMIN_ROLES.SUPER_ADMIN;
}
