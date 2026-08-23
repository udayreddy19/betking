import { test, expect } from '@playwright/test';
import { buildSpinGrantNotice, formatSpinGrantExpiry } from '../src/utils/spinGrantUi.js';

test.describe('Spin prize 24h expiry UX', () => {
  test('builds wallet notice for active spin grants', () => {
    const future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const notice = buildSpinGrantNotice({
      bonusRemaining: 100,
      nextBonusExpiresAt: future,
    });
    expect(notice?.message).toMatch(/24h|use within/i);
    expect(notice?.message).toMatch(/Spin bonus/);
  });

  test('formats remaining time', () => {
    const future = new Date(Date.now() + 90 * 60 * 1000).toISOString();
    expect(formatSpinGrantExpiry(future)).toMatch(/left/);
  });
});

test.describe('Spin expiry UI copy', () => {
  test.skip(!process.env.E2E_BASE_URL, 'Set E2E_BASE_URL');

  test('help mentions daily spin rewards', async ({ page }) => {
    await page.goto('/help');
    await expect(page.getByText(/spin|reward|bonus/i).first()).toBeVisible();
  });
});
