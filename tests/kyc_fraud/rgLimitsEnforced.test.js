import { describe, it, expect, beforeEach } from 'vitest';
import { responsibleGamingEngine } from '../../lib/responsibleGaming.mjs';
import { stakeLimitEngine } from '../../lib/stakeLimitEngine.mjs';
import { query } from '../../db/pg.js';

describe('responsible gaming deposit and stake limit enforcement', () => {
  const userId = 'usr_rg_limits_01';

  beforeEach(async () => {
    responsibleGamingEngine.limitsMap.delete(userId);
    responsibleGamingEngine.userDepositsTodayMap.delete(userId);
    await query(`DELETE FROM responsible_gaming_limits WHERE user_id = $1`, [userId]).catch(() => null);
  });

  it('rejects a deposit above a stored daily limit', async () => {
    await responsibleGamingEngine.setLimits(userId, { depositLimitDaily: 5000 });
    const res = await responsibleGamingEngine.validateDepositAttempt(userId, 6000);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('DEPOSIT_LIMIT_DAILY');
  });

  it('rejects a stake above a stored per-bet limit', async () => {
    await responsibleGamingEngine.setLimits(userId, { stakeLimitPerBet: 10000 });
    const res = await responsibleGamingEngine.validateBetPlacementAttempt(userId, 15000);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('STAKE_LIMIT_PER_BET');
  });

  it('still blocks deposits during cooling-off', async () => {
    await responsibleGamingEngine.setCoolingOff(userId, { hours: 24, reason: 'test' });
    const res = await responsibleGamingEngine.validateDepositAttempt(userId, 100);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('USER_IN_COOLING_OFF');
  });

  it('enforces the house global max stake', () => {
    expect(() => stakeLimitEngine.validateStake(250000)).toThrow(/STAKE_LIMIT_EXCEEDED/);
    expect(stakeLimitEngine.validateStake(1000)).toBe(1000);
  });

  it('does not cache default limits when the user has no row', async () => {
    const first = await responsibleGamingEngine.getLimits('usr_rg_uncached');
    expect(first.depositLimitDaily).toBe(50000);
    expect(responsibleGamingEngine.limitsMap.has('usr_rg_uncached')).toBe(false);
  });
});
