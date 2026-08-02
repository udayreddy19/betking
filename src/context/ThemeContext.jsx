import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { runThemeTransition } from '../utils/themeTransition';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'betking-theme';

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((mode, event) => {
    if (mode !== 'light' && mode !== 'dark') return;
    if (mode === theme) return;

    runThemeTransition(() => {
      flushSync(() => {
        setThemeState(mode);
        applyTheme(mode);
      });
    }, event);
  }, [theme]);

  const toggleTheme = useCallback((event) => {
    setTheme(theme === 'light' ? 'dark' : 'light', event);
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
