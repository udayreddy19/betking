import { describe, it, expect } from 'vitest';
import {
  mapDepositPromotionRow,
  mapSignupCodeRow,
  isPublicCatalogPromotionRow,
} from '../../lib/promotionCatalog.mjs';

describe('promotionCatalog', () => {
  it('maps deposit promotion with display metadata', () => {
    const item = mapDepositPromotionRow({
      id: 'promo_welcome150',
      name: '150% Welcome Sports Bonus up to ₹30,000',
      code: 'WELCOME150',
      type: 'DEPOSIT_BONUS',
      max_reward: '30000',
      min_odds: '1.50',
      min_stake: '100',
      wagering_multiplier: '5',
      match_percent: '150',
      starts_at: null,
      expires_at: '2027-01-01T00:00:00.000Z',
    });

    expect(item.claimType).toBe('deposit_bonus');
    expect(item.code).toBe('WELCOME150');
    expect(item.tag).toBe('NEW PLAYERS');
    expect(item.matchPercent).toBe(150);
    expect(item.maxReward).toBe(30000);
    expect(Array.isArray(item.terms)).toBe(true);
    expect(item.terms.length).toBeGreaterThan(0);
    expect(item.terms[0]).toMatch(/first successful sports deposit/i);
  });

  it('maps MONSOON30 with seasonal terms and window fields', () => {
    const item = mapDepositPromotionRow({
      id: 'promo_monsoon30',
      name: 'Monsoon Deposit Fest — 30% bonus',
      code: 'MONSOON30',
      type: 'DEPOSIT_BONUS',
      max_reward: '5000',
      min_odds: '1.75',
      min_stake: '2000',
      wagering_multiplier: '5',
      match_percent: '30',
      starts_at: '2026-09-06T18:31:00.000Z',
      expires_at: '2026-09-21T18:29:00.000Z',
    });

    expect(item.tag).toBe('MONSOON FEST');
    expect(item.matchPercent).toBe(30);
    expect(item.minStake).toBe(2000);
    expect(item.maxReward).toBe(5000);
    expect(item.startsAt).toBeTruthy();
    expect(item.expiresAt).toBeTruthy();
    expect(item.terms).toEqual(expect.arrayContaining([
      expect.stringMatching(/MONSOON30/),
      expect.stringMatching(/₹2,000/),
      expect.stringMatching(/max ₹5,000/),
    ]));
  });

  it('maps signup promo code for catalog display', () => {
    const item = mapSignupCodeRow({
      code_id: 'spc_sports500',
      code: 'SPORTS500',
      name: '₹500 Free Bet for New Players',
      reward_type: 'freebet',
      amount: '500',
      max_redemptions: 25000,
      redemption_count: 0,
      max_per_user: 1,
    });

    expect(item.claimType).toBe('signup_code');
    expect(item.rewardType).toBe('freebet');
    expect(item.bonusAmount).toBe(500);
    expect(item.title).toContain('₹500');
    expect(item.terms.length).toBeGreaterThan(0);
  });

  it('treats targeted and spin grant promos as non-public', () => {
    expect(isPublicCatalogPromotionRow({ code: 'MONSOON30', is_targeted: false })).toBe(true);
    expect(isPublicCatalogPromotionRow({ code: 'TDFBADWHOM', is_targeted: true })).toBe(false);
    expect(isPublicCatalogPromotionRow({ code: 'SPIN_2026-09-08', id: 'promo_spin_2026-09-08' })).toBe(false);
    expect(isPublicCatalogPromotionRow({ code: 'TDFBQZCJGR', id: 'promo_tdfb_abc' })).toBe(false);
  });
});
