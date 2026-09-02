import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const FeatureFlagsContext = createContext({
  flags: {},
  ready: false,
  isEnabled: () => true,
  isSportEnabled: () => true,
  refresh: async () => {},
});

const SPORT_ALIASES = {
  football: 'soccer',
  nfl: 'american-football',
};

export function sportFlagKey(sportId) {
  const raw = String(sportId || '').toLowerCase().replace(/_/g, '-');
  const id = SPORT_ALIASES[raw] || raw;
  return `SPORT_ENABLED_${id.toUpperCase().replace(/-/g, '_')}`;
}

export function FeatureFlagsProvider({ children }) {
  const [flags, setFlags] = useState({});
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/feature-flags', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.flags && typeof data.flags === 'object') {
        setFlags(data.flags);
      }
    } catch {
      // Keep last known / empty map — defaults keep features visible.
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const isEnabled = useCallback((flagKey, defaultValue = true) => {
    if (!flagKey) return defaultValue;
    if (!(flagKey in flags)) return defaultValue;
    return !!flags[flagKey];
  }, [flags]);

  const isSportEnabledFlag = useCallback((sportId) => {
    const key = sportFlagKey(sportId);
    if (!(key in flags)) return true;
    return !!flags[key];
  }, [flags]);

  const value = useMemo(() => ({
    flags,
    ready,
    isEnabled,
    isSportEnabled: isSportEnabledFlag,
    refresh,
  }), [flags, ready, isEnabled, isSportEnabledFlag, refresh]);

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}
