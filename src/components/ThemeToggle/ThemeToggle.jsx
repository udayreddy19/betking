import { motion, AnimatePresence } from 'motion/react';
import { SunIcon, MoonIcon } from '@animateicons/react/lucide';
import { useTheme } from '../../context/ThemeContext';
import './ThemeToggle.css';

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <motion.button
      type="button"
      className={`theme-toggle-btn ${isDark ? 'dark' : 'light'} ${className}`.trim()}
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={theme}
          initial={{ opacity: 0, rotate: -90, scale: 0.7 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 90, scale: 0.7 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="theme-toggle-icon-wrap"
        >
          {isDark ? (
            <MoonIcon size={20} isAnimated={true} className="theme-icon moon-icon" />
          ) : (
            <SunIcon size={22} isAnimated={true} className="theme-icon sun-icon" />
          )}
        </motion.div>
      </AnimatePresence>
    </motion.button>
  );
}
