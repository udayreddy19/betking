import { describe, it, expect } from 'vitest';
import { QUICK_BET_PRESETS } from '../../src/context/QuickBetContext';

describe('Quick Bet and Odds Movement Micro-Interactions', () => {
  it('defines realistic quick bet presets', () => {
    expect(QUICK_BET_PRESETS).toContain(100);
    expect(QUICK_BET_PRESETS).toContain(500);
    expect(QUICK_BET_PRESETS).toContain(1000);
  });
});
