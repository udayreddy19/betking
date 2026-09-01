import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertEmergencyAllows,
  clearEmergenciesForTests,
  setEmergencyForTests,
} from '../../lib/emergencyState.mjs';
import { isKillSwitchActive } from '../../lib/incidentEngine.mjs';
import { quoteBetCashout } from '../../lib/cashoutEngine.mjs';

describe('Platform emergency kill switches', () => {
  beforeEach(() => {
    clearEmergenciesForTests();
  });

  afterEach(() => {
    clearEmergenciesForTests();
  });

  it('blocks new bets when GLOBAL_BETTING_PAUSE is on', async () => {
    setEmergencyForTests('GLOBAL_BETTING_PAUSE', true);
    await expect(assertEmergencyAllows('bet')).rejects.toThrow(/MARKET_SUSPENDED/);
  });

  it('syncs in-memory kill switches from maintenance mode', async () => {
    setEmergencyForTests('MAINTENANCE_MODE', true);
    const { syncKillSwitchesFromTypes } = await import('../../lib/emergencyState.mjs');
    syncKillSwitchesFromTypes(new Set(['MAINTENANCE_MODE']));
    expect(isKillSwitchActive('STOP_NEW_BETS')).toBe(true);
    expect(isKillSwitchActive('STOP_CASHOUT')).toBe(true);
    await expect(assertEmergencyAllows('deposit')).rejects.toThrow(/SERVICE_PAUSED/);
    await expect(assertEmergencyAllows('withdrawal')).rejects.toThrow(/SERVICE_PAUSED/);
  });

  it('quotes cashout as unavailable when CASHOUT_PAUSE is on', async () => {
    setEmergencyForTests('CASHOUT_PAUSE', true);
    const quote = await quoteBetCashout({ betId: 'bet_missing', userId: 'usr_missing' });
    expect(quote.available).toBe(false);
    expect(String(quote.reason)).toMatch(/CASHOUT_PAUSE|SERVICE_PAUSED/);
  });
});
