import { describe, expect, it } from 'vitest';
import { filterRewardsByWallet } from '../../src/utils/filterRewardsByWallet.js';

describe('filterRewardsByWallet', () => {
  const bonus500 = (id) => ({ rewardId: id, rewardType: 'bonus', amount: 500, title: 'Bonus ₹500' });

  it('hides bonus rewards when the bonus wallet is empty', () => {
    const rows = [bonus500('a'), bonus500('b'), bonus500('c')];
    expect(filterRewardsByWallet(rows, { bonus: 0, freebets: 0 })).toEqual([]);
  });

  it('offers only as many bonus instruments as the wallet can cover', () => {
    const rows = [bonus500('a'), bonus500('b'), bonus500('c')];
    const next = filterRewardsByWallet(rows, { bonus: 500, freebets: 0 });
    expect(next).toHaveLength(1);
    expect(next[0].rewardId).toBe('a');
  });

  it('keeps a freebet that matches the freebet wallet', () => {
    const rows = [{ rewardId: 'fb1', rewardType: 'freebet', amount: 100 }];
    expect(filterRewardsByWallet(rows, { bonus: 0, freebets: 100 })).toHaveLength(1);
    expect(filterRewardsByWallet(rows, { bonus: 0, freebets: 0 })).toHaveLength(0);
  });
});
