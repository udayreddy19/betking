import { test, expect } from '@playwright/test';
import {
  applyOddsChangedToBets,
  isOddsChangedResponse,
  ODDS_STATUS,
} from '../src/utils/oddsChangeHandler.js';

test.describe('Odds-changed betslip UX helpers', () => {
  test('flags ODDS_CHANGED API responses', () => {
    expect(isOddsChangedResponse({ code: 'ODDS_CHANGED' })).toBe(true);
    expect(isOddsChangedResponse({ code: 'STALE_ODDS' })).toBe(true);
    expect(isOddsChangedResponse({ code: 'OK' })).toBe(false);
  });

  test('updates betslip rows without removing selections', () => {
    const bets = [{
      id: 'b1',
      matchId: 'm1',
      selectionId: 'home',
      odds: 1.85,
    }];
    const next = applyOddsChangedToBets(bets, [{
      matchId: 'm1',
      selectionId: 'home',
      oldOdds: 1.85,
      newOdds: 1.92,
    }]);
    expect(next).toHaveLength(1);
    expect(next[0].odds).toBe(1.92);
    expect(next[0].oddsStatus).toBe(ODDS_STATUS.CHANGED);
  });
});

test.describe('Odds-changed UI surfaces', () => {
  test.skip(!process.env.E2E_BASE_URL, 'Set E2E_BASE_URL');

  test('help documents odds acceptance policy', async ({ page }) => {
    await page.goto('/help');
    await expect(page.getByText(/odds|bet/i).first()).toBeVisible();
  });
});
