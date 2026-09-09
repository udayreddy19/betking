import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SunIcon, MoonIcon } from '../../../icons/animate/index';
import { useAdminTheme } from '../context/AdminThemeContext';

/**
 * Dedicated Admin Light / Dark Mode Toggle Button for the Admin Topbar.
 * - Smooth animated sun/moon icon transition.
 * - Switches admin chrome between light and dark modes with a single click.
 */
export default function AdminThemeToggle({ className = '' }) {
  const { isDark, toggleMode, theme } = useAdminTheme();

  return (
    <motion.button
      type="button"
      className={`admin-theme-toggle-btn ${isDark ? 'is-dark' : 'is-light'} ${className}`.trim()}
      onClick={toggleMode}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode (current: ${theme.label})`}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode (current: ${theme.label})`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={isDark ? 'dark' : 'light'}
          initial={{ opacity: 0, rotate: -90, scale: 0.7 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 90, scale: 0.7 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="admin-theme-toggle-icon-wrap"
        >
          {isDark ? (
            <SunIcon size={17} style={{ display: 'block', color: '#f59e0b' }} className="sun-icon" />
          ) : (
            <MoonIcon size={17} style={{ display: 'block', color: 'var(--admin-text-muted)' }} className="moon-icon" />
          )}
        </motion.div>
      </AnimatePresence>
    </motion.button>
  );
}
