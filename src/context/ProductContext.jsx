import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  LEGACY_PRODUCT_CACHE_KEYS,
  PRODUCT_CACHE_KEY,
  isAllProductsOffSnapshot,
  isProductApiFailure,
  shouldCacheProductSnapshot,
} from '../utils/productConfigLogic';

export { isAllProductsOffSnapshot };

const ProductContext = createContext({
  walletEnabled: false,
  bettingEnabled: false,
  pgReviewMode: false,
  softwarePlatformEnabled: false,
  softwarePlatformName: '',
  ready: false,
  loadError: false,
  isWalletEnabled: () => false,
  isBettingEnabled: () => false,
  refresh: async () => {},
  retry: async () => {},
});

/** v6+: purges older snapshots that cached a bad "all off" state. */
export const PRODUCT_CONFIG_CACHE_KEY = PRODUCT_CACHE_KEY;
const CACHE_KEY = PRODUCT_CONFIG_CACHE_KEY;
const LEGACY_CACHE_KEYS = LEGACY_PRODUCT_CACHE_KEYS;

function normalize(data, previous = null) {
  const wallet = data?.walletEnabled ?? data?.wallet;
  const betting = data?.bettingEnabled ?? data?.betting;
  const hasWallet = data != null && ('walletEnabled' in data || 'wallet' in data);
  const hasBetting = data != null && ('bettingEnabled' in data || 'betting' in data);
  const hasPg = data != null && ('pgReviewMode' in data || 'pg_review_mode' in data);
  const hasSoftware = data != null && 'softwarePlatformEnabled' in data;
  const software = data?.softwarePlatformEnabled;
  const pg = data?.pgReviewMode ?? data?.pg_review_mode;
  return {
    walletEnabled: hasWallet
      ? (wallet === true || wallet === 'true' || wallet === 1)
      : (previous?.walletEnabled === true),
    bettingEnabled: hasBetting
      ? (betting === true || betting === 'true' || betting === 1)
      : (previous?.bettingEnabled === true),
    // Do not wipe PG mode when a partial live payload omits the field.
    pgReviewMode: hasPg
      ? (pg === true || pg === 'true' || pg === 1)
      : (previous?.pgReviewMode === true),
    // Same partial-payload protection as pgReviewMode.
    softwarePlatformEnabled: hasSoftware
      ? (software === true || software === 'true' || software === 1)
      : (previous?.softwarePlatformEnabled === true),
    softwarePlatformName: String(
      data?.softwarePlatformName != null
        ? data.softwarePlatformName
        : (previous?.softwarePlatformName || ''),
    ).trim(),
    updatedAt: data?.updatedAt || previous?.updatedAt || null,
  };
}

function readCachedConfig() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Purge poisoned "everything off" snapshots (outage / bad deploy) instead of trusting them.
    if (!shouldCacheProductSnapshot(parsed)) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return normalize(parsed);
  } catch {
    return null;
  }
}

function writeCachedConfig(config) {
  try {
    if (!shouldCacheProductSnapshot(config)) {
      sessionStorage.removeItem(CACHE_KEY);
      return;
    }
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(config));
    for (const legacyKey of LEGACY_CACHE_KEYS) {
      sessionStorage.removeItem(legacyKey);
    }
  } catch {
    /* ignore */
  }
}

function purgeLegacyProductConfigCaches() {
  try {
    for (const legacyKey of LEGACY_CACHE_KEYS) {
      sessionStorage.removeItem(legacyKey);
    }
  } catch {
    /* ignore */
  }
}

function isAdminShellPath() {
  try {
    return /^\/(admin|console)(\/|$)/.test(location.pathname);
  } catch {
    return false;
  }
}

