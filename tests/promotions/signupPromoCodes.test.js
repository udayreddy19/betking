import { describe, it, expect } from 'vitest';
import { normalizePromoCode, SIGNUP_REWARD_TYPES, hasReachedPerUserLimit } from '../../lib/signupPromoCodes.mjs';
import {
  EXCLUSIVE_SIGNUP_PROMO_CODES,
  findClaimedExclusiveSignupPromo,
  isExclusiveSignupPromo,
  isExclusiveSignupPromoLocked,
} from '../../lib/exclusiveSignupPromos.mjs';

describe('signup promo codes', () => {
  it('normalizes codes to uppercase alphanumeric with dashes and underscores', () => {
    expect(normalizePromoCode('  welcome-100  ')).toBe('WELCOME-100');
    expect(normalizePromoCode('Free_Bet!')).toBe('FREE_BET');
    expect(normalizePromoCode('ab')).toBe('AB');
  });

  it('strips spaces and symbols and caps length at 32', () => {
    expect(normalizePromoCode('a b c')).toBe('ABC');
    expect(normalizePromoCode('x'.repeat(40))).toHaveLength(32);
    expect(normalizePromoCode(null)).toBe('');
  });

  it('supports bonus, freebet, and cash rewards', () => {
    expect(SIGNUP_REWARD_TYPES).toEqual(['bonus', 'freebet', 'cash']);
  });

  it('enforces a per-user claim cap', () => {
    expect(hasReachedPerUserLimit(0, 1)).toBe(false);
    expect(hasReachedPerUserLimit(1, 1)).toBe(true);
    expect(hasReachedPerUserLimit(2, 3)).toBe(false);
    expect(hasReachedPerUserLimit(3, 3)).toBe(true);
    expect(hasReachedPerUserLimit(99, null)).toBe(false);
  });

  it('treats SPORTS500, VIP1000, and LIVE100 as mutually exclusive', () => {
    expect(EXCLUSIVE_SIGNUP_PROMO_CODES).toEqual(['SPORTS500', 'VIP1000', 'LIVE100']);
    expect(isExclusiveSignupPromo('sports500')).toBe(true);
    expect(isExclusiveSignupPromo('WELCOME150')).toBe(false);
    expect(findClaimedExclusiveSignupPromo(['VIP1000', 'RELOAD50'])).toBe('VIP1000');
    expect(isExclusiveSignupPromoLocked('LIVE100', ['SPORTS500'])).toBe(true);
    expect(isExclusiveSignupPromoLocked('SPORTS500', [])).toBe(false);
  });
});
