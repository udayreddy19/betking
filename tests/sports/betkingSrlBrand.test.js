import { describe, expect, it } from 'vitest';
import { IPL_SRL_LEAGUE, isIplSrlLeague, isIplSrlMatch } from '../../lib/iplSrlSimulator.mjs';

describe('admin BetKing SRL branding', () => {
  it('uses BetKing SRL as the admin-gated league name', () => {
    expect(IPL_SRL_LEAGUE).toBe('BetKing SRL');
  });

  it('recognizes BetKing SRL league keys', () => {
    expect(isIplSrlLeague('betking-srl')).toBe(true);
    expect(isIplSrlLeague('BetKing SRL')).toBe(true);
    expect(isIplSrlLeague('ipl-srl')).toBe(true);
  });

  it('only treats simulator matches as admin SRL', () => {
    expect(isIplSrlMatch({ id: 'srl_ipl_12', source: 'srl', league: 'BetKing SRL' })).toBe(true);
    expect(isIplSrlMatch({
      id: '10cric_abc',
      source: '10cric2026',
      league: 'Indian Premier League SRL',
    })).toBe(false);
  });
});
