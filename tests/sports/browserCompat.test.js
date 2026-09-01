import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  storageGet,
  storageSet,
  storageRemove,
  mediaQueryMatches,
  subscribeMediaQuery,
  copyToClipboard,
  bindAppViewport,
  isEditableFocusTarget,
} from '../../src/utils/browserCompat.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(String(key), String(value)); },
    removeItem: (key) => { data.delete(key); },
    clear: () => data.clear(),
  };
}

describe('browserCompat', () => {
  beforeEach(() => {
    const local = memoryStorage();
    const session = memoryStorage();
    globalThis.window = globalThis;
    globalThis.localStorage = local;
    globalThis.sessionStorage = session;
  });

  it('reads and writes localStorage', () => {
    expect(storageGet('missing')).toBeNull();
    expect(storageSet('k', 'v')).toBe(true);
    expect(storageGet('k')).toBe('v');
    expect(storageRemove('k')).toBe(true);
    expect(storageGet('k')).toBeNull();
  });

  it('survives storage throws (Safari private mode)', () => {
    window.localStorage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(storageSet('k', 'v')).toBe(false);
  });

  it('subscribes to matchMedia with addEventListener', () => {
    const listeners = [];
    globalThis.matchMedia = () => ({
      matches: true,
      addEventListener: (_type, fn) => listeners.push(fn),
      removeEventListener: (_type, fn) => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      },
    });
    const unsub = subscribeMediaQuery('(min-width: 1px)', () => {});
    expect(listeners).toHaveLength(1);
    unsub();
    expect(listeners).toHaveLength(0);
    expect(mediaQueryMatches('(min-width: 1px)')).toBe(true);
  });

  it('falls back to addListener when addEventListener is missing', () => {
    const listeners = [];
    globalThis.matchMedia = () => ({
      matches: true,
      addListener: (fn) => listeners.push(fn),
      removeListener: (fn) => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      },
    });
    const unsub = subscribeMediaQuery('(min-width: 900px)', () => {});
    expect(listeners).toHaveLength(1);
    unsub();
    expect(listeners).toHaveLength(0);
  });

  it('copies text via clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(copyToClipboard('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
    vi.unstubAllGlobals();
  });

  it('treats text fields as editable focus targets', () => {
    expect(isEditableFocusTarget({ tagName: 'TEXTAREA', type: '', isContentEditable: false })).toBe(true);
    expect(isEditableFocusTarget({ tagName: 'INPUT', type: 'text', isContentEditable: false })).toBe(true);
    expect(isEditableFocusTarget({ tagName: 'INPUT', type: 'checkbox', isContentEditable: false })).toBe(false);
    expect(isEditableFocusTarget(null)).toBe(false);
  });

  it('keeps --app-height on the layout viewport when the visual viewport shrinks (keyboard)', () => {
    const props = {};
    const documentElement = {
      style: {
        setProperty: (key, value) => { props[key] = value; },
        getPropertyValue: (key) => props[key] || '',
      },
      clientHeight: 800,
    };
    const fakeWindow = {
      innerHeight: 800,
      visualViewport: {
        height: 390,
        offsetTop: 0,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setTimeout: vi.fn(),
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('document', {
      documentElement,
      body: { tagName: 'BODY' },
      activeElement: { tagName: 'BODY' },
    });
    const unbind = bindAppViewport();
    expect(props['--app-height']).toBe('800px');
    unbind();
    vi.unstubAllGlobals();
  });
});
