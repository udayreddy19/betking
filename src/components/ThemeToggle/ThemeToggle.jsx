import { SunIcon, MoonIcon } from '@animateicons/react/lucide';
import { useTheme } from '../../context/ThemeContext';
import './ThemeToggle.css';

export default function ThemeToggle({ variant = 'header', className = '' }) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div
      className={`theme-toggle-pill theme-toggle-pill--${variant} ${className}`.trim()}
      data-theme={theme}
      role="group"
      aria-label="Theme"
    >
      <span className="theme-toggle-thumb" aria-hidden="true" />
      <button
        type="button"
        className={`theme-toggle-option ${!isDark ? 'active' : ''}`}
        onClick={() => setTheme('light')}
        aria-label="Switch to light mode"
        aria-pressed={!isDark}
        title="Light mode"
      >
        <SunIcon size={16} isAnimated={false} className="theme-toggle-icon" />
      </button>
      <button
        type="button"
        className={`theme-toggle-option ${isDark ? 'active' : ''}`}
        onClick={() => setTheme('dark')}
        aria-label="Switch to dark mode"
        aria-pressed={isDark}
        title="Dark mode"
      >
        <MoonIcon size={16} isAnimated={false} className="theme-toggle-icon" />
      </button>
    </div>
  );
}
