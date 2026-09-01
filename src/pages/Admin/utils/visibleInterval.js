/**
 * Visibility-aware interval helper for admin polls.
 * Pauses when the document is hidden to cut wasted API traffic.
 */
export function startVisibleInterval(fn, ms, { runImmediately = true } = {}) {
  let timer = null;
  let stopped = false;

  const clear = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const tick = () => {
    if (stopped) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    try { fn(); } catch { /* ignore poll errors */ }
  };

  const arm = () => {
    clear();
    if (stopped) return;
    timer = setInterval(tick, ms);
  };

  const onVisibility = () => {
    if (stopped) return;
    if (document.visibilityState === 'visible') {
      tick();
      arm();
    } else {
      clear();
    }
  };

  if (runImmediately) tick();
  arm();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }

  return () => {
    stopped = true;
    clear();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
    }
  };
}
