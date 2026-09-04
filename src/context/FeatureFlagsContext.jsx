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
  isEnabled: () => false,
  isSportEnabled: () => true,
  refresh: async () => {},
});

const SPORT_ALIASES = {
  football: 'soccer',
  nfl: 'american-football',
};

/** Gated product surfaces: off until flags hydrate (then honor map / caller default). */
const FAIL_CLOSED_UNTIL_READY = new Set([
  'oddsyra_srl_ui',
  'other_srl_ui',
  'oddsyra_t10_ui',
  'referral_system_ui',
  'promotion_engine_ui',
  'notification_center',
  'responsible_gaming_ui',
  'MAINTENANCE_MODE',
  'GLOBAL_BETTING_PAUSE',
  'CASHOUT_PAUSE',
  'DEPOSITS_PAUSE',
  'WITHDRAWALS_PAUSE',
]);

function isFailClosedUntilReady(flagKey) {
  return Boolean(flagKey && FAIL_CLOSED_UNTIL_READY.has(flagKey));
}

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
      // Keep last known map; fail-closed keys stay off until a successful load.
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
    if (!flagKey) return !!defaultValue;
    // Kill-switch / gated surfaces stay off until the flag map has loaded.
    if (!ready && isFailClosedUntilReady(flagKey)) return false;
    if (!(flagKey in flags)) return !!defaultValue;
    return !!flags[flagKey];
  }, [flags, ready]);

  const isSportEnabledFlag = useCallback((sportId) => {
    const key = sportFlagKey(sportId);
    // Sports are opt-out: enabled unless an explicit SPORT_ENABLED_* row disables them.
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
