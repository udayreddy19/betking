/**
 * Cross-browser / cross-OS helpers.
 * Safari private mode throws on storage; iOS Safari < 14 uses addListener;
 * iOS 100vh excludes the browser chrome; clipboard needs a fallback.
 */

function storageOf(kind) {
  try {
    if (typeof window === 'undefined') return null;
    return kind === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

export function storageGet(key, kind = 'local') {
  try {
    return storageOf(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function storageSet(key, value, kind = 'local') {
  try {
    storageOf(kind)?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function storageRemove(key, kind = 'local') {
  try {
    storageOf(kind)?.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function prefersDarkScheme() {
  try {
    return typeof window !== 'undefined'
      && window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function subscribeMediaQuery(query, onChange) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mq = window.matchMedia(query);
  const handler = (event) => onChange(event.matches, mq);
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }
  if (typeof mq.addListener === 'function') {
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }
  return () => {};
}

export function mediaQueryMatches(query) {
  try {
    return typeof window !== 'undefined' && window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

export async function copyToClipboard(text) {
  const value = String(text ?? '');
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // fall through to execCommand (iOS Safari / insecure contexts)
    }
  }
  try {
    const el = document.createElement('textarea');
    el.value = value;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.top = '0';
    el.style.left = '0';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    el.setSelectionRange(0, value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

function writeAppHeight() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const viewport = window.visualViewport;
  const height = Math.round(viewport?.height || window.innerHeight || 0);
  if (height > 0) {
    document.documentElement.style.setProperty('--app-height', `${height}px`);
  }
}

export function bindAppViewport() {
  if (typeof window === 'undefined') return () => {};
  writeAppHeight();
  const onResize = () => writeAppHeight();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('scroll', onResize);
  return () => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    window.visualViewport?.removeEventListener('resize', onResize);
    window.visualViewport?.removeEventListener('scroll', onResize);
  };
}
