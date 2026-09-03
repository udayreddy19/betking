/**
 * DB-backed match liability capacity (authoritative across instances).
 */
import { describe, it, expect } from 'vitest';
import { assertPersistedMatchLiabilityCapacity } from '../../lib/persistedMarketLiability.mjs';

describe('assertPersistedMatchLiabilityCapacity', () => {
  it('rejects when open-bet liability + new stake exceeds limit', async () => {
    const exec = async () => ({ rows: [{ liability: 9000 }] });
    await expect(
      assertPersistedMatchLiabilityCapacity({
        matchId: 'm1',
        stake: 1000,
        odds: 2.5, // add liability = 1500 → 10500 > 10000
        maxLiabilityLimit: 10000,
        exec,
      }),
    ).rejects.toMatchObject({
      code: 'MARKET_LIABILITY_FULL',
      remainingCapacity: 1000,
    });
  });

  it('allows when capacity remains', async () => {
    const exec = async () => ({ rows: [{ liability: 2000 }] });
    const res = await assertPersistedMatchLiabilityCapacity({
      matchId: 'm1',
      stake: 100,
      odds: 2,
      maxLiabilityLimit: 10000,
      exec,
    });
    expect(res.exceedsMaxLiability).toBe(false);
    expect(res.currentLiability).toBe(2000);
    expect(res.remainingCapacity).toBe(8000);
  });

  it('skips when matchId or limit missing', async () => {
    const res = await assertPersistedMatchLiabilityCapacity({
      matchId: null,
      stake: 100,
      odds: 2,
      maxLiabilityLimit: 10000,
    });
    expect(res.skipped).toBe(true);
  });
});
