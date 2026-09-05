import { describe, it, expect } from 'vitest';
import {
  collectLiveMatchIdAliases,
  isLiveSettleMarketId,
} from '../../lib/adminDomainData.mjs';

describe('admin bet settlement filters', () => {
  it('collects live match id aliases from the live board', () => {
    const ids = collectLiveMatchIdAliases([
      {
        id: 'fc_4248672',
        isLive: true,
        matchState: 'in',
        fancodeMatchId: 4248672,
        tencricEventId: 'abc-123',
      },
      {
        id: 'fc_done',
        isLive: false,
        matchState: 'post',
        status: 'COMPLETED',
      },
    ]);
    expect(ids).toContain('fc_4248672');
    expect(ids).toContain('fancode_4248672');
    expect(ids).toContain('oy_abc-123');
    expect(ids).not.toContain('fc_done');
  });

  it('recognizes in-play markets that settle live', () => {
    expect(isLiveSettleMarketId('1_next_over_13_total')).toBe(true);
    expect(isLiveSettleMarketId('next_over_5_total')).toBe(true);
    expect(isLiveSettleMarketId('overs_0_10_total')).toBe(true);
    expect(isLiveSettleMarketId('match_winner')).toBe(false);
    expect(isLiveSettleMarketId('toss_winner')).toBe(false);
  });
});
