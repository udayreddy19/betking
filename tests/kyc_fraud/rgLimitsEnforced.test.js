import { describe, it, expect, beforeEach } from 'vitest';
import { responsibleGamingEngine } from '../../lib/responsibleGaming.mjs';

describe('responsible gaming limit enforcement', () => {
  const userId = 'usr_rg_limits_01';

  beforeEach(() => {
    responsibleGamingEngine.limitsMap.delete(userId);
    responsibleGamingEngine.userDepositsTodayMap.delete(userId);
  });

  it('rejects a deposit above the daily limit', async () => {
    await responsibleGamingEngine.setLimits(userId, { depositLimitDaily: 5000 });
    const res = await responsibleGamingEngine.validateDepositAttempt(userId, 6000);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('DEPOSIT_LIMIT_EXCEEDED');
  });

  it('allows a deposit within the daily limit', async () => {
    await responsibleGamingEngine.setLimits(userId, { depositLimitDaily: 5000 });
    const res = await responsibleGamingEngine.validateDepositAttempt(userId, 4000);
    expect(res.allowed).toBe(true);
  });

  it('rejects a stake above the per-bet limit', async () => {
    await responsibleGamingEngine.setLimits(userId, { stakeLimitPerBet: 10000 });
    const res = await responsibleGamingEngine.validateBetPlacementAttempt(userId, 15000);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('STAKE_LIMIT_EXCEEDED');
  });

  it('does not cache default limits when the user has no row', async () => {
    const first = await responsibleGamingEngine.getLimits('usr_rg_uncached');
    expect(first.depositLimitDaily).toBe(50000);
    expect(responsibleGamingEngine.limitsMap.has('usr_rg_uncached')).toBe(false);
  });
});
