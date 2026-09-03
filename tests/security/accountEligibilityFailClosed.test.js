import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../../db/pg.js', () => ({
  query: (...args) => query(...args),
}));

import { accountEligibilityEngine } from '../../lib/accountEligibilityEngine.mjs';

describe('accountEligibilityEngine fail-closed', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('rejects when the lookup throws', async () => {
    query.mockRejectedValueOnce(new Error('connection refused'));
    await expect(accountEligibilityEngine.verifyEligibility('usr_1')).rejects.toThrow(
      'ACCOUNT_ELIGIBILITY_UNAVAILABLE',
    );
  });

  it('rejects unknown users', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(accountEligibilityEngine.verifyEligibility('usr_missing')).rejects.toThrow(
      'ACCOUNT_NOT_FOUND',
    );
  });

  it('rejects suspended users.status even without a controls row', async () => {
    query.mockResolvedValueOnce({
      rows: [{ user_id: 'usr_1', user_status: 'SUSPENDED', account_state: null, restricted_until: null }],
    });
    await expect(accountEligibilityEngine.verifyEligibility('usr_1')).rejects.toThrow('ACCOUNT_SUSPENDED');
  });

  it('allows an active user with no controls', async () => {
    query.mockResolvedValueOnce({
      rows: [{ user_id: 'usr_1', user_status: 'ACTIVE', account_state: null, restricted_until: null }],
    });
    await expect(accountEligibilityEngine.verifyEligibility('usr_1')).resolves.toEqual({
      eligible: true,
      userId: 'usr_1',
      status: 'ACTIVE',
    });
  });

  it('blocks betting when account is on BETTING_HOLD', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        user_id: 'usr_1',
        user_status: 'ACTIVE',
        account_state: 'BETTING_HOLD',
        reason: 'ladder abuse',
        restricted_until: null,
      }],
    });
    await expect(
      accountEligibilityEngine.verifyEligibility('usr_1', { forBetting: true }),
    ).rejects.toThrow(/ACCOUNT_ON_HOLD/);
  });

  it('allows deposits when only BETTING_HOLD is set', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        user_id: 'usr_1',
        user_status: 'ACTIVE',
        account_state: 'BETTING_HOLD',
        reason: 'ladder abuse',
        restricted_until: null,
      }],
    });
    await expect(accountEligibilityEngine.verifyEligibility('usr_1')).resolves.toMatchObject({
      eligible: true,
      userId: 'usr_1',
    });
  });
});
