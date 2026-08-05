import { motion, AnimatePresence } from 'motion/react';
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
      {/* Framer Motion Sliding Thumb Indicator */}
      <motion.span
        className="theme-toggle-thumb"
        aria-hidden="true"
        animate={{
          x: isDark ? 28 : 0,
        }}
        transition={{
          type: 'spring',
          stiffness: 500,
          damping: 32,
        }}
      />

      {/* Light Mode Sun Button with Motion Spin & Scale */}
      <motion.button
        type="button"
        className={`theme-toggle-option ${!isDark ? 'active' : ''}`}
        onClick={() => setTheme('light')}
        aria-label="Switch to light mode"
        aria-pressed={!isDark}
        title="Light mode"
        whileHover={{ scale: 1.25, rotate: 180 }}
        whileTap={{ scale: 0.85 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <SunIcon size={16} isAnimated={!isDark} className="theme-toggle-icon" />
      </motion.button>

      {/* Dark Mode Moon Button with Motion Tilt & Float */}
      <motion.button
        type="button"
        className={`theme-toggle-option ${isDark ? 'active' : ''}`}
        onClick={() => setTheme('dark')}
        aria-label="Switch to dark mode"
        aria-pressed={isDark}
        title="Dark mode"
        whileHover={{ scale: 1.25, rotate: -25, y: -2 }}
        whileTap={{ scale: 0.85 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <MoonIcon size={16} isAnimated={isDark} className="theme-toggle-icon" />
      </motion.button>
    </div>
  );
}
