/** Shared prod/demo feature gates for the frontend bundle. */

/** Client wallet / casino demo. Must be an explicit Vite env — never implied by local `vite` / development mode. */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === '1';

if (import.meta.env.PROD && DEMO_MODE) {
  throw new Error('DEMO_MODE is forbidden in production builds');
}

/** Casino lobby routes and nav are demo-only until a licensed aggregator is wired. */
export const CASINO_ENABLED = DEMO_MODE;

/** Paid/join fantasy stays off in production until a licensed contest provider exists. */
export const FANTASY_JOIN_ENABLED = import.meta.env.VITE_FANTASY_JOIN_ENABLED === '1' && !import.meta.env.PROD;

const CASINO_PATHS = new Set(['/casino', '/live-casino']);

export function isCasinoPath(path) {
  return CASINO_PATHS.has(path);
}

export function withoutCasinoLinks(links) {
  if (CASINO_ENABLED) return links;
  return links.filter((link) => !isCasinoPath(link.to));
}
