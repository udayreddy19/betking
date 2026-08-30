/**
 * Client-side Private Access & Registration configuration.
 */

export const PRIVATE_ACCESS_MODE = import.meta.env.VITE_PRIVATE_ACCESS_MODE !== 'false';
export const REGISTRATION_ENABLED = import.meta.env.VITE_REGISTRATION_ENABLED === 'true';

const AUTHORIZED_EMAILS = [
  'iudayreddy19@gmail',
  'iudayreddy19@gmail.com',
  'admin@odssyra.com',
  'admin@oddsyra.com',
];

export function isUserAuthorizedForPrivateAccess(user) {
  if (!PRIVATE_ACCESS_MODE) return true;
  if (!user || !user.email) return false;
  const normalized = user.email.trim().toLowerCase();
  return AUTHORIZED_EMAILS.some((allowed) => (
    normalized === allowed.toLowerCase()
    || normalized.startsWith(allowed.toLowerCase() + '@')
    || allowed.toLowerCase().startsWith(normalized + '@')
    || normalized.startsWith(allowed.toLowerCase() + '.')
  ));
}
