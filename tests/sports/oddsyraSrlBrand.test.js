import { describe, expect, it } from 'vitest';
import { IPL_SRL_LEAGUE, isIplSrlLeague, isIplSrlMatch } from '../../lib/iplSrlSimulator.mjs';

describe('admin OddsYra SRL branding', () => {
  it('uses OddsYra SRL as the admin-gated league name', () => {
    expect(IPL_SRL_LEAGUE).toBe('OddsYra SRL');
  });

  it('recognizes OddsYra SRL league keys', () => {
    expect(isIplSrlLeague('oddsyra-srl')).toBe(true);
    expect(isIplSrlLeague('OddsYra SRL')).toBe(true);
    expect(isIplSrlLeague('ipl-srl')).toBe(true);
  });

  it('only treats simulator matches as admin SRL', () => {
    expect(isIplSrlMatch({ id: 'srl_ipl_12', source: 'srl', league: 'OddsYra SRL' })).toBe(true);
    expect(isIplSrlMatch({
      id: '10cric_abc',
      source: '10cric2026',
      league: 'Indian Premier League SRL',
    })).toBe(false);
  });
});
