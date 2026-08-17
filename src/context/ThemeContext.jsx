import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { runThemeTransition } from '../utils/themeTransition';
import { prefersDarkScheme, storageGet, storageSet } from '../utils/browserCompat';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'oddsyra-theme';

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  const stored = storageGet(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  if (prefersDarkScheme()) return 'dark';
  return 'light';
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const body = document.body;

  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
  root.classList.remove('dark', 'light', 'theme-dark', 'theme-light');
  root.classList.add(theme);

  if (body) {
    body.setAttribute('data-theme', theme);
    body.classList.remove('dark', 'light', 'theme-dark', 'theme-light');
    body.classList.add(theme);
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    storageSet(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((mode) => {
    if (mode !== 'light' && mode !== 'dark') return;
    if (mode === theme) return;

    runThemeTransition(() => {
      setThemeState(mode);
      applyTheme(mode);
    });
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{
      theme,
      isDark: theme === 'dark',
      toggleTheme,
      setTheme,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