/** Admin (and others) can push a fresh config into open tabs immediately after PUT. */
export function publishLocalProductConfig(data) {
  // No payload (or a failure payload): never publish a fake all-off config — just ask providers to re-fetch.
  if (!data || typeof data !== 'object' || isProductApiFailure(data)) {
    try {
      window.dispatchEvent(new CustomEvent('oddsyra:product-config', { detail: null }));
    } catch {
      /* ignore */
    }
    return null;
  }
  const normalized = normalize(data);
  writeCachedConfig(normalized);
  try {
    window.dispatchEvent(new CustomEvent('oddsyra:product-config', { detail: normalized }));
  } catch {
    /* ignore */
  }
  // Cross-tab + software-shell boot: force other tabs to drop stale sp_public ASAP.
  try {
    localStorage.setItem(
      'oy_sp_mode_sync',
      JSON.stringify({
        softwarePlatformEnabled: normalized.softwarePlatformEnabled === true,
        bettingEnabled: normalized.bettingEnabled === true,
        walletEnabled: normalized.walletEnabled === true,
        t: Date.now(),
      }),
    );
  } catch {
    /* ignore */
  }
  return normalized;
}

/**
 * Sync nginx routing cookie so the next document request hits the right SPA root.
 * Server `/software-mode` is the source of truth — never clear the cookie from a
 * stale client snapshot (that caused software ↔ sportsbook thrashing).
 * @returns {Promise<boolean|null>} server-enabled flag, or null if unavailable
 */
