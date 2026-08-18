import { describe, it, expect } from 'vitest';
import {
  mapDepositPromotionRow,
  mapSignupCodeRow,
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
      expires_at: '2027-01-01T00:00:00.000Z',
    });

    expect(item.claimType).toBe('deposit_bonus');
    expect(item.code).toBe('WELCOME150');
    expect(item.tag).toBe('NEW PLAYERS');
    expect(item.matchPercent).toBe(150);
    expect(item.maxReward).toBe(30000);
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
  });
});
