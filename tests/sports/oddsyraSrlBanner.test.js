import { describe, expect, it } from 'vitest';
import { applySrlStakeRows } from '../../lib/iplSrlAdminControl.mjs';
import { getSrlHomeBanner, isSrlSeasonLive, SRL_LAUNCH_AT, SRL_LAUNCH_LABEL } from '../../src/data/oddsyraSrlSeason.js';
import { getIplSrlMatches } from '../../lib/iplSrlSimulator.mjs';

describe('OddsYra SRL home banner', () => {
  it(`announces ${SRL_LAUNCH_LABEL} before launch`, () => {
    const copy = getSrlHomeBanner(SRL_LAUNCH_AT - 1);
    expect(isSrlSeasonLive(SRL_LAUNCH_AT - 1)).toBe(false);
    expect(copy.title).toMatch(new RegExp(`begins ${SRL_LAUNCH_LABEL}`, 'i'));
  });

  it(`says the season is live after ${SRL_LAUNCH_LABEL}`, () => {
    const copy = getSrlHomeBanner(SRL_LAUNCH_AT);
    expect(isSrlSeasonLive(SRL_LAUNCH_AT)).toBe(true);
    expect(copy.title).toMatch(/is live/i);
    expect(copy.subtitle).toMatch(SRL_LAUNCH_LABEL);
  });
});

describe('OddsYra SRL clock starts 10 September', () => {
  it('keeps fixtures upcoming before the season epoch', () => {
    const listed = getIplSrlMatches(SRL_LAUNCH_AT - 60_000);
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((m) => m.matchState === 'pre')).toBe(true);
    expect(listed[0].startTime).toBeGreaterThanOrEqual(SRL_LAUNCH_AT);
  });
});

describe('SRL admin stake book', () => {
  it('splits open stakes onto home and away for winner declaration', () => {
    const matches = [{
      matchId: 'srl_ipl_1',
      homeTeamId: 'pbks',
      homeShort: 'PBKS',
      homeTeam: 'Punjab Kings OddsYra SRL',
      awayTeamId: 'mi',
      awayShort: 'MI',
      awayTeam: 'Mumbai Indians OddsYra SRL',
    }];
    const [row] = applySrlStakeRows(matches, [
      { match_id: 'srl_ipl_1', selection_id: '1', stake: 400, payout: 720, bets: 4 },
      { match_id: 'srl_ipl_1', selection_id: 'mi', stake: 150, payout: 285, bets: 2 },
      { match_id: 'srl_ipl_1', selection_id: 'next_over', stake: 20, payout: 40, bets: 1 },
    ]);
    expect(row.book.home.stake).toBe(400);
    expect(row.book.away.stake).toBe(150);
    expect(row.book.other.stake).toBe(20);
    expect(row.book.heavier).toBe('home');
    expect(row.book.totalStake).toBe(570);
  });
});
