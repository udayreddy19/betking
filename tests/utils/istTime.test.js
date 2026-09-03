import { describe, it, expect } from 'vitest';
import {
  formatIstDateTime,
  todayIstYmd,
  IST_TIMEZONE,
  formatIstClock,
} from '../../src/utils/istTime.js';

describe('istTime', () => {
  it('formats a known UTC instant in Asia/Kolkata', () => {
    // 2026-09-03T12:00:00.000Z = 17:30 IST
    const s = formatIstDateTime('2026-09-03T12:00:00.000Z');
    expect(s).toMatch(/3.*Sep.*2026/i);
    expect(s).toMatch(/5:30/i);
    expect(IST_TIMEZONE).toBe('Asia/Kolkata');
  });

  it('returns YYYY-MM-DD for today in IST', () => {
    expect(todayIstYmd('2026-09-03T20:00:00.000Z')).toBe('2026-09-04'); // 01:30 next day IST
    expect(todayIstYmd('2026-09-03T12:00:00.000Z')).toBe('2026-09-03');
  });

  it('formatIstClock is non-empty', () => {
    expect(formatIstClock(new Date('2026-09-03T12:00:00.000Z')).length).toBeGreaterThan(10);
  });
});
