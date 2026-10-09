import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const ProductContext = createContext({
  walletEnabled: true,
  bettingEnabled: true,
  ready: false,
  isWalletEnabled: () => true,
  isBettingEnabled: () => true,
  refresh: async () => {},
});

function normalize(data) {
  const wallet = data?.walletEnabled ?? data?.wallet;
  const betting = data?.bettingEnabled ?? data?.betting;
  return {
    walletEnabled: wallet !== false,
    bettingEnabled: betting !== false,
    updatedAt: data?.updatedAt || null,
  };
}

export function ProductProvider({ children }) {
  const [config, setConfig] = useState({
    walletEnabled: true,
    bettingEnabled: true,
    updatedAt: null,
  });
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/config/products', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setConfig(normalize(data));
      }
    } catch {
      // Keep last known; fail-open to both-on until first successful load after boot.
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    const onWs = (ev) => {
      const detail = ev?.detail;
      if (detail && typeof detail === 'object') {
        setConfig(normalize(detail));
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
            setConfig(normalize(payload));
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
  }, [refresh]);

  const isWalletEnabled = useCallback(() => config.walletEnabled !== false, [config.walletEnabled]);
  const isBettingEnabled = useCallback(() => config.bettingEnabled !== false, [config.bettingEnabled]);

  const value = useMemo(() => ({
    walletEnabled: config.walletEnabled !== false,
    bettingEnabled: config.bettingEnabled !== false,
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
