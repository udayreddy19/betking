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
    await expect(page.getByText(/total balance/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/cash balance/i).first()).toBeVisible();
  });
});