export async function syncPublicProductShell(config) {
  if (typeof document === 'undefined') return null;
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  const setOn = () => {
    document.cookie = `sp_public=1; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax${secure}`;
  };
  const setOff = () => {
    document.cookie = 'sp_public=; path=/; max-age=0; SameSite=Lax';
    document.cookie = 'sp_public=; path=/; max-age=0; SameSite=Lax; Secure';
  };
  try {
    const res = await fetch(`/api/config/software-mode?_=${Date.now()}`, {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const body = await res.json().catch(() => null);
      if (body && !body.unavailable
        && (typeof body.enabled === 'boolean' || typeof body.softwarePlatformEnabled === 'boolean')) {
        const software = !!(body.enabled || body.softwarePlatformEnabled);
        if (software) setOn();
        else setOff();
        return software;
      }
    }
  } catch {
    /* fall through */
  }
  // Server blip: only set ON from client hint — never clear (avoids thrash).
  if (config?.softwarePlatformEnabled === true) {
    setOn();
    return true;
  }
  return null;
}

export function ProductProvider({ children }) {
  const cached = typeof window !== 'undefined' ? readCachedConfig() : null;
  // Fail-closed until the server answers: never flash Betting UI when Betting is OFF.
  const [config, setConfig] = useState(
    cached || {
      walletEnabled: false,
      bettingEnabled: false,
      pgReviewMode: false,
      softwarePlatformEnabled: false,
      softwarePlatformName: '',
      updatedAt: null,
    },
  );
  // Never treat a cached "everything off" snapshot as authoritative — wait for the API.
  const [ready, setReady] = useState(Boolean(cached));
  const [loadError, setLoadError] = useState(false);
  // True once the server (or WS / admin publish) gave a trustworthy answer in this session.
  const hasTrustedConfig = useRef(Boolean(cached));
  const shellSoftwareRef = useRef(
    cached ? cached.softwarePlatformEnabled === true : null,
  );
  const swappingRef = useRef(false);

  const applyConfig = useCallback((next) => {
    hasTrustedConfig.current = true;
    setLoadError(false);
    setConfig((prev) => {
      const normalized = normalize(next, prev);
      writeCachedConfig(normalized);
      return normalized;
    });
  }, []);

  const maybeSwapPublicShell = useCallback(async (normalized) => {
    if (isAdminShellPath() || swappingRef.current) return;
    const prev = shellSoftwareRef.current;
    // Cookie + enabled flag come from the server endpoint — never from a stale client snapshot.
    const serverEnabled = await syncPublicProductShell(normalized);
    if (serverEnabled === null) return; // blip — keep current SPA
    if (prev === null) {
      shellSoftwareRef.current = serverEnabled;
      return;
    }
    if (prev === serverEnabled) return;
    swappingRef.current = true;
    shellSoftwareRef.current = serverEnabled;
    try { sessionStorage.removeItem('sp_handoff_reload'); } catch { /* ignore */ }
    location.replace(serverEnabled ? `/?_sp=1&_=${Date.now()}` : `/?_sp=0&_=${Date.now()}`);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/config/products?_=${Date.now()}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json', Pragma: 'no-cache' },
      });
      const data = await res.json().catch(() => null);
      // 503 / { note: 'unavailable' } is NOT an admin decision — never apply or cache it.
      if (!isProductApiFailure(data, res.ok)) {
        const normalized = normalize(data);
        applyConfig(data);
        setReady(true);
        await maybeSwapPublicShell(normalized);
        return;
      }
    } catch {
      // Keep last known — never apply fail-closed software=false from a blip.
    }
    // Transient failure: keep last trusted config. Only surface an error (retry UI) when we have
    // nothing trustworthy — never become "ready" from an all-off guess.
    if (!hasTrustedConfig.current) setLoadError(true);
    setReady(true);
  }, [applyConfig, maybeSwapPublicShell]);

  const retry = useCallback(async () => {
    setReady(false);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    purgeLegacyProductConfigCaches();
    // Do not clear/set cookie from possibly-stale cache on mount — wait for refresh().
    refresh();
    const timer = setInterval(refresh, 15000);
    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    const onLocal = (ev) => {
      const detail = ev?.detail;
      if (detail && typeof detail === 'object') {
        const normalized = normalize(detail);
        applyConfig(detail);
        setReady(true);
        maybeSwapPublicShell(normalized);
      } else {
        refresh();
      }
    };
    window.addEventListener('oddsyra:product-config', onLocal);

    const onStorage = (ev) => {
      if (ev.key !== 'oy_sp_mode_sync' || !ev.newValue) return;
      try {
        const msg = JSON.parse(ev.newValue);
        if (msg && typeof msg.softwarePlatformEnabled === 'boolean') {
          const normalized = normalize(msg);
          applyConfig(msg);
          setReady(true);
          maybeSwapPublicShell(normalized);
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('storage', onStorage);

    let unsub = () => {};
    import('../services/liveFeedSocket.js')
      .then(({ subscribeLiveChannel }) => {
        unsub = subscribeLiveChannel('config:products', (msg) => {
          const payload = msg?.payload || msg;
          if (payload && typeof payload === 'object') {
            const normalized = normalize(payload);
            applyConfig(payload);
            setReady(true);
            maybeSwapPublicShell(normalized);
          } else {
            refresh();
          }
        });
      })
      .catch(() => {});

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('oddsyra:product-config', onLocal);
      window.removeEventListener('storage', onStorage);
      unsub();
    };
    // Mount once — refresh/apply callbacks are stable enough for this provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isWalletEnabled = useCallback(() => config.walletEnabled === true, [config.walletEnabled]);
  const isBettingEnabled = useCallback(() => config.bettingEnabled === true, [config.bettingEnabled]);

  const value = useMemo(() => ({
    walletEnabled: config.walletEnabled === true,
    bettingEnabled: config.bettingEnabled === true,
    pgReviewMode: config.pgReviewMode === true,
    softwarePlatformEnabled: config.softwarePlatformEnabled === true,
    softwarePlatformName: String(config.softwarePlatformName || '').trim(),
    updatedAt: config.updatedAt,
    ready,
    loadError,
    isWalletEnabled,
    isBettingEnabled,
    refresh,
    retry,
  }), [config, ready, loadError, isWalletEnabled, isBettingEnabled, refresh, retry]);

  return (
    <ProductContext.Provider value={value}>
      {children}
    </ProductContext.Provider>
  );
}

export function useProducts() {
  return useContext(ProductContext);
}
