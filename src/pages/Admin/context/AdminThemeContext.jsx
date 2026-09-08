import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const STORAGE_KEY = 'oddsyra-admin-theme';

/** Admin chrome themes — scoped to .admin-shell, independent of public site. */
export const ADMIN_THEMES = [
  {
    id: 'match',
    label: 'Match site',
    description: 'Follow sportsbook light / dark',
    mode: 'auto',
    swatches: ['#efeae0', '#1f8a4c', '#14181f'],
  },
  {
    id: 'forest',
    label: 'Forest desk',
    description: 'Light ops desk with turf accent',
    mode: 'light',
    swatches: ['#f3f6f2', '#1f8a4c', '#152018'],
  },
  {
    id: 'mist',
    label: 'Mist',
    description: 'Cool light console',
    mode: 'light',
    swatches: ['#f2f4f7', '#2a6f8f', '#12161c'],
  },
  {
    id: 'slate',
    label: 'Ops slate',
    description: 'Cool charcoal floor',
    mode: 'dark',
    swatches: ['#12161c', '#5b8def', '#e8edf5'],
  },
  {
    id: 'navy',
    label: 'Control navy',
    description: 'Deep navy control tower',
    mode: 'dark',
    swatches: ['#0b1220', '#3d8bfd', '#e7eefc'],
  },
  {
    id: 'graphite',
    label: 'Graphite',
    description: 'Neutral dark graphite',
    mode: 'dark',
    swatches: ['#141414', '#7dff6b', '#f2f2f2'],
  },
];

const AdminThemeContext = createContext({
  themeId: 'match',
  theme: ADMIN_THEMES[0],
  setThemeId: () => {},
  themes: ADMIN_THEMES,
});

function readStoredThemeId() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (ADMIN_THEMES.some((t) => t.id === raw)) return raw;
  } catch { /* ignore */ }
  return 'match';
}

export function AdminThemeProvider({ children }) {
  const [themeId, setThemeIdState] = useState(readStoredThemeId);

  const setThemeId = useCallback((nextId) => {
    const id = ADMIN_THEMES.some((t) => t.id === nextId) ? nextId : 'match';
    setThemeIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch { /* ignore */ }
  }, []);

  const theme = ADMIN_THEMES.find((t) => t.id === themeId) || ADMIN_THEMES[0];

  const value = useMemo(
    () => ({ themeId, theme, setThemeId, themes: ADMIN_THEMES }),
    [themeId, theme, setThemeId],
  );

  return (
    <AdminThemeContext.Provider value={value}>
      {children}
    </AdminThemeContext.Provider>
  );
}

export function useAdminTheme() {
  return useContext(AdminThemeContext);
}
