/** Circular reveal coordinates for View Transitions API theme switch */
export function setThemeTransitionOrigin(event) {
  if (typeof window === 'undefined') return;

  const fallbackX = window.innerWidth - 56;
  const fallbackY = 28;
  const x = event?.clientX ?? fallbackX;
  const y = event?.clientY ?? fallbackY;
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  ) + 16;

  const root = document.documentElement;
  root.style.setProperty('--theme-x', `${x}px`);
  root.style.setProperty('--theme-y', `${y}px`);
  root.style.setProperty('--theme-r', `${radius}px`);
}

export function runThemeTransition(update, event) {
  if (typeof document === 'undefined') {
    update();
    return;
  }

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canAnimate = !prefersReducedMotion && typeof document.startViewTransition === 'function';

  if (!canAnimate) {
    update();
    return;
  }

  setThemeTransitionOrigin(event);
  document.startViewTransition(() => {
    update();
  });
}
