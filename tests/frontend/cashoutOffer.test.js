import { describe, expect, it } from 'vitest';
import { getCashoutOffer } from '../../src/utils/wageringRules.js';

describe('getCashoutOffer', () => {
  const bet = {
    status: 'pending',
    fundSource: 'cash',
    stake: 1500,
    odds: 1.96,
    potentialReturn: 2940,
  };

  it('does not use VIP% of potential payout (the bug that showed ~2499 on a fresh 1500 stake)', () => {
    expect(getCashoutOffer(bet, 'BRONZE')).toBe(0);
    expect(getCashoutOffer(bet, 'BRONZE', null)).toBe(0);
  });

  it('prices near stake when live odds match accepted odds', () => {
    // stake * 1 * 0.96 * 0.85 = 1224
    expect(getCashoutOffer(bet, 'BRONZE', 1.96)).toBe(1224);
  });

  it('rises when selection shortens (current odds fall)', () => {
    const offer = getCashoutOffer(bet, 'BRONZE', 1.4);
    expect(offer).toBeGreaterThan(1224);
    expect(offer).toBeLessThan(2940 * 0.98);
  });

  it('falls when selection drifts (current odds rise)', () => {
    const offer = getCashoutOffer(bet, 'BRONZE', 2.5);
    expect(offer).toBeLessThan(1224);
    expect(offer).toBeGreaterThan(0);
  });
});
