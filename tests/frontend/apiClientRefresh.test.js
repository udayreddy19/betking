import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  refreshAccessToken,
  apiFetch,
  setAccessToken,
  clearAccessToken,
} from '../../src/utils/apiClient.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(String(key), String(value)); },
    removeItem: (key) => { data.delete(key); },
  };
}

describe('apiClient refresh', () => {
  beforeEach(() => {
    globalThis.sessionStorage = memoryStorage();
    globalThis.document = { cookie: 'bk_csrf=test-csrf' };
    clearAccessToken();
    setAccessToken('expired-access');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('deduplicates concurrent refreshAccessToken calls', async () => {
    let refreshCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('/api/auth/refresh')) {
        refreshCalls += 1;
        await new Promise((r) => setTimeout(r, 20));
        return {
          ok: true,
          json: async () => ({ accessToken: 'new-access' }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const [a, b, c] = await Promise.all([
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
    ]);

    expect(refreshCalls).toBe(1);
    expect(a).toBe('new-access');
    expect(b).toBe('new-access');
    expect(c).toBe('new-access');
  });

  it('retries apiFetch after refresh even when access token was missing', async () => {
    clearAccessToken();
    let meCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('/api/auth/refresh')) {
        return {
          ok: true,
          json: async () => ({ accessToken: 'fresh-access' }),
        };
      }
      if (String(url).includes('/api/auth/me')) {
        meCalls += 1;
        if (meCalls === 1) return { ok: false, status: 401, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => ({ user: { email: 'a@b.com' } }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    const res = await apiFetch('/api/auth/me');
    expect(meCalls).toBe(2);
    expect(res.ok).toBe(true);
  });
});
