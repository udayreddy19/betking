import { test, expect } from '@playwright/test';

const uiUrl = process.env.E2E_BASE_URL || '';
const authToken = process.env.E2E_AUTH_TOKEN || '';

test.describe('Money lifecycle browser smoke', () => {
  test.skip(!uiUrl, 'Set E2E_BASE_URL to the staging frontend origin');

  test('home and sports shell load', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/(sports)?$/);
    await page.goto('/sports');
    await expect(page.locator('body')).toBeVisible();
  });

  test('logged-in profile shows wallet grid when token provided', async ({ page, context }) => {
    test.skip(!authToken, 'Set E2E_AUTH_TOKEN for authenticated browser smoke');

    await context.addInitScript((token) => {
      sessionStorage.setItem('bk_access_token', token);
    }, authToken);

    await page.goto('/profile');
    // Wait for session hydrate. Wallet hero is mobile-only; desktop uses the grid.
    await expect(page).toHaveURL(/\/profile/, { timeout: 20000 });
    await expect(page.locator('.profile-wallet-grid .label', { hasText: /^Available$/i }).first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.profile-wallet-grid .label', { hasText: /Withdrawable/i }).first()).toBeVisible();
    await expect(page.locator('.profile-wallet-grid .label', { hasText: /Locked deposit/i }).first()).toBeVisible();
  });
});
