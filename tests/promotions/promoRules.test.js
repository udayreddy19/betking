import { describe, it, expect } from 'vitest';
import { BONUS_MIN_BET_ODDS, BONUS_WAGERING_MULTIPLIER, bonusOddsQualify, everyLegMeetsBonusOdds } from '../../lib/promoRules.mjs';
import { hashIdentityValue, normalizePan, normalizeAadhaar } from '../../lib/userIdentity.mjs';
import { canBetWithBonusOnLegs, canBetWithFreebetOnLegs, splitBetWinPayout } from '../../src/utils/wageringRules.js';

describe('promo rules', () => {
  it('requires bonus bets at 1.75+ and 5x rotation', () => {
    expect(BONUS_MIN_BET_ODDS).toBe(1.75);
    expect(BONUS_WAGERING_MULTIPLIER).toBe(5);
    expect(bonusOddsQualify(1.74)).toBe(false);
    expect(bonusOddsQualify(1.75)).toBe(true);
    expect(everyLegMeetsBonusOdds([1.75, 2.0])).toBe(true);
    expect(everyLegMeetsBonusOdds([1.75, 1.70])).toBe(false);
  });

  it('lets free bets through at any odds on the frontend', () => {
    expect(canBetWithBonusOnLegs([{ odds: 1.60 }])).toBe(false);
    expect(canBetWithBonusOnLegs([{ odds: 1.75 }])).toBe(true);
    expect(canBetWithFreebetOnLegs([{ odds: 1.20 }])).toBe(true);
  });

  it('locks bonus returns in bonusCredit until rollover completes and credits freebet profit to cash', () => {
    const bonusWin = splitBetWinPayout({
      payout: 200,
      stake: 100,
      fundSource: 'bonus',
      bonusStake: 100,
      legs: [{ odds: 2 }],
    });
    expect(bonusWin.cashCredit).toBe(0);
    expect(bonusWin.bonusCredit).toBe(200);

    const freeWin = splitBetWinPayout({
      payout: 150,
      stake: 100,
      fundSource: 'freebet',
      freebetStake: 100,
      legs: [{ odds: 1.5 }],
    });
    expect(freeWin.cashCredit).toBe(50);
    expect(freeWin.winningsCredit).toBe(50);
    expect(freeWin.freebetCredit).toBe(0);
  });

  it('hashes PAN and Aadhaar consistently', () => {
    expect(normalizePan(' abcde1234f ')).toBe('ABCDE1234F');
    expect(normalizeAadhaar('1234 5678 9012')).toBe('123456789012');
    expect(hashIdentityValue('ABCDE1234F')).toHaveLength(64);
    expect(hashIdentityValue('ABCDE1234F')).toBe(hashIdentityValue('ABCDE1234F'));
  });
});
