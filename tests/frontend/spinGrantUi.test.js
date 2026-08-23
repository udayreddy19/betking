import { describe, it, expect } from 'vitest';
import { buildSpinGrantNotice } from '../../src/utils/spinGrantUi.js';

describe('spinGrantUi', () => {
  it('returns null when no active spin grants', () => {
    expect(buildSpinGrantNotice(null)).toBeNull();
    expect(buildSpinGrantNotice({})).toBeNull();
  });

  it('builds urgent notice when expiry is soon', () => {
    const soon = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    const notice = buildSpinGrantNotice({
      freebetRemaining: 50,
      nextFreebetExpiresAt: soon,
    });
    expect(notice?.urgent).toBe(true);
    expect(notice?.message).toMatch(/24h/);
  });
});
