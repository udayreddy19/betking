import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(String(key), String(value)); },
    removeItem: (key) => { data.delete(key); },
  };
}

describe('fetchMe coalescing', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.sessionStorage = memoryStorage();
    globalThis.document = { cookie: 'bk_csrf=test-csrf' };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shares one in-flight /api/auth/me request', async () => {
    let meCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('/api/auth/me')) {
        meCalls += 1;
        await new Promise((r) => setTimeout(r, 20));
        return {
          ok: true,
          json: async () => ({ user: { userId: 'usr_1', email: 'a@b.com', balance: 10 } }),
        };
      }
      return { ok: false, json: async () => ({}) };
    }));

    const { fetchMe, setAccessToken } = await import('../../src/utils/apiClient.js');
    setAccessToken('tok');
    const [a, b] = await Promise.all([fetchMe(), fetchMe()]);
    expect(a.userId).toBe('usr_1');
    expect(b.userId).toBe('usr_1');
    expect(meCalls).toBe(1);
  });
});
