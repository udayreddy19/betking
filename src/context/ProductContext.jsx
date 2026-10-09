import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const ProductContext = createContext({
  walletEnabled: false,
  bettingEnabled: false,
  ready: false,
  isWalletEnabled: () => false,
  isBettingEnabled: () => false,
  refresh: async () => {},
});

const CACHE_KEY = 'oddsyra_product_config_v1';

function normalize(data) {
  const wallet = data?.walletEnabled ?? data?.wallet;
  const betting = data?.bettingEnabled ?? data?.betting;
  return {
    walletEnabled: wallet === true || wallet === 'true' || wallet === 1,
    bettingEnabled: betting === true || betting === 'true' || betting === 1,
    updatedAt: data?.updatedAt || null,
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
  } catch {
    /* ignore */
  }
}

export function ProductProvider({ children }) {
  const cached = typeof window !== 'undefined' ? readCachedConfig() : null;
  // Fail-closed until the server answers: never flash Betting UI when Betting is OFF.
  const [config, setConfig] = useState(
    cached || { walletEnabled: false, bettingEnabled: false, updatedAt: null },
  );
  const [ready, setReady] = useState(Boolean(cached));

  const applyConfig = useCallback((next) => {
    const normalized = normalize(next);
    setConfig(normalized);
    writeCachedConfig(normalized);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/config/products?_=${Date.now()}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        applyConfig(data);
      }
    } catch {
      // Keep last known / fail-closed until a successful load.
    } finally {
      setReady(true);
    }
  }, [applyConfig]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    const onWs = (ev) => {
      const detail = ev?.detail;
      if (detail && typeof detail === 'object') {
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
          if (payload && typeof payload === 'object') {
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
