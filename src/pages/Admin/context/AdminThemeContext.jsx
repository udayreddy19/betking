import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useTheme } from '../../../context/ThemeContext';

const STORAGE_KEY = 'oddsyra-admin-theme';
const LIGHT_THEME_STORAGE_KEY = 'oddsyra-admin-light-theme';
const DARK_THEME_STORAGE_KEY = 'oddsyra-admin-dark-theme';

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
    swatches: ['#eef3ef', '#1f8a4c', '#152018'],
  },
  {
    id: 'mist',
    label: 'Mist',
    description: 'Cool light console',
    mode: 'light',
    swatches: ['#eef1f5', '#2a6f8f', '#12161c'],
  },
  {
    id: 'glacier',
    label: 'Glacier',
    description: 'Icy light blue desk',
    mode: 'light',
    swatches: ['#eef6fb', '#1f7a9a', '#0f2430'],
  },
  {
    id: 'slate',
    label: 'Ops slate',
    description: 'Cool charcoal floor',
    mode: 'dark',
    swatches: ['#0f1319', '#5b8def', '#e8edf5'],
  },
  {
    id: 'navy',
    label: 'Control navy',
    description: 'Deep navy control tower',
    mode: 'dark',
    swatches: ['#070d18', '#3d8bfd', '#e7eefc'],
  },
  {
    id: 'graphite',
    label: 'Graphite',
    description: 'Dark + lime accent',
    mode: 'dark',
    swatches: ['#0e0e0e', '#7dff6b', '#f2f2f2'],
  },
  {
    id: 'aurora',
    label: 'Aurora',
    description: 'Dark teal night ops',
    mode: 'dark',
    swatches: ['#071416', '#2ec4b6', '#e6f7f5'],
  },
  {
    id: 'ink',
    label: 'Ink',
    description: 'High-contrast black desk',
    mode: 'dark',
    swatches: ['#050505', '#f5f5f5', '#8ab4ff'],
  },
  {
    id: 'signal',
    label: 'Signal',
    description: 'Dark floor with amber signal',
    mode: 'dark',
    swatches: ['#12100c', '#f0a202', '#f6f1e7'],
  },
];

const AdminThemeContext = createContext({
  themeId: 'match',
  theme: ADMIN_THEMES[0],
  setThemeId: () => {},
  themes: ADMIN_THEMES,
  isDark: false,
  toggleMode: () => {},
});

function readStoredThemeId() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (ADMIN_THEMES.some((t) => t.id === raw)) return raw;
  } catch { /* ignore */ }
  return 'match';
}

function readStoredLightThemeId() {
  try {
    const raw = localStorage.getItem(LIGHT_THEME_STORAGE_KEY);
    if (ADMIN_THEMES.some((t) => t.id === raw && t.mode === 'light')) return raw;
  } catch { /* ignore */ }
  return 'forest';
}

function readStoredDarkThemeId() {
  try {
    const raw = localStorage.getItem(DARK_THEME_STORAGE_KEY);
    if (ADMIN_THEMES.some((t) => t.id === raw && t.mode === 'dark')) return raw;
  } catch { /* ignore */ }
  return 'slate';
}

function useOptionalSiteTheme() {
  try {
    return useTheme();
  } catch {
    return null;
  }
}

export function AdminThemeProvider({ children }) {
  const [themeId, setThemeIdState] = useState(readStoredThemeId);
  const siteThemeContext = useOptionalSiteTheme();
  const siteIsDark = siteThemeContext ? siteThemeContext.isDark : false;
  const setSiteTheme = siteThemeContext?.setTheme;

  const theme = ADMIN_THEMES.find((t) => t.id === themeId) || ADMIN_THEMES[0];
  const isDark = theme.mode === 'auto' ? siteIsDark : theme.mode === 'dark';

  const setThemeId = useCallback((nextId) => {
    const id = ADMIN_THEMES.some((t) => t.id === nextId) ? nextId : 'match';
    setThemeIdState(id);
    const chosen = ADMIN_THEMES.find((t) => t.id === id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
      if (chosen?.mode === 'light') {
        localStorage.setItem(LIGHT_THEME_STORAGE_KEY, id);
      } else if (chosen?.mode === 'dark') {
        localStorage.setItem(DARK_THEME_STORAGE_KEY, id);
      }
    } catch { /* ignore */ }
  }, []);

  const toggleMode = useCallback(() => {
    const currentIsDark = theme.mode === 'auto' ? siteIsDark : theme.mode === 'dark';

    if (currentIsDark) {
      // Switch to LIGHT
      if (themeId === 'match') {
        setSiteTheme?.('light');
      } else {
        const nextLight = readStoredLightThemeId();
        setThemeId(nextLight);
        setSiteTheme?.('light');
      }
    } else {
      // Switch to DARK
      if (themeId === 'match') {
        setSiteTheme?.('dark');
      } else {
        const nextDark = readStoredDarkThemeId();
        setThemeId(nextDark);
        setSiteTheme?.('dark');
      }
    }
  }, [theme, themeId, siteIsDark, setSiteTheme, setThemeId]);

  const value = useMemo(
    () => ({
      themeId,
      theme,
      setThemeId,
      themes: ADMIN_THEMES,
      isDark,
      toggleMode,
    }),
    [themeId, theme, setThemeId, isDark, toggleMode],
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

