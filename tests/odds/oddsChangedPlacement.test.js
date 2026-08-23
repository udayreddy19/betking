import { describe, it, expect } from 'vitest';
import {
  normalizeOddsPrice,
  oddsPricesEqual,
  detectOddsChange,
  isStaleOddsDrift,
} from '../../lib/oddsComparison.mjs';
import { validatePlacementOdds } from '../../lib/oddsPlacementValidation.mjs';

describe('oddsComparison', () => {
  it('treats 1.850 and 1.85 as equivalent', () => {
    expect(oddsPricesEqual(1.850, 1.85)).toBe(true);
    expect(normalizeOddsPrice('1.850')).toBe('1.85');
  });

  it('detects real price moves', () => {
    const change = detectOddsChange(2.10, 1.85);
    expect(change.changed).toBe(true);
    expect(change.oldOdds).toBe('1.85');
    expect(change.newOdds).toBe('2.10');
  });

  it('flags excessive drift as stale', () => {
    expect(isStaleOddsDrift(1.85, 2.50, 0.25)).toBe(true);
    expect(isStaleOddsDrift(1.85, 1.90, 0.25)).toBe(false);
  });
});

describe('validatePlacementOdds', () => {
  const base = {
    matchId: 'm1',
    marketId: 'match_winner',
    selectionId: '1',
    userId: 'u1',
  };

  it('accepts unchanged odds', () => {
    expect(validatePlacementOdds({ ...base, serverOdds: 1.85, clientOdds: 1.85 })).toBe(1.85);
    expect(validatePlacementOdds({ ...base, serverOdds: 1.85, clientOdds: 1.850 })).toBe(1.85);
  });

  it('throws ODDS_CHANGED when price moved within drift window', () => {
    expect(() => validatePlacementOdds({ ...base, serverOdds: 2.10, clientOdds: 1.85 }))
      .toThrow(/ODDS_CHANGED/);
    try {
      validatePlacementOdds({ ...base, serverOdds: 2.10, clientOdds: 1.85, oddsVersion: 'v1' });
    } catch (err) {
      expect(err.code).toBe('ODDS_CHANGED');
      expect(err.httpStatus).toBe(409);
      expect(err.data.oldOdds).toBe('1.85');
      expect(err.data.newOdds).toBe('2.10');
      expect(err.data.requiresAcceptance).toBe(true);
    }
  });

  it('throws ODDS_CHANGED when price decreased', () => {
    expect(() => validatePlacementOdds({ ...base, serverOdds: 1.85, clientOdds: 2.10 }))
      .toThrow(/ODDS_CHANGED/);
  });

  it('throws STALE_ODDS when drift exceeds permitted window', () => {
    expect(() => validatePlacementOdds({ ...base, serverOdds: 1.85, clientOdds: 3.00 }))
      .toThrow(/STALE_ODDS/);
  });
});
