import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('fetchLiveScores fast path', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads /api/live-scores only unless gateway merge is requested', async () => {
    const urls = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      urls.push(String(url));
      await new Promise((r) => setTimeout(r, 15));
      return {
        ok: true,
        json: async () => ({ matches: [{ id: 'cb_1', sport: 'cricket', team1: { name: 'A' }, team2: { name: 'B' } }] }),
      };
    }));

    const { fetchLiveScores } = await import('../../src/services/liveScoresService.js');
    const [a, b] = await Promise.all([
      fetchLiveScores({ includeGateway: false }),
      fetchLiveScores({ includeGateway: false }),
    ]);

    expect(a.matches[0].id).toBe('cb_1');
    expect(b.matches[0].id).toBe('cb_1');
    expect(urls.filter((u) => u.includes('/api/live-scores'))).toHaveLength(1);
    expect(urls.some((u) => u.includes('/api/v1/cricket/'))).toBe(false);
  });

  it('fans out to gateway sports only when includeGateway is true', async () => {
    const urls = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      urls.push(String(url));
      return {
        ok: true,
        json: async () => (String(url).includes('/api/live-scores')
          ? { matches: [] }
          : { data: [] }),
      };
    }));

    const { fetchLiveScores } = await import('../../src/services/liveScoresService.js');
    await fetchLiveScores({ includeGateway: true });

    expect(urls.some((u) => u.includes('/api/live-scores'))).toBe(true);
    expect(urls.some((u) => u.includes('/api/v1/cricket/live'))).toBe(true);
  });
});
