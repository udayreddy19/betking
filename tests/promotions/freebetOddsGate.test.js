/**
 * Free bet odds gate matches bonus (≥ 1.75).
 */
import { describe, it, expect } from 'vitest';
import { BONUS_MIN_BET_ODDS, everyLegMeetsBonusOdds, bonusOddsQualify } from '../../lib/promoRules.mjs';

describe('freebet / bonus shared odds gate', () => {
  it('uses 1.75 minimum for promotional stakes', () => {
    expect(BONUS_MIN_BET_ODDS).toBe(1.75);
    expect(bonusOddsQualify(1.74)).toBe(false);
    expect(bonusOddsQualify(1.75)).toBe(true);
    expect(everyLegMeetsBonusOdds([1.80, 1.70])).toBe(false);
    expect(everyLegMeetsBonusOdds([1.80, 1.75])).toBe(true);
  });
});
