import { test, expect } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL || process.env.E2E_BASE_URL || '';
const uiUrl = process.env.E2E_BASE_URL || '';

/**
 * Controlled settlement WebSocket E2E without Razorpay.
 * Requires: E2E_HARNESS=1 on API (non-production), Vite UI, E2E_BASE_URL / E2E_API_URL.
 */
test.describe('Settlement WebSocket lifecycle (no Razorpay)', () => {
  test.skip(!apiUrl || !uiUrl, 'Set E2E_BASE_URL and E2E_API_URL');

  test('fund → place-settle WIN → wallet Available changes without manual refresh', async ({ page, request, context }) => {
    let harness;
    try {
      harness = await request.get(`${apiUrl}/api/e2e/harness-status`);
    } catch {
      test.skip(true, 'API unreachable for settlement WS harness');
      return;
    }
    test.skip(harness.status() === 404, 'E2E_HARNESS not enabled on API (set E2E_HARNESS=1, non-production)');

    const stamp = Date.now();
    const email = `settle.ws.${stamp}@example.com`;
    const password = 'E2ePass2026!';
    const signup = await request.post(`${apiUrl}/api/auth/signup`, {
      data: {
        email,
        password,
        firstName: 'Settle WS',
        phone: `91${String(stamp).slice(-8)}`,
      },
    });
    expect([200, 201]).toContain(signup.status());
    const signupJson = await signup.json();
    let token = signupJson.accessToken;
    if (!token) {
      const login = await request.post(`${apiUrl}/api/auth/login`, { data: { email, password } });
      token = (await login.json()).accessToken;
    }
    expect(token).toBeTruthy();
    const auth = { Authorization: `Bearer ${token}` };

    const fund = await request.post(`${apiUrl}/api/e2e/fund`, {
      headers: auth,
      data: { amount: 1000 },
    });
    expect(fund.ok()).toBeTruthy();

    await context.addInitScript((t) => {
      sessionStorage.setItem('bk_access_token', t);
    }, token);

    await page.goto('/profile');
    await expect(page).toHaveURL(/\/profile/, { timeout: 20000 });
    await expect(page.locator('.profile-wallet-grid .label', { hasText: /^Available$/i }).first())
      .toBeVisible({ timeout: 20000 });
    // Wait until funded balance is visible (₹1,000)
    await expect.poll(async () => {
      return page.locator('.profile-wallet-grid .value').first().innerText();
    }, { timeout: 20000 }).toMatch(/1,?000/);

    const availableBefore = await page.locator('.profile-wallet-grid .value').first().innerText();

    const wsFrames = [];
    page.on('websocket', (ws) => {
      ws.on('framereceived', (frame) => {
        const payload = String(frame.payload || '');
        if (/BET_SETTLED|WALLET_BALANCE_UPDATED/i.test(payload)) wsFrames.push(payload.slice(0, 200));
      });
    });

    const cycle = await request.post(`${apiUrl}/api/e2e/place-settle`, {
      headers: auth,
      data: { stake: 100, odds: 1.5, outcome: 'WON' },
    });
    expect(cycle.ok()).toBeTruthy();
    const cycleBody = await cycle.json();
    expect(cycleBody.betId).toBeTruthy();
    expect(Number(cycleBody.wallet?.balance)).toBe(1050);

    // Stay on the same page — no manual refresh. Expect Available → ₹1,050.
    await expect.poll(async () => {
      return page.locator('.profile-wallet-grid .value').first().innerText();
    }, { timeout: 30000 }).toMatch(/1,?050/);

    expect(availableBefore).not.toMatch(/1,?050/);
    if (wsFrames.length) {
      test.info().annotations.push({ type: 'ws', description: `captured ${wsFrames.length} financial WS frame(s)` });
    }
  });
});
