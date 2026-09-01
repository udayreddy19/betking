import { describe, expect, it } from 'vitest';
import { sessionWithoutInventedWallet } from '../../src/context/auth/localSessionStore.js';

describe('sessionWithoutInventedWallet', () => {
  it('keeps the cached wallet for the same account', () => {
    const session = sessionWithoutInventedWallet(
      { userId: 'usr_1', email: 'a@example.com', displayName: 'A' },
      { userId: 'usr_1', email: 'a@example.com', balance: 191, walletReady: true },
    );
    expect(session.balance).toBe(191);
    expect(session.walletReady).toBe(true);
  });

  it('does not invent ₹0 for a new session when /me failed', () => {
    const session = sessionWithoutInventedWallet({
      userId: 'usr_2',
      email: 'b@example.com',
      displayName: 'B',
    });
    expect(session.balance).toBeUndefined();
    expect(session.walletReady).toBe(false);
  });
});
