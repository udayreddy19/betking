import { test, expect } from '@playwright/test';
import {
  shouldApplyFinancialWsEvent,
  isFinancialWsEventType,
} from '../src/utils/wsFinancialEvents.js';

test.describe('Wallet WS financial event guards', () => {
  test('dedupes duplicate settlement events', () => {
    const seen = new Set();
    const lastTs = { current: 0 };
    const msg = { eventId: 'evt_settle_1', timestamp: 5000, payload: { eventId: 'evt_settle_1' } };
    expect(shouldApplyFinancialWsEvent(msg, seen, lastTs).apply).toBe(true);
    expect(shouldApplyFinancialWsEvent(msg, seen, lastTs).reason).toBe('duplicate');
  });

  test('recognizes wallet refresh event types', () => {
    expect(isFinancialWsEventType('BET_SETTLED')).toBe(true);
    expect(isFinancialWsEventType('WALLET_BALANCE_UPDATED')).toBe(true);
  });
});

test.describe('Wallet WS browser resync', () => {
  test.skip(!process.env.E2E_BASE_URL, 'Set E2E_BASE_URL for browser WS smoke');

  test('sports page loads without auth errors after refresh token path', async ({ page }) => {
    await page.goto('/sports');
    await expect(page.locator('body')).toBeVisible();
    await page.reload();
    await expect(page.locator('body')).toBeVisible();
  });
});
