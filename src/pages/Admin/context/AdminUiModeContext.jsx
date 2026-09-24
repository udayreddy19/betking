import React, { createContext, useContext, useEffect, useMemo } from 'react';

const AdminUiModeContext = createContext({
  revamp: true,
  setRevamp: () => {},
  toggleRevamp: () => {},
});

/**
 * Admin is New UI only. Classic chrome is retired; the API stays so
 * existing callers (`useAdminUiMode().revamp`) keep working.
 */
export function AdminUiModeProvider({ children }) {
  useEffect(() => {
    try {
      localStorage.setItem('oddsyra-admin-ui-revamp', '1');
    } catch { /* ignore */ }
  }, []);

  const value = useMemo(
    () => ({
      revamp: true,
      setRevamp: () => {},
      toggleRevamp: () => {},
    }),
    [],
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
