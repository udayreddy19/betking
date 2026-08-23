import { test, expect } from '@playwright/test';

const uiUrl = process.env.E2E_BASE_URL || '';

test.describe('VIP vs loyalty points display', () => {
  test.skip(!uiUrl, 'Set E2E_BASE_URL');

  test('VIP page explains tier thresholds', async ({ page }) => {
    await page.goto('/vip');
    await expect(page.getByText(/bronze|silver|gold|platinum|diamond/i).first()).toBeVisible();
  });

  test('help documents separate VIP progression', async ({ page }) => {
    await page.goto('/help');
    await expect(page.getByText(/vip|loyalty|points/i).first()).toBeVisible();
  });
});
