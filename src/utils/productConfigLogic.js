/**
 * Pure helpers for Admin product toggles (Wallet / Betting).
 * Kept free of React/DOM so they can be unit-tested under node (vitest).
 */

/** sessionStorage key. Bumped (v6) to purge older snapshots that cached a bad "all off" state. */
export const PRODUCT_CACHE_KEY = 'oddsyra_product_config_v6';

/** Older cache keys that must be removed so a poisoned "all off" snapshot never survives a deploy. */
export const LEGACY_PRODUCT_CACHE_KEYS = [
  'oddsyra_product_config_v1',
  'oddsyra_product_config_v2',
  'oddsyra_product_config_v3',
  'oddsyra_product_config_v4',
  'oddsyra_product_config_v5',
];

function truthy(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

/** Normalize an API / WS / cache payload into `{ walletEnabled, bettingEnabled, updatedAt }`. */
export function normalizeProductConfig(data) {
  const wallet = data?.walletEnabled ?? data?.wallet;
  const betting = data?.bettingEnabled ?? data?.betting;
  return {
    walletEnabled: truthy(wallet),
    bettingEnabled: truthy(betting),
    updatedAt: data?.updatedAt || null,
  };
}

/** True when the snapshot says every product is OFF (wallet and betting). */
export function isAllProductsOffSnapshot(data) {
  if (!data || typeof data !== 'object') return false;
  // PG review / Software Platform own the public surface — wallet+betting "off" is intentional there.
  if (truthy(data.pgReviewMode) || truthy(data.softwarePlatformEnabled)) return false;
  const cfg = normalizeProductConfig(data);
  return !cfg.walletEnabled && !cfg.bettingEnabled;
}

/**
 * The server answers `{ note: 'unavailable' }` (or a non-2xx) when it could not read the
 * configuration. Such payloads are NOT an Admin decision and must never be cached/applied.
 */
export function isProductApiFailure(data, httpOk = true) {
  if (!httpOk) return true;
  if (!data || typeof data !== 'object') return true;
  if (data.note === 'unavailable' || data.error === true) return true;
  return false;
}

/**
 * Whether a payload may be persisted to the session cache.
 * We refuse to cache "all off" snapshots: a transient fail-closed answer would otherwise
 * stick for the whole session and show "products disabled" forever.
 */
export function shouldCacheProductSnapshot(data) {
  return !isProductApiFailure(data) && !isAllProductsOffSnapshot(data);
}

/**
 * Decide what PlatformGate should render.
 *   'loading'     — config not yet resolved
 *   'retry'       — product API failed and we have no trustworthy config (show retry UI)
 *   'unavailable' — Admin turned both products off
 *   'allow'       — render the app (betting OR wallet is enabled, PG review mode, or route is exempt)
 */
export function platformGateDecision({
  ready,
  walletEnabled,
  bettingEnabled,
  loadError = false,
  isExempt = false,
  pgReviewMode = false,
}) {
  if (isExempt) return ready ? 'allow' : 'loading';
  if (!ready) return 'loading';
  // PG compliance mode: the compliance surface owns the page — never show "unavailable".
  if (pgReviewMode === true) return 'allow';
  if (loadError && !walletEnabled && !bettingEnabled) return 'retry';
  if (!walletEnabled && !bettingEnabled) return 'unavailable';
  return 'allow';
}

const EXEMPT_PREFIXES = [
  '/admin',
  '/trader',
  '/developer',
  '/api-docs',
  '/register',
  '/complete-profile',
  '/verify-email',
  '/reset-password',
  '/_oauth',
  '/terms',
  '/privacy',
  '/help',
  '/support',
  '/responsible-gaming',
  '/company',
  '/documents',
  '/desk',
];

export function isPlatformGateExemptPath(path = '/') {
  return EXEMPT_PREFIXES.some((prefix) => String(path).startsWith(prefix));
}
