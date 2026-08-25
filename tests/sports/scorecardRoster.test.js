import { describe, expect, it } from 'vitest';
import { buildScorecardInnings } from '../../src/utils/liveMatchWidgetData.js';
import { getRosterForTeam } from '../../src/data/cricketRosters.js';

describe('scorecard roster updates', () => {
  it('fills the batting scorecard from liveDetails when scorecardInnings is missing', () => {
    const match = {
      id: 'srl_mi_kkr',
      team1: { name: 'Mumbai Indians SRL' },
      team2: { name: 'Kolkata Knight Riders SRL' },
      liveDetails: {
        inningsId: 1,
        firstTeamName: 'Mumbai Indians SRL',
        batter1: { name: 'Rohit Sharma SRL', runs: 34, balls: 22, fours: 3, sixes: 1 },
        batter2: { name: 'Suryakumar Yadav SRL', runs: 18, balls: 12, fours: 1, sixes: 1 },
      },
    };
    const players = buildScorecardInnings(
      match,
      'Mumbai Indians SRL',
      { batters: [], bowlers: [] },
      null,
      true,
      'MISRL',
    );
    expect(players).toHaveLength(2);
    expect(players[0].name).toBe('Rohit Sharma SRL');
    expect(players[0].runs).toBe(34);
    expect(players[1].runs).toBe(18);
  });

  it('uses scorecardInnings batters from market-derived rows', () => {
    const match = {
      id: 'srl_mi_kkr',
      team1: { name: 'Mumbai Indians SRL' },
      team2: { name: 'Kolkata Knight Riders SRL' },
      scorecardInnings: [{
        inningsId: 1,
        batTeamName: 'Mumbai Indians SRL',
        batters: [
          { name: 'Ishan Kishan SRL', runs: 12, balls: 8, notOut: false, dismissal: 'c & b' },
          { name: 'Rohit Sharma SRL', runs: 40, balls: 28, notOut: true, dismissal: 'batting' },
          { name: 'Tilak Varma SRL', runs: 20, balls: 14, notOut: true, dismissal: 'batting' },
        ],
      }],
      liveDetails: {
        batter1: { name: 'Rohit Sharma SRL', runs: 42, balls: 29 },
        batter2: { name: 'Tilak Varma SRL', runs: 21, balls: 15 },
      },
    };
    const players = buildScorecardInnings(
      match,
      'Mumbai Indians SRL',
      null,
      null,
      true,
      'MISRL',
    );
    expect(players.length).toBeGreaterThanOrEqual(3);
    const rohit = players.find((p) => p.name === 'Rohit Sharma SRL');
    expect(rohit.runs).toBe(42);
  });

  it('falls back to fieldState crease when liveDetails has no names', () => {
    const match = {
      team1: { name: 'Mumbai Indians SRL' },
      team2: { name: 'Kolkata Knight Riders SRL' },
      liveDetails: { inningsId: 1 },
    };
    const fieldState = {
      batter1: { name: 'Hardik Pandya SRL', runs: 15, balls: 9, fours: 1, sixes: 1 },
      batter2: { name: 'Tim David SRL', runs: 8, balls: 5, fours: 0, sixes: 1 },
    };
    const players = buildScorecardInnings(
      match,
      'Mumbai Indians SRL',
      null,
      fieldState,
      true,
      'MISRL',
    );
    expect(players.map((p) => p.name)).toEqual(['Hardik Pandya SRL', 'Tim David SRL']);
  });
});

describe('women / virtual roster isolation', () => {
  it('does not map Bengaluru Women onto RCB men', () => {
    const roster = getRosterForTeam('Bengaluru Women (V)');
    expect(roster.batters).toEqual([]);
    expect(roster.batters.join(' ')).not.toMatch(/Kohli|du Plessis/i);
  });

  it('does not map Gujarat Women onto Gujarat Titans men', () => {
    const roster = getRosterForTeam('Gujarat Women (V)');
    expect(roster.batters).toEqual([]);
    expect(roster.batters.join(' ')).not.toMatch(/Gill|Miller/i);
  });

  it('still returns the RCB men XI for the IPL side', () => {
    expect(getRosterForTeam('Royal Challengers Bengaluru').batters[0]).toBe('Virat Kohli');
    expect(getRosterForTeam('RCB').batters[0]).toBe('Virat Kohli');
  });

  it('does not invent RCB names on a Gujarat Women scorecard', () => {
    const players = buildScorecardInnings(
      {
        team1: { name: 'Bengaluru Women (V)' },
        team2: { name: 'Gujarat Women (V)' },
        liveDetails: {},
      },
      'Gujarat Women (V)',
      getRosterForTeam('Gujarat Women (V)'),
      null,
      true,
      'GUJ',
    );
    expect(players).toEqual([]);
  });
});
