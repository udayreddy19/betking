import { describe, expect, it } from 'vitest';
import {
  getIplSrlDeskMatches,
  getIplSrlMatches,
  getIplSrlPointsTable,
  getIplSrlSeasonMatches,
  SRL_SEASON_MATCH_COUNT,
} from '../../lib/iplSrlSimulator.mjs';
import { SRL_LAUNCH_AT } from '../../lib/oddsyraSrlSeason.mjs';

describe('OddsYra SRL IPL season structure', () => {
  const now = SRL_LAUNCH_AT;

  it('has 74 matches: 70 league and 4 playoffs', () => {
    const season = getIplSrlSeasonMatches(now);
    expect(SRL_SEASON_MATCH_COUNT).toBe(74);
    expect(season).toHaveLength(74);
    expect(season.filter((m) => !m.playoff)).toHaveLength(70);
    expect(season.filter((m) => m.playoff)).toHaveLength(4);
    expect(season.slice(70).map((m) => m.stageLabel)).toEqual([
      'Qualifier 1',
      'Eliminator',
      'Qualifier 2',
      'Final',
    ]);
  });

  it('gives each team 14 league games', () => {
    const league = getIplSrlSeasonMatches(now).filter((m) => !m.playoff);
    const played = {};
    for (const match of league) {
      played[match.team1.key] = (played[match.team1.key] || 0) + 1;
      played[match.team2.key] = (played[match.team2.key] || 0) + 1;
    }
    expect(Object.keys(played)).toHaveLength(10);
    expect(Object.values(played).every((n) => n === 14)).toBe(true);
  });

  it('keeps playoff sides TBD until the league is finished', () => {
    const season = getIplSrlSeasonMatches(now);
    expect(season.slice(70).every((m) => m.team1.key === 'tbd' && m.teamsLocked === false)).toBe(true);
  });

  it('publishes a 10-row points table', () => {
    const table = getIplSrlPointsTable(now);
    expect(table).toHaveLength(10);
    expect(table.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(table.every((r) => r.played === 0 && r.points === 0)).toBe(true);
  });

  it('lists bettable league fixtures before launch without playoff placeholders', () => {
    const listed = getIplSrlMatches(SRL_LAUNCH_AT - 60_000);
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((m) => m.team1.key !== 'tbd')).toBe(true);
    expect(listed.every((m) => m.matchState === 'pre')).toBe(true);
  });

  it('fills Qualifier 1 from the table once the league is over', () => {
    const atLaunch = getIplSrlSeasonMatches(SRL_LAUNCH_AT);
    const afterLeague = atLaunch[69].endTime + 5_000;
    const q1 = getIplSrlSeasonMatches(afterLeague)[70];
    expect(q1.stageLabel).toBe('Qualifier 1');
    expect(q1.teamsLocked).toBe(true);
    expect(q1.team1.key).not.toBe('tbd');
    expect(q1.team2.key).not.toBe('tbd');
    expect(q1.team1.key).not.toBe(q1.team2.key);
  });

  it('exposes all 74 season matches on the admin desk', () => {
    const desk = getIplSrlDeskMatches(now);
    expect(desk).toHaveLength(74);
    expect(desk.filter((m) => !m.playoff)).toHaveLength(70);
    expect(desk[0].matchNo).toBe(1);
    expect(desk[69].matchNo).toBe(70);
    expect(desk[73].stageLabel).toBe('Final');
  });
});
