import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const STORAGE_KEY = 'oddsyra-admin-ui-revamp';

const AdminUiModeContext = createContext({
  revamp: true,
  setRevamp: () => {},
  toggleRevamp: () => {},
});

/** First visit → New UI. Explicit Classic (`0`) or New (`1`) is respected. */
function readStoredRevamp() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw === '1';
  } catch {
    return true;
  }
}

export function AdminUiModeProvider({ children }) {
  const [revamp, setRevampState] = useState(readStoredRevamp);

  const setRevamp = useCallback((next) => {
    const value = Boolean(next);
    setRevampState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch { /* ignore */ }
  }, []);

  const toggleRevamp = useCallback(() => {
    setRevamp(!revamp);
  }, [revamp, setRevamp]);

  const value = useMemo(
    () => ({ revamp, setRevamp, toggleRevamp }),
    [revamp, setRevamp, toggleRevamp],
  );

  return (
    <AdminUiModeContext.Provider value={value}>
      {children}
    </AdminUiModeContext.Provider>
  );
}

export function useAdminUiMode() {
  return useContext(AdminUiModeContext);
}
