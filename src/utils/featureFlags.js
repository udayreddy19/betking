/** Shared prod/demo feature gates for the frontend bundle. */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === '1' || import.meta.env.DEV;

/** Casino lobby routes and nav are demo-only until launch. */
export const CASINO_ENABLED = DEMO_MODE;

const CASINO_PATHS = new Set(['/casino', '/live-casino']);

export function isCasinoPath(path) {
  return CASINO_PATHS.has(path);
}

export function withoutCasinoLinks(links) {
  if (CASINO_ENABLED) return links;
  return links.filter((link) => !isCasinoPath(link.to));
}
