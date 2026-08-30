/**
 * Centralized Private Access & Registration Access Control Service — ODDSYRA
 *
 * Configurable via environment variables:
 * - PRIVATE_ACCESS_MODE (default: 'true')
 * - REGISTRATION_ENABLED (default: 'false')
 * - AUTHORIZED_USER_EMAILS (comma separated list)
 * - AUTHORIZED_ADMIN_EMAILS (comma separated list)
 */

const DEFAULT_AUTHORIZED_USERS = [
  'iudayreddy19@gmail',
  'iudayreddy19@gmail.com',
];

const DEFAULT_AUTHORIZED_ADMINS = [
  'admin@odssyra.com',
  'admin@oddsyra.com',
];

export function isPrivateAccessMode() {
  const envVal = process.env.PRIVATE_ACCESS_MODE;
  if (envVal === undefined || envVal === null || envVal === '') {
    return true; // Default to private access mode
  }
  return envVal === 'true' || envVal === '1' || envVal === true;
}

export function isRegistrationEnabled() {
  const envVal = process.env.REGISTRATION_ENABLED;
  if (envVal === undefined || envVal === null || envVal === '') {
    return false; // Default to registrations disabled
  }
  return envVal === 'true' || envVal === '1' || envVal === true;
}

export function getAuthorizedUserEmails() {
  const custom = process.env.AUTHORIZED_USER_EMAILS;
  if (custom && typeof custom === 'string') {
    return custom.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  }
  return DEFAULT_AUTHORIZED_USERS.map((e) => e.toLowerCase());
}

export function getAuthorizedAdminEmails() {
  const custom = process.env.AUTHORIZED_ADMIN_EMAILS;
  if (custom && typeof custom === 'string') {
    return custom.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  }
  return DEFAULT_AUTHORIZED_ADMINS.map((e) => e.toLowerCase());
}

function normalizeEmailForCheck(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

function matchEmail(target, allowedList) {
  const normalized = normalizeEmailForCheck(target);
  if (!normalized) return false;
  return allowedList.some((allowed) => {
    const normAllowed = allowed.toLowerCase();
    return normalized === normAllowed || normalized.startsWith(normAllowed + '@') || normAllowed.startsWith(normalized + '@') || normalized.startsWith(normAllowed + '.');
  });
}

export function isAuthorizedUser(email) {
  const allowed = getAuthorizedUserEmails();
  return matchEmail(email, allowed);
}

export function isAuthorizedAdmin(email) {
  const allowed = getAuthorizedAdminEmails();
  return matchEmail(email, allowed);
}

export function isPrivateAccessAllowed(email) {
  if (!isPrivateAccessMode()) return true;
  return isAuthorizedUser(email) || isAuthorizedAdmin(email);
}
