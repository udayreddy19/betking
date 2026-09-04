/**
 * Client-side admin eligibility — trust server session only.
 * Never gate on a hardcoded email allowlist (emails can collide / leak).
 */
export function isAdminEligibleUser(user) {
  if (!user || typeof user !== 'object') return false;
  return Boolean(user.isAdmin);
}

export default isAdminEligibleUser;
