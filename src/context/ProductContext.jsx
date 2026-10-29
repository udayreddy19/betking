import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const ProductContext = createContext({
  walletEnabled: false,
  bettingEnabled: false,
  pgReviewMode: false,
  softwarePlatformEnabled: false,
  ready: false,
  isWalletEnabled: () => false,
  isBettingEnabled: () => false,
  refresh: async () => {},
});

/** Bump when public product flags shape changes so stale sessionStorage cannot pin wrong mode. */
export const PRODUCT_CONFIG_CACHE_KEY = 'oddsyra_product_config_v6';
const CACHE_KEY = PRODUCT_CONFIG_CACHE_KEY;
const LEGACY_CACHE_KEYS = [
  'oddsyra_product_config_v1',
  'oddsyra_product_config_v2',
  'oddsyra_product_config_v3',
  'oddsyra_product_config_v4',
  'oddsyra_product_config_v5',
];

/** Stale sessionStorage from an outage often pins betting off while the API is healthy. */
function isAllProductsOffSnapshot(cfg) {
  if (!cfg || cfg.pgReviewMode === true) return false;
  return cfg.bettingEnabled !== true && cfg.walletEnabled !== true;
}

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
    updatedAt: data?.updatedAt || previous?.updatedAt || null,
  };
}

function readCachedConfig() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeCachedConfig(config) {
  try {
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
        walletEnabled: true,
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
      updatedAt: null,
    },
  );
  // Never treat a cached "everything off" snapshot as authoritative — wait for the API.
  const [ready, setReady] = useState(Boolean(cached) && !isAllProductsOffSnapshot(cached));
  const shellSoftwareRef = useRef(
    cached ? cached.softwarePlatformEnabled === true : null,
  );
  const swappingRef = useRef(false);

  const applyConfig = useCallback((next) => {
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
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.note !== 'unavailable') {
        const normalized = normalize(data);
        applyConfig(data);
        setReady(true);
        await maybeSwapPublicShell(normalized);
        return;
      }
    } catch {
      // Keep last known — never apply fail-closed software=false from a blip.
    }
    setReady((wasReady) => {
      if (wasReady) return true;
      if (cached && !isAllProductsOffSnapshot(cached)) return true;
      return false;
    });
  }, [applyConfig, cached, maybeSwapPublicShell]);

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
    updatedAt: config.updatedAt,
    ready,
    isWalletEnabled,
    isBettingEnabled,
    refresh,
  }), [config, ready, isWalletEnabled, isBettingEnabled, refresh]);

  return (
    <ProductContext.Provider value={value}>
      {children}
    </ProductContext.Provider>
  );
}

export function useProducts() {
  return useContext(ProductContext);
}
