/**
 * Apply a theme change without full-page View Transitions (heavy in Chrome).
 * Briefly disables CSS transitions so the swap is instant and smooth.
 */
export function runThemeTransition(update) {
  if (typeof document === 'undefined') {
    update();
    return;
  }

  const root = document.documentElement;
  root.classList.add('theme-switching');

  update();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.remove('theme-switching');
    });
  });
}
