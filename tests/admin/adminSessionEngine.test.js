import { describe, it, expect } from 'vitest';

describe('adminSessionEngine exports', () => {
  it('exports session helpers', async () => {
    const mod = await import('../../lib/adminSessionEngine.mjs');
    expect(typeof mod.createAdminSessionRecord).toBe('function');
    expect(typeof mod.assessAdminSessionRisk).toBe('function');
    expect(typeof mod.revokeAdminSession).toBe('function');
    expect(typeof mod.listActiveAdminSessions).toBe('function');
  });
});
