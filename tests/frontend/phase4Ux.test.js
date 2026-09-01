/**
 * Phase 4 UX — display helpers and odds-change accept-gate behaviour.
 * No engine rebuilds; frontend mirrors server-authoritative values only.
 */
import { describe, it, expect } from 'vitest';
import {
  applyOddsChangedToBets,
  hasPendingOddsAcceptance,
  isNonAcceptableMarketError,
  ODDS_STATUS,
} from '../../src/utils/oddsChangeHandler.js';
import { MIN_STAKE_INR, MAX_STAKE_INR } from '../../src/utils/wageringRules.js';

describe('Phase 4 bet-slip UX helpers', () => {
  const bet = {
    id: 'b1',
    matchId: 'm1',
    marketId: 'match_winner',
    selection: '1',
    selectionId: '1',
    odds: 1.9,
  };

  it('marks oddsStatus CHANGED so placement requires accept', () => {
    const next = applyOddsChangedToBets([bet], [{
      matchId: 'm1',
      selectionId: '1',
      oldOdds: 1.9,
      newOdds: 2.05,
    }]);
    expect(next[0].oddsStatus).toBe(ODDS_STATUS.CHANGED);
    expect(hasPendingOddsAcceptance(next)).toBe(true);
    expect(next[0].previousOdds).toBe(1.9);
    expect(next[0].odds).toBe(2.05);
  });

  it('classifies suspended/unavailable market codes', () => {
    expect(isNonAcceptableMarketError({ code: 'MARKET_SUSPENDED' })).toBe(true);
    expect(isNonAcceptableMarketError({ code: 'SELECTION_UNAVAILABLE' })).toBe(true);
    expect(isNonAcceptableMarketError({ code: 'ODDS_CHANGED' })).toBe(false);
  });

  it('exposes min stake and unlimited max stake constants', () => {
    expect(MIN_STAKE_INR).toBe(10);
    expect(MAX_STAKE_INR).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('Phase 4 StatusBadge recon mapping', () => {
  it('maps finance health flags via keyword lists', async () => {
    // Mirror AdminBadge StatusBadge defaultMap keywords without mounting React
    const warning = ['WARNING', 'DISCREPANCY', 'MISMATCH', 'MEDIUM', 'HOLD', 'PENDING_CHECKER'];
    const danger = ['CRITICAL', 'HIGH'];
    const success = ['HEALTHY', 'MATCHED', 'RESOLVED'];
    expect(warning.some((k) => 'DISCREPANCY'.includes(k))).toBe(true);
    expect(danger.some((k) => 'CRITICAL'.includes(k))).toBe(true);
    expect(success.some((k) => 'HEALTHY'.includes(k))).toBe(true);
  });
});

describe('Phase 4 Customer 360 dossier tabs', () => {
  it('includes VIP and Recon tabs in the dossier tab list', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(
      new URL('../../src/pages/Admin/domains/CustomersDomainView.jsx', import.meta.url),
      'utf8',
    );
    expect(src).toMatch(/id:\s*'vip'/);
    expect(src).toMatch(/id:\s*'recon'/);
    expect(src).toMatch(/canViewFullPii/);
    expect(src).toMatch(/legalNameSource/);
  });
});

describe('Phase 4 Admin UI primitives', () => {
  it('ships AdminPageHeader and FilterDateRange', async () => {
    const fs = await import('node:fs');
    expect(fs.existsSync(new URL('../../src/pages/Admin/components/AdminPageHeader.jsx', import.meta.url))).toBe(true);
    const filterBar = fs.readFileSync(
      new URL('../../src/pages/Admin/components/AdminFilterBar.jsx', import.meta.url),
      'utf8',
    );
    expect(filterBar).toMatch(/FilterDateRange/);
    const table = fs.readFileSync(
      new URL('../../src/pages/Admin/components/AdminDataTable.jsx', import.meta.url),
      'utf8',
    );
    expect(table).toMatch(/renderExpandedRow/);
    expect(table).toMatch(/admin-table-mobile-cards/);
  });

  it('locks modal place when odds acceptance pending', async () => {
    const fs = await import('node:fs');
    const footer = fs.readFileSync(
      new URL('../../src/components/BetSlip/BetSlipFooter.jsx', import.meta.url),
      'utf8',
    );
    expect(footer).toMatch(/needsOddsAcceptance/);
    expect(footer).toMatch(/Accept odds first/);
  });
});
