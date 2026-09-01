import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getIplSrlMatches } from '../../lib/iplSrlSimulator.mjs';
import { resetAllSrlOperatorSessions } from '../../lib/iplSrlOperatorState.mjs';
import {
  getIPLSRLControlSnapshot,
  resetIPLSRLMatch,
  seekIPLSRLMatch,
} from '../../lib/iplSrlAdminControl.mjs';

describe('OddsYra SRL operator seek / reset', () => {
  beforeEach(() => {
    resetAllSrlOperatorSessions();
  });

  afterEach(() => {
    resetAllSrlOperatorSessions();
  });

  it('exposes clock metadata on the admin desk', () => {
    const desk = getIPLSRLControlSnapshot().matches[0];
    expect(desk.clock).toBeTruthy();
    expect(desk.clock.durationMs).toBeGreaterThan(0);
    expect(desk.clock.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(['pre', 'first', 'break', 'chase', 'done']).toContain(desk.clock.phase);
  });

  it('seeks a match to innings break and reset restores the published clock', () => {
    const match = getIplSrlMatches(Date.now())[0];
    const sought = seekIPLSRLMatch(match.id, { marker: 'innings_break', pause: true }, 'test');
    const row = sought.matches.find((m) => m.matchId === match.id);
    expect(row.clock.elapsedMs).toBeGreaterThan(0);
    expect(row.clockDriven).toBe(false);
    expect(['break', 'chase', 'first', 'done']).toContain(row.clock.phase);

    const reset = resetIPLSRLMatch(match.id, 'test');
    const restored = reset.matches.find((m) => m.matchId === match.id);
    expect(restored.clockDriven).toBe(true);
  });

  it('advances one over via marker', () => {
    const match = getIplSrlMatches(Date.now())[0];
    const before = getIPLSRLControlSnapshot().matches.find((m) => m.matchId === match.id);
    const after = seekIPLSRLMatch(match.id, { marker: 'over' }, 'test').matches.find((m) => m.matchId === match.id);
    expect(after.clock.elapsedMs).toBeGreaterThan(before.clock.elapsedMs);
  });
});
