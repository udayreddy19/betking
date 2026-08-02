import { HiOutlineMoon, HiOutlineSun } from '../../icons';
import { useTheme } from '../../context/ThemeContext';
import './ThemeToggle.css';

export default function ThemeToggle({ variant = 'header', className = '' }) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  const selectTheme = (mode, event) => {
    if (theme === mode) return;
    setTheme(mode, event);
  };

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
        onClick={(e) => selectTheme('light', e)}
        aria-label="Switch to light mode"
        aria-pressed={!isDark}
        title="Light mode"
      >
        <HiOutlineSun className="theme-toggle-icon" />
      </button>
      <button
        type="button"
        className={`theme-toggle-option ${isDark ? 'active' : ''}`}
        onClick={(e) => selectTheme('dark', e)}
        aria-label="Switch to dark mode"
        aria-pressed={isDark}
        title="Dark mode"
      >
        <HiOutlineMoon className="theme-toggle-icon" />
      </button>
    </div>
  );
}
