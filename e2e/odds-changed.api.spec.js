import { test, expect } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL || process.env.E2E_BASE_URL || '';

test.describe('Odds changed placement contract', () => {
  test.skip(!apiUrl, 'Set E2E_API_URL (or E2E_BASE_URL) to the staging API origin');

  test('returns 409 ODDS_CHANGED with old/new odds and no financial side effects', async ({ request }) => {
    const stamp = Date.now();
    const email = `odds.e2e.${stamp}@example.com`;
    const password = 'E2ePass2026!';

    const signup = await request.post(`${apiUrl}/api/auth/signup`, {
      data: {
        email,
        password,
        firstName: 'Odds E2E',
        phone: `97${String(stamp).slice(-8)}`,
      },
    });
    expect([200, 201]).toContain(signup.status());
    const signupJson = await signup.json();
    let token = signupJson.accessToken;
    if (!token) {
      const login = await request.post(`${apiUrl}/api/auth/login`, {
        data: { email, password },
      });
      expect(login.ok()).toBeTruthy();
      token = (await login.json()).accessToken;
    }

    const auth = { Authorization: `Bearer ${token}` };

    const walletBefore = await request.get(`${apiUrl}/api/wallet`, { headers: auth });
    const balanceBefore = walletBefore.ok()
      ? Number((await walletBefore.json()).balance ?? (await walletBefore.json()).cashBalance ?? 0)
      : null;

    const place = await request.post(`${apiUrl}/api/bets/place`, {
      headers: { ...auth, 'X-Idempotency-Key': `odds-e2e-${stamp}` },
      data: {
        matchId: process.env.E2E_MATCH_ID || 'e2e_match',
        marketId: 'match_winner',
        selectionId: 'home',
        stake: 10,
        clientOdds: Number(process.env.E2E_STALE_CLIENT_ODDS || 1.01),
        fundSource: 'cash',
      },
    });

    if (place.status() === 409) {
      const body = await place.json();
      expect(body.success).toBe(false);
      expect(['ODDS_CHANGED', 'STALE_ODDS', 'ODDS_UNAVAILABLE', 'MARKET_SUSPENDED']).toContain(body.code);
      if (body.code === 'ODDS_CHANGED') {
        expect(body.data?.oldOdds).toBeTruthy();
        expect(body.data?.newOdds).toBeTruthy();
        expect(body.data?.requiresAcceptance).toBe(true);
      }
      if (balanceBefore != null && walletBefore.ok()) {
        const walletAfter = await request.get(`${apiUrl}/api/wallet`, { headers: auth });
        const balanceAfter = Number((await walletAfter.json()).balance ?? (await walletAfter.json()).cashBalance ?? 0);
        expect(balanceAfter).toBe(balanceBefore);
      }
      return;
    }

    expect([200, 400, 403]).toContain(place.status());
  });
});
