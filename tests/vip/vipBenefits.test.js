import { describe, it, expect, beforeEach } from 'vitest';
import {
  pointsFromSpendAtTier,
  getBenefitsForTier,
  isVipClubTier,
  loyaltyTierFromPoints,
  applyVipOddsBoost,
  cashoutAmountFromPotential,
  crossedVipTiers,
  LOYALTY_POINTS_PER_100_STANDARD,
  LOYALTY_POINTS_PER_100_VIP,
} from '../../lib/vipBenefits.mjs';
import { addLoyaltyPoints } from '../../lib/referralLoyaltyEngine.mjs';
import { query } from '../../db/pg.js';

describe('VIP vs standard benefits', () => {
  it('gives standard players 2 points per ₹100 and VIP club 5', () => {
    expect(LOYALTY_POINTS_PER_100_STANDARD).toBe(2);
    expect(LOYALTY_POINTS_PER_100_VIP).toBe(5);
    expect(pointsFromSpendAtTier(1000, 'BRONZE')).toBe(20);
    expect(pointsFromSpendAtTier(1000, 'SILVER')).toBe(50);
    expect(pointsFromSpendAtTier(1000, 'GOLD')).toBe(50);
    expect(isVipClubTier('BRONZE')).toBe(false);
    expect(isVipClubTier('GOLD')).toBe(true);
    expect(getBenefitsForTier('DIAMOND').maxWithdraw).toBe(1000000);
    expect(getBenefitsForTier('BRONZE').cashbackPct).toBe(0);
    expect(getBenefitsForTier('BRONZE').minWithdraw).toBe(1000);
    expect(getBenefitsForTier('BRONZE').minDeposit).toBe(1000);
    expect(getBenefitsForTier('GOLD').cashoutPayoutPct).toBe(0.90);
    expect(getBenefitsForTier('DIAMOND').oddsBoostPct).toBe(5);
    expect(applyVipOddsBoost(2, 'GOLD')).toBe(2.04);
    expect(cashoutAmountFromPotential(1000, 'BRONZE')).toBe(850);
    expect(cashoutAmountFromPotential(1000, 'DIAMOND')).toBe(950);
    expect(crossedVipTiers('BRONZE', 'GOLD')).toEqual(['SILVER', 'GOLD']);
    expect(getBenefitsForTier('GOLD').cashbackPct).toBe(5);
    expect(loyaltyTierFromPoints(24999)).toBe('PLATINUM');
    expect(loyaltyTierFromPoints(25000)).toBe('DIAMOND');
  });

  it('awards stake points at the user current tier', async () => {
    const standardId = `usr_vip_std_${Date.now()}`;
    const vipId = `usr_vip_club_${Date.now()}`;
    await query(
      `INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash'), ($3, $4, 'hash')`,
      [standardId, `${standardId}@example.com`, vipId, `${vipId}@example.com`],
    );
    await query(
      `INSERT INTO user_loyalty (user_id, points, tier) VALUES ($1, 0, 'BRONZE'), ($2, 600, 'SILVER')`,
      [standardId, vipId],
    );

    const std = await addLoyaltyPoints({ userId: standardId, stakeAmount: 1000 });
    const vip = await addLoyaltyPoints({ userId: vipId, stakeAmount: 1000 });

    expect(std.earnedPoints).toBe(20);
    expect(vip.earnedPoints).toBe(50);

    await query(`DELETE FROM user_loyalty WHERE user_id IN ($1, $2)`, [standardId, vipId]);
    await query(`DELETE FROM users WHERE user_id IN ($1, $2)`, [standardId, vipId]);
  });
});
