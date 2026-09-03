import { describe, it, expect } from 'vitest';
import { teamsMatch, resolveMatchSquads } from '../../src/utils/matchSquads.js';

describe('teamsMatch — women / unmarked titles', () => {
  it('matches England to England Women (admin bet titles drop Women)', () => {
    expect(teamsMatch('England', 'England Women')).toBe(true);
    expect(teamsMatch('Ireland Women', 'Ireland')).toBe(true);
  });

  it('does not fuzzy-match Gujarat Women onto Gujarat Titans', () => {
    expect(teamsMatch('Gujarat Women (V)', 'Gujarat Titans')).toBe(false);
    expect(teamsMatch('Bengaluru Women (V)', 'Royal Challengers Bengaluru')).toBe(false);
  });

  it('still matches same-gender fuzzy names', () => {
    expect(teamsMatch('England Women', 'England Women Cricket')).toBe(true);
  });
});

describe('resolveMatchSquads — women scorecard onto unmarked teams', () => {
  it('builds lineups from scorecard when card says England vs Ireland', () => {
    const match = {
      team1: { name: 'England' },
      team2: { name: 'Ireland' },
      scorecardInnings: [
        {
          batTeamName: 'Ireland Women',
          batters: [
            { name: 'Gaby Lewis', runs: 6, balls: 13 },
            { name: 'Amy Hunter', runs: 1, balls: 2 },
          ],
          bowlers: [
            { name: 'Ryana MacDonald-Gay', role: 'Bowler', overs: 2, runs: 9, wickets: 0 },
          ],
        },
      ],
    };
    const squads = resolveMatchSquads(match, 'England', 'Ireland');
    const names = [
      ...(squads.team1.players || []).map((p) => p.name),
      ...(squads.team2.players || []).map((p) => p.name),
    ];
    expect(names).toEqual(expect.arrayContaining(['Gaby Lewis', 'Amy Hunter', 'Ryana MacDonald-Gay']));
    expect(names.join(' ')).not.toMatch(/Root|Stokes|Crawley/i);
  });

  it('falls back to liveDetails crease when no squads/scorecard', () => {
    const match = {
      team1: { name: 'England Women' },
      team2: { name: 'Ireland Women' },
      liveDetails: {
        chaseTeamName: 'England Women',
        batter1: { name: 'Gaby Lewis', runs: 6, balls: 13 },
        batter2: { name: 'Amy Hunter', runs: 1, balls: 2 },
        bowler: { name: 'Ryana MacDonald-Gay', overs: 2, wickets: 0, runs: 9 },
      },
    };
    const squads = resolveMatchSquads(match, 'England Women', 'Ireland Women');
    expect(squads.team1.players.map((p) => p.name)).toEqual(
      expect.arrayContaining(['Gaby Lewis', 'Amy Hunter']),
    );
    expect(squads.team2.players.map((p) => p.name)).toContain('Ryana MacDonald-Gay');
  });
});
