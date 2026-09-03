/**
 * House protection hard gates — stake/win/ladder/odds caps.
 */
import { describe, it, expect } from 'vitest';
import {
  HOUSE_LIMITS,
  isTotalsMarket,
  isOverSelection,
  assertHouseStakeAndOddsLimits,
  liabilityLimitForMarket,
} from '../lib/houseProtectionEngine.mjs';
import { stakeLimitEngine } from '../lib/stakeLimitEngine.mjs';

describe('houseProtectionEngine', () => {
  it('classifies totals markets and Over selections', () => {
    expect(isTotalsMarket('team_total')).toBe(true);
    expect(isTotalsMarket('match_total')).toBe(true);
    expect(isTotalsMarket('team_total_fours')).toBe(false);
    expect(isOverSelection('sel_over_169.5', 'Over 169.5')).toBe(true);
    expect(isOverSelection('sel_under_169.5', 'Under 169.5')).toBe(false);
  });

  it('rejects oversized cash stakes on live totals', () => {
    expect(() => assertHouseStakeAndOddsLimits({
      stake: 6000,
      odds: 1.6,
      marketId: 'team_total',
      selectionId: 'sel_over_150.5',
      selectionName: 'Over 150.5',
      fundSource: 'cash',
    })).toThrow(/LIVE_TOTALS_STAKE_CAP|max stake/i);
  });

  it('rejects soft Over odds above house cap on totals', () => {
    expect(() => assertHouseStakeAndOddsLimits({
      stake: 1000,
      odds: 2.2,
      marketId: 'team_total',
      selectionId: 'sel_over_150.5',
      selectionName: 'Over 150.5',
      fundSource: 'cash',
    })).toThrow(/LIVE_TOTALS_ODDS_CAP|Over odds/i);
  });

  it('rejects bets whose potential win exceeds global max', () => {
    expect(() => assertHouseStakeAndOddsLimits({
      stake: 20000,
      odds: 5.0,
      marketId: 'match_winner',
      selectionId: 'team1',
      fundSource: 'cash',
    })).toThrow(/MAX_WIN|potential win/i);
  });

  it('allows a normal totals Over within caps', () => {
    expect(() => assertHouseStakeAndOddsLimits({
      stake: 2000,
      odds: 1.55,
      marketId: 'team_total',
      selectionId: 'sel_over_150.5',
      selectionName: 'Over 150.5',
      fundSource: 'cash',
    })).not.toThrow();
  });

  it('uses tighter liability for totals markets', () => {
    expect(liabilityLimitForMarket('team_total')).toBe(HOUSE_LIMITS.matchLiabilityTotals);
    expect(liabilityLimitForMarket('match_winner')).toBe(HOUSE_LIMITS.matchLiabilityDefault);
  });

  it('enforces global max stake via stakeLimitEngine', () => {
    expect(() => stakeLimitEngine.validateStake(HOUSE_LIMITS.globalMaxStake + 1)).toThrow(/STAKE_LIMIT_EXCEEDED/);
    expect(stakeLimitEngine.validateStake(100)).toBe(100);
  });
});
