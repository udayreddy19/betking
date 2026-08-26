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

  test('betslip shows struck-through old odds and Accept new odds CTA', async ({ page }) => {
    // Keep restored ODDS_CHANGED fixture — block quote sync from overwriting UI state.
    await page.route('**/api/bets/quote-selections', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'E2E_FIXTURE_HOLD' }),
      });
    });

    await page.addInitScript(() => {
      localStorage.setItem('oddsyra_pending_betslip', JSON.stringify({
        bets: [{
          id: 'e2e-odds-1',
          matchId: 'e2e_match',
          matchName: 'E2E Home vs Away',
          marketId: 'match_winner',
          marketName: 'Match Winner',
          selection: 'home',
          selectionId: 'home',
          selectionName: 'Home',
          previousOdds: 1.85,
          odds: 1.95,
          oddsChanged: true,
          oddsStatus: 'ODDS_CHANGED',
          timestamp: Date.now(),
        }],
        stake: 10,
        betType: 'singles',
        singlesStakes: { 'e2e-odds-1': '10' },
        savedAt: Date.now(),
      }));
    });

    await page.goto('/sports');
    const fab = page.getByRole('button', { name: /open betslip/i });
    await expect(fab).toBeVisible({ timeout: 15000 });
    await fab.click();
    const dialog = page.getByRole('dialog', { name: /quick bet/i });
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(dialog.getByRole('status')).toContainText(/odds changed from 1\.85 to 1\.95/i);
    const oldOdds = dialog.locator('.mobile-betslip-quick-odds-old');
    await expect(oldOdds).toBeVisible();
    await expect(oldOdds).toHaveCSS('text-decoration-line', /line-through/);
    await expect(oldOdds).toHaveText('1.85');
    await expect(dialog.locator('.mobile-betslip-quick-odds-new')).toHaveText('1.95');
    await expect(dialog.getByText(/potential return/i)).toContainText('19.50');
    await expect(dialog.getByRole('button', { name: /^place bet$/i })).toBeDisabled();
    const accept = dialog.getByRole('button', { name: /accept\s*1\.95/i });
    await expect(accept).toBeVisible();
    await page.screenshot({ path: 'test-results/odds-changed-accept-ui.png', fullPage: true });
    await accept.click();
    await expect(dialog.getByRole('button', { name: /accept\s*1\.95/i })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /^place bet$/i })).toBeEnabled();
  });
});
