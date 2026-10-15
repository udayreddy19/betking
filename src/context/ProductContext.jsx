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
  normalizeProductConfig,
  shouldCacheProductSnapshot,
} from '../utils/productConfigLogic';

export { isAllProductsOffSnapshot, normalizeProductConfig };

const ProductContext = createContext({
  walletEnabled: false,
  bettingEnabled: false,
  ready: false,
  loadError: false,
  isWalletEnabled: () => false,
  isBettingEnabled: () => false,
  refresh: async () => {},
  retry: async () => {},
});

const normalize = normalizeProductConfig;

function purgeLegacyCaches() {
  try {
    for (const key of LEGACY_PRODUCT_CACHE_KEYS) sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function readCachedConfig() {
  try {
    purgeLegacyCaches();
    const raw = sessionStorage.getItem(PRODUCT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Purge bad "all off" snapshots instead of trusting them.
    if (!shouldCacheProductSnapshot(parsed)) {
      sessionStorage.removeItem(PRODUCT_CACHE_KEY);
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
      sessionStorage.removeItem(PRODUCT_CACHE_KEY);
      return;
    }
    sessionStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
}

/**
 * Push a product configuration into every mounted ProductProvider immediately (Admin saves,
 * Payment Gateway toggles, ...). With no argument it just asks providers to re-fetch.
 * Uses the walletEnabled / bettingEnabled values that were actually saved — never hard-coded.
 */
export function publishLocalProductConfig(config) {
  if (typeof window === 'undefined') return;
  let detail = null;
  if (config && typeof config === 'object') {
    const normalized = normalize(config);
    detail = {
      walletEnabled: normalized.walletEnabled,
      bettingEnabled: normalized.bettingEnabled,
      updatedAt: config.updatedAt || new Date().toISOString(),
    };
    writeCachedConfig(detail);
  }
  window.dispatchEvent(new CustomEvent('oddsyra:product-config', { detail }));
}

export function ProductProvider({ children }) {
  const cached = typeof window !== 'undefined' ? readCachedConfig() : null;
  // Fail-closed until the server answers: never flash Betting UI when Betting is OFF.
  const [config, setConfig] = useState(
    cached || { walletEnabled: false, bettingEnabled: false, updatedAt: null },
  );
  const [ready, setReady] = useState(Boolean(cached));
  const [loadError, setLoadError] = useState(false);
  // True once the server (or WS) has given us a trustworthy answer in this session.
  const hasTrustedConfig = useRef(Boolean(cached));

  const applyConfig = useCallback((next) => {
    const normalized = normalize(next);
    hasTrustedConfig.current = true;
    setConfig(normalized);
    setLoadError(false);
    writeCachedConfig(normalized);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/config/products?_=${Date.now()}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => null);
      if (isProductApiFailure(data, res.ok)) {
        // Transient failure: keep last known config; only flag an error when we have nothing.
        if (!hasTrustedConfig.current) setLoadError(true);
        return;
      }
      applyConfig(data);
    } catch {
      if (!hasTrustedConfig.current) setLoadError(true);
    } finally {
      setReady(true);
    }
  }, [applyConfig]);

  const retry = useCallback(async () => {
    setReady(false);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    const onWs = (ev) => {
      const detail = ev?.detail;
      if (detail && typeof detail === 'object' && !isProductApiFailure(detail)) {
        applyConfig(detail);
        setReady(true);
      } else {
        refresh();
      }
    };
    window.addEventListener('oddsyra:product-config', onWs);

    let unsub = () => {};
    import('../services/liveFeedSocket.js')
      .then(({ subscribeLiveChannel }) => {
        unsub = subscribeLiveChannel('config:products', (msg) => {
          const payload = msg?.payload || msg;
          if (payload && typeof payload === 'object' && !isProductApiFailure(payload)) {
            applyConfig(payload);
            setReady(true);
          } else {
            refresh();
          }
        });
      })
      .catch(() => {});

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('oddsyra:product-config', onWs);
      unsub();
    };
  }, [refresh, applyConfig]);

  const isWalletEnabled = useCallback(() => config.walletEnabled === true, [config.walletEnabled]);
  const isBettingEnabled = useCallback(() => config.bettingEnabled === true, [config.bettingEnabled]);

  const value = useMemo(() => ({
    walletEnabled: config.walletEnabled === true,
    bettingEnabled: config.bettingEnabled === true,
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
