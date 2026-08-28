import { describe, it, expect } from 'vitest';
import { _closingIdForTest } from '../../lib/financeDailyClosingEngine.mjs';

describe('financeDailyClosingEngine helpers', () => {
  it('builds stable closing ids from dates', () => {
    expect(_closingIdForTest('2026-08-27')).toBe('fdc_20260827');
  });
});
