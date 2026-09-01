import { describe, it, expect, beforeEach } from 'vitest';
import { responsibleGamingEngine } from '../../lib/responsibleGaming.mjs';
import { stakeLimitEngine } from '../../lib/stakeLimitEngine.mjs';

describe('responsible gaming unlimited deposits and stakes', () => {
  const userId = 'usr_rg_limits_01';

  beforeEach(() => {
    responsibleGamingEngine.limitsMap.delete(userId);
    responsibleGamingEngine.userDepositsTodayMap.delete(userId);
  });

  it('allows a deposit above a stored daily limit', async () => {
    await responsibleGamingEngine.setLimits(userId, { depositLimitDaily: 5000 });
    const res = await responsibleGamingEngine.validateDepositAttempt(userId, 6000);
    expect(res.allowed).toBe(true);
  });

  it('allows a stake above a stored per-bet limit', async () => {
    await responsibleGamingEngine.setLimits(userId, { stakeLimitPerBet: 10000 });
    const res = await responsibleGamingEngine.validateBetPlacementAttempt(userId, 15000);
    expect(res.allowed).toBe(true);
  });

  it('still blocks deposits during cooling-off', async () => {
    await responsibleGamingEngine.setCoolingOff(userId, { hours: 24, reason: 'test' });
    const res = await responsibleGamingEngine.validateDepositAttempt(userId, 100);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('USER_IN_COOLING_OFF');
  });

  it('does not cap stake at the old ₹1 lakh max', () => {
    expect(stakeLimitEngine.validateStake(250000)).toBe(250000);
  });

  it('does not cache default limits when the user has no row', async () => {
    const first = await responsibleGamingEngine.getLimits('usr_rg_uncached');
    expect(first.depositLimitDaily).toBe(50000);
    expect(responsibleGamingEngine.limitsMap.has('usr_rg_uncached')).toBe(false);
  });
});
