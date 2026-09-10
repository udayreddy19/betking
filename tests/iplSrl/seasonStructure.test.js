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

  const istDayKey = (ms) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));

  const istWeekday = (ms) => new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  }).format(new Date(ms));

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

  it('schedules 1 match on weekdays and 2 on weekends (IST)', () => {
    const league = getIplSrlSeasonMatches(now).filter((m) => !m.playoff);
    const byDay = {};
    for (const match of league) {
      const key = istDayKey(match.startTime);
      byDay[key] = byDay[key] || [];
      byDay[key].push(match);
    }
    for (const [day, matches] of Object.entries(byDay)) {
      const weekday = istWeekday(matches[0].startTime);
      const weekend = weekday === 'Sat' || weekday === 'Sun';
      if (weekend) {
        expect(matches.length, day).toBe(2);
      } else {
        expect(matches.length, day).toBe(1);
      }
    }
  });

  it('spreads franchises early — no team dominates the opening slate', () => {
    const league = getIplSrlSeasonMatches(now).filter((m) => !m.playoff).slice(0, 10);
    const counts = {};
    for (const match of league) {
      counts[match.team1.key] = (counts[match.team1.key] || 0) + 1;
      counts[match.team2.key] = (counts[match.team2.key] || 0) + 1;
    }
    expect(Math.max(...Object.values(counts))).toBeLessThanOrEqual(3);
    expect(counts.csk || 0).toBeLessThanOrEqual(3);
  });

  it('avoids the same franchise twice on a double-header day', () => {
    const league = getIplSrlSeasonMatches(now).filter((m) => !m.playoff);
    const byDay = {};
    for (const match of league) {
      const key = istDayKey(match.startTime);
      byDay[key] = byDay[key] || [];
      byDay[key].push(match);
    }
    for (const matches of Object.values(byDay)) {
      if (matches.length < 2) continue;
      const teams = new Set();
      for (const m of matches) {
        expect(teams.has(m.team1.key)).toBe(false);
        expect(teams.has(m.team2.key)).toBe(false);
        teams.add(m.team1.key);
        teams.add(m.team2.key);
      }
    }
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

  it('exposes recent completed fixtures on the public board for user history', () => {
    const season = getIplSrlSeasonMatches(SRL_LAUNCH_AT);
    const midSeason = season[11].endTime + 60_000;
    const listed = getIplSrlMatches(midSeason);
    const completed = listed.filter((m) => m.matchState === 'post');
    expect(completed.length).toBeGreaterThan(0);
    expect(completed.every((m) => m.isCompleted === true || m.time === 'Completed')).toBe(true);
    expect(completed.every((m) => m.liveDetails?.resultSummary || m.liveDetails?.commentary)).toBe(true);
    // Still includes upcoming / live window for betting.
    expect(listed.some((m) => m.matchState === 'pre' || m.matchState === 'in')).toBe(true);
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
