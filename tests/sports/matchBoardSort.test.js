import { describe, it, expect } from 'vitest';
import { compareMatchesForSportsBoard, cricketBoardActivity } from '../../src/utils/matchFilters.js';
import { groupMatchesByLeague } from '../../src/utils/leagueNavigation.js';

function liveCricket(id, league, runs, wickets = 0) {
  return {
    id,
    sport: 'cricket',
    league,
    matchState: 'in',
    time: 'Live',
    team1: { name: 'A', runs, wickets },
    team2: { name: 'B', runs: 0, wickets: 0 },
    liveDetails: { runs, wickets, overs: runs > 0 ? '12.3' : '0.0' },
  };
}

describe('compareMatchesForSportsBoard', () => {
  it('puts scored live cricket ahead of 0/0 live cricket', () => {
    const zero = liveCricket('z', 'AAA League', 0);
    const scored = liveCricket('s', 'ZZZ League', 130, 6);
    const ordered = [zero, scored].sort((a, b) => compareMatchesForSportsBoard(a, b));
    expect(ordered.map((m) => m.id)).toEqual(['s', 'z']);
  });

  it('ranks higher totals ahead of smaller in-play scores', () => {
    const low = liveCricket('low', 'League', 80, 4);
    const high = liveCricket('high', 'League', 130, 6);
    const ordered = [low, high].sort((a, b) => compareMatchesForSportsBoard(a, b));
    expect(ordered.map((m) => m.id)).toEqual(['high', 'low']);
  });

  it('uses displayed ticker scores when the feed object is still 0/0', () => {
    const stale = liveCricket('stale', 'AAA League', 0);
    const other = liveCricket('other', 'BBB League', 0);
    const getScores = (match) => (
      match.id === 'stale'
        ? { team1Score: '80/4', team2Score: '0/0' }
        : { team1Score: '0/0', team2Score: '0/0' }
    );
    const ordered = [other, stale].sort((a, b) => compareMatchesForSportsBoard(a, b, getScores));
    expect(ordered.map((m) => m.id)).toEqual(['stale', 'other']);
  });
});

describe('groupMatchesByLeague score order', () => {
  it('lists leagues with real scores before 0/0 leagues', () => {
    const groups = groupMatchesByLeague([
      liveCricket('zero', 'Big Bash League SRL', 0),
      liveCricket('scored', 'Zebra Cup', 122, 10),
    ]);
    expect(groups.map((g) => g.league)).toEqual(['Zebra Cup', 'Big Bash League SRL']);
  });
});

describe('cricketBoardActivity', () => {
  it('treats 0/0 as not started', () => {
    expect(cricketBoardActivity(liveCricket('z', 'L', 0)).started).toBe(false);
  });
});
