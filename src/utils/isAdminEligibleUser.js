/**
 * Client-side mirror of lib/adminAccess.mjs — who may see / open Admin Portal.
 * Do not use adminToken presence alone; that leaks the link to any browser with a stale JWT.
 */

const NORMALIZED_ADMIN_ROLES = new Set([
  'ADMIN',
  'SUPER_ADMIN',
  'SUPERADMIN',
  'FINANCE_ADMIN',
  'TRADING_ADMIN',
  'SUPPORT_AGENT',
  'RISK_ANALYST',
  'MARKETING_ADMIN',
  'OPERATIONS_ADMIN',
]);

function parseAdminEmailsFromEnv() {
  const raw = String(import.meta.env.VITE_ADMIN_EMAILS || '').trim();
  if (!raw) return [];
  return raw.split(/[,;\s]+/).map((v) => v.trim().toLowerCase()).filter(Boolean);
}

export function isAdminEligibleUser(user) {
  if (!user) return false;

  const role = String(user.role || '').toUpperCase().replace(/[\s-]+/g, '_');
  if (NORMALIZED_ADMIN_ROLES.has(role)) return true;

  const email = String(user.email || user.username || '').trim().toLowerCase();
  if (!email) return false;
  if (email === 'admin@oddsyra.com') return true;

  return parseAdminEmailsFromEnv().includes(email);
}
