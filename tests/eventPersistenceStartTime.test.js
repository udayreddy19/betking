import { describe, it, expect } from 'vitest';
import { normalizePersistedStartTime } from '../lib/eventPersistence.mjs';

describe('normalizePersistedStartTime', () => {
  it('converts epoch milliseconds to ISO', () => {
    const iso = normalizePersistedStartTime(1792072800000);
    expect(iso).toBe(new Date(1792072800000).toISOString());
  });

  it('converts unix seconds to ISO', () => {
    const iso = normalizePersistedStartTime(1792072800);
    expect(iso).toBe(new Date(1792072800 * 1000).toISOString());
  });

  it('passes through ISO strings', () => {
    const src = '2026-10-15T14:00:00.000Z';
    expect(normalizePersistedStartTime(src)).toBe(src);
  });

  it('falls back for empty input', () => {
    const iso = normalizePersistedStartTime(null);
    expect(Number.isFinite(Date.parse(iso))).toBe(true);
  });
});
