import { test, expect } from '@playwright/test';

const uiUrl = process.env.E2E_BASE_URL || '';

test.describe('Casino and fantasy stay gated', () => {
  test.skip(!uiUrl, 'Set E2E_BASE_URL to the staging frontend origin');

  test('casino routes away from a real-money lobby', async ({ page }) => {
    await page.goto('/casino');
    await expect(page).toHaveURL(/\/sports/);
  });

  test('fantasy does not show a Join contest control', async ({ page }) => {
    await page.goto('/fantasy');
    await expect(page.getByRole('button', { name: /join contest/i })).toHaveCount(0);
    await expect(page.getByText(/licensed contests|not live yet/i).first()).toBeVisible();
  });

  test('register still requires 18+ acknowledgement', async ({ page }) => {
    await page.goto('/register');
    const ageBox = page.locator('#reg-agree');
    await expect(ageBox).toBeVisible();
    await expect(ageBox).not.toBeChecked();
    // Scope to the register form submit — guest sidebar also has "Create account".
    await expect(page.locator('#register-submit')).toBeDisabled();
    await ageBox.check();
    await expect(page.locator('#register-submit')).toBeEnabled();
  });
});
