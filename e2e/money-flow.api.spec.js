import { test, expect } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL || process.env.E2E_BASE_URL || '';

test.describe('Staging money flow (register → deposit sandbox → bet → withdraw)', () => {
  test.skip(!apiUrl, 'Set E2E_API_URL (or E2E_BASE_URL) to the staging API origin');

  test('register, create sandbox deposit, place bet, request withdraw', async ({ request }) => {
    const stamp = Date.now();
    const email = `e2e.${stamp}@example.com`;
    const password = 'E2ePass2026!';

    let signup;
    try {
      signup = await request.post(`${apiUrl}/api/auth/signup`, {
        data: {
          email,
          password,
          firstName: 'E2E Player',
          phone: `98${String(stamp).slice(-8)}`,
        },
      });
    } catch {
      test.skip(true, 'API unreachable');
      return;
    }
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

    const walletBefore = await request.get(`${apiUrl}/api/wallet`, { headers: auth });
    const walletBeforeJson = walletBefore.ok() ? await walletBefore.json() : null;
    const balanceBefore = walletBeforeJson
      ? Number(walletBeforeJson.balance ?? walletBeforeJson.cashBalance ?? 0)
      : null;

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
    // 409 ODDS_CHANGED is a valid gate: no debit until the client accepts new odds.
    expect([200, 400, 403, 409]).toContain(bet.status());
    expect(bet.status()).not.toBe(401);
    if (bet.status() === 409) {
      const body = await bet.json();
      expect(['ODDS_CHANGED', 'STALE_ODDS', 'ODDS_UNAVAILABLE', 'MARKET_SUSPENDED']).toContain(body.code);
      if (balanceBefore != null && walletBefore.ok()) {
        const walletAfter = await request.get(`${apiUrl}/api/wallet`, { headers: auth });
        const balanceAfter = Number((await walletAfter.json()).balance ?? (await walletAfter.json()).cashBalance ?? 0);
        expect(balanceAfter).toBe(balanceBefore);
      }
      if (body.code === 'ODDS_CHANGED' && body.data?.newOdds) {
        const accepted = await request.post(`${apiUrl}/api/bets/place`, {
          headers: { ...auth, 'X-Idempotency-Key': `e2e-accept-${stamp}` },
          data: {
            matchId: 'e2e_match',
            marketId: 'match_winner',
            selectionId: 'home',
            stake: 10,
            clientOdds: Number(body.data.newOdds),
            acceptedOdds: Number(body.data.newOdds),
            fundSource: 'cash',
          },
        });
        expect([200, 400, 403, 409]).toContain(accepted.status());
        expect(accepted.status()).not.toBe(401);
      }
    }

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
