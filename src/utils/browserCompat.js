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

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'radio',
  'file',
  'submit',
  'reset',
  'hidden',
  'range',
  'color',
  'image',
]);

export function isEditableFocusTarget(el) {
  if (!el) return false;
  if (typeof document !== 'undefined' && (el === document.body || el === document.documentElement)) {
    return false;
  }
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    return !NON_TEXT_INPUT_TYPES.has(String(el.type || 'text').toLowerCase());
  }
  return Boolean(el.isContentEditable);
}

function layoutViewportHeight() {
  return Math.round(window.innerHeight || document.documentElement?.clientHeight || 0);
}

function writeAppHeight({ force = false } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  // iOS Safari shrinks visualViewport when the keyboard opens. If we copy that
  // into --app-height, every screen (and the focused input) gets crushed and
  // the field often blurs after one character.
  if (!force && isEditableFocusTarget(document.activeElement)) return;
  const height = layoutViewportHeight();
  if (height > 0) {
    document.documentElement.style.setProperty('--app-height', `${height}px`);
  }
}

function writeKeyboardInset() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const vv = window.visualViewport;
  if (!vv) {
    document.documentElement.style.setProperty('--kb-inset', '0px');
    return;
  }
  const covered = Math.max(0, Math.round(window.innerHeight - vv.height - (vv.offsetTop || 0)));
  // Ignore URL-bar chrome (~40–100px). A real keyboard covers much more.
  document.documentElement.style.setProperty('--kb-inset', `${covered >= 140 ? covered : 0}px`);
}

export function bindAppViewport() {
  if (typeof window === 'undefined') return () => {};
  writeAppHeight({ force: true });
  writeKeyboardInset();

  const onLayoutResize = () => writeAppHeight();
  const onVisualResize = () => writeKeyboardInset();
  const onFocusOut = () => {
    window.setTimeout(() => {
      writeAppHeight({ force: true });
      writeKeyboardInset();
    }, 50);
  };

  window.addEventListener('resize', onLayoutResize);
  window.addEventListener('orientationchange', onLayoutResize);
  window.addEventListener('focusout', onFocusOut);
  window.visualViewport?.addEventListener('resize', onVisualResize);

  return () => {
    window.removeEventListener('resize', onLayoutResize);
    window.removeEventListener('orientationchange', onLayoutResize);
    window.removeEventListener('focusout', onFocusOut);
    window.visualViewport?.removeEventListener('resize', onVisualResize);
  };
}
