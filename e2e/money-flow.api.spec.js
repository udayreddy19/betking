import { test, expect } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL || process.env.E2E_BASE_URL || '';

test.describe('Staging money flow (register → deposit sandbox → bet → withdraw)', () => {
  test.skip(!apiUrl, 'Set E2E_API_URL (or E2E_BASE_URL) to the staging API origin');

  test('register, create sandbox deposit, place bet, request withdraw', async ({ request }) => {
    const stamp = Date.now();
    const email = `e2e.${stamp}@example.com`;
    const password = 'E2ePass2026!';

    const signup = await request.post(`${apiUrl}/api/auth/signup`, {
      data: {
        email,
        password,
        firstName: 'E2E Player',
        phone: '9876543210',
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
    expect(token).toBeTruthy();

    const auth = { Authorization: `Bearer ${token}` };

    const deposit = await request.post(`${apiUrl}/api/v1/payments/create-order`, {
      headers: auth,
      data: { amount: 1000, currency: 'INR' },
    });
    expect([200, 201, 400, 403]).toContain(deposit.status());
    const depositBody = await deposit.json().catch(() => ({}));
    if (!deposit.ok()) {
      expect(String(depositBody.code || depositBody.error || '')).toMatch(
        /KYC|AGE|DEPOSIT|REALITY|LIMIT|UNAUTHENTICATED/i,
      );
    }

    const bet = await request.post(`${apiUrl}/api/bets/place`, {
      headers: { ...auth, 'X-Idempotency-Key': `e2e-${stamp}` },
      data: {
        matchId: 'e2e_match',
        marketId: 'match_winner',
        selectionId: 'home',
        stake: 10,
        clientOdds: 1.85,
        fundSource: 'cash',
      },
    });
    expect([200, 400, 403]).toContain(bet.status());
    expect(bet.status()).not.toBe(401);

    const withdraw = await request.post(`${apiUrl}/api/v1/withdrawals/request`, {
      headers: auth,
      data: {
        amount: 10,
        bankDetails: { upiId: 'e2e@upi' },
      },
    });
    expect([200, 400, 403]).toContain(withdraw.status());
    expect(withdraw.status()).not.toBe(401);
  });
});
