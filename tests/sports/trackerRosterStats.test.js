import { describe, expect, it } from 'vitest';
import { isPlaceholderPlayerName, parseLivePlayersFromCommentary } from '../../src/utils/cricketPlayers.js';
import { enrichLivePlayersFromScorecard } from '../../src/utils/scorecardLivePlayers.js';
import { mergeCricketLiveDetails } from '../../src/utils/cricketScoreMerge.js';
import { mergeFieldStateWithInnings } from '../../src/hooks/useLiveFieldState.js';
import { resolveCricketTeamScores } from '../../src/utils/cricketScores.js';
import { getChaseText } from '../../src/utils/liveMatchWidgetData.js';

describe('tracker roster stats', () => {
  it('treats team-plus-role labels as placeholders', () => {
    expect(isPlaceholderPlayerName('FC Germania Gustavsburg Opener')).toBe(true);
    expect(isPlaceholderPlayerName('Darmstadt Sultans Bowler')).toBe(true);
    expect(isPlaceholderPlayerName('Virat Kohli')).toBe(false);
  });

  it('copies scorecard batter stats onto empty live slots', () => {
    const ld = enrichLivePlayersFromScorecard(
      { batter1: { name: 'FC Germania Gustavsburg Opener', runs: 0, balls: 0 } },
      [{
        inningsId: 2,
        batTeamName: 'FC Germania Gustavsburg',
        batters: [
          { name: 'Jonas Weber', runs: 18, balls: 11, fours: 2, sixes: 1, notOut: true },
          { name: 'Paul Klein', runs: 9, balls: 8, fours: 1, sixes: 0, notOut: true },
        ],
      }],
    );
    expect(ld.batter1.name).toBe('Jonas Weber');
    expect(ld.batter1.runs).toBe(18);
    expect(ld.batter2.runs).toBe(9);
  });

  it('does not let a 0-stat poll wipe a richer batter line', () => {
    const merged = mergeCricketLiveDetails(
      { batter1: { name: 'Jonas Weber', runs: 18, balls: 11 } },
      { batter1: { name: 'Jonas Weber', runs: 0, balls: 0 } },
    );
    expect(merged.batter1.runs).toBe(18);
    expect(merged.batter1.balls).toBe(11);
  });

  it('does not copy the batting score onto the bowling team in the first innings', () => {
    const match = {
      team1: { name: 'Pakistan (V)', runs: 55, wickets: 1 },
      team2: { name: 'New Zealand (V)', runs: 55, wickets: 1 },
      liveDetails: {
      inningsId: 2,
      commentary: 'First innings',
      runs: 55,
      wickets: 1,
      overs: '4.0',
      score1: 55,
      score2: 55,
      wickets1: 1,
      wickets2: 1,
      overs2: '4.0',
      firstRuns: 55,
      chaseRuns: 55,
      firstTeamName: 'Pakistan (V)',
    },
    };
    const scores = resolveCricketTeamScores(match, match.liveDetails);
    expect(scores.team1.runs).toBe(55);
    expect(scores.team1.wickets).toBe(1);
    expect(scores.team2.runs).toBe(0);
    expect(scores.team2.wickets).toBe(0);
    expect(getChaseText(match, { battingTeam: 'Pakistan (V)' }, 'Pakistan (V)', 'New Zealand (V)')).toBeNull();
  });

  it('maps innings-2 chase runs when firstRuns is missing', () => {
    const scores = resolveCricketTeamScores({
      team1: { name: 'Germany' },
      team2: { name: 'Portugal' },
    }, {
      inningsId: 2,
      firstTeamName: 'Germany',
      chaseTeamName: 'Portugal',
      firstRuns: 0,
      chaseRuns: 141,
      chaseWickets: 6,
      chaseOvers: '19.2',
      score2: 141,
      wickets2: 6,
      overs2: '19.2',
    });
    expect(scores.team1.runs).toBe(0);
    expect(scores.team2.runs).toBe(141);
    expect(scores.team2.wickets).toBe(6);
  });

  it('does not declare a chase win when the first innings total is missing', () => {
    const match = {
      team1: { name: 'Germany' },
      team2: { name: 'Portugal' },
      liveDetails: {
        inningsId: 2,
        firstTeamName: 'Germany',
        chaseTeamName: 'Portugal',
        firstRuns: 0,
        chaseRuns: 141,
        commentary: 'Portugal need 0 runs',
      },
    };
    const text = getChaseText(match, { battingTeam: 'Portugal' }, 'Germany', 'Portugal');
    expect(text).toBeNull();
  });

  it('does not treat country names in commentary as batters', () => {
    const parsed = parseLivePlayersFromCommentary(
      'Germany 0 (0) Portugal 141 (116) Kohli 53 (24)',
      ['Germany', 'Portugal'],
    );
    expect(parsed.batter1?.name).toBe('Kohli');
    expect(parsed.batter1?.runs).toBe(53);
  });

  it('seeds crease stats from the innings total when the feed has no batters', () => {
    const now = {
      id: 'ger-por',
      team1: { name: 'Germany' },
      team2: { name: 'Portugal' },
      liveDetails: {
        inningsId: 2,
        firstTeamName: 'Germany',
        chaseTeamName: 'Portugal',
        firstRuns: 0,
        chaseRuns: 141,
        chaseWickets: 6,
        chaseOvers: '19.2',
        score2: 141,
        wickets2: 6,
        overs2: '19.2',
      },
    };
    const api = {
      matchId: 'ger-por',
      batter1: { name: '', runs: 0, balls: 0, fours: 0, sixes: 0 },
      batter2: { name: '', runs: 0, balls: 0, fours: 0, sixes: 0 },
      bowler: '',
      overBalls: [],
    };
    const first = mergeFieldStateWithInnings(null, api, now);
    expect(first.batter1.runs + first.batter2.runs).toBeGreaterThan(0);
    expect(first.syncedRuns).toBe(141);
  });

  it('keeps tracker stats after the feed clears overs on a completed chase', () => {
    const match = {
      id: 'cb_169111',
      team1: { name: 'Outer Delhi Warriors', runs: 165, wickets: 10, overs: '20.0' },
      team2: { name: 'Purani Dilli 6', runs: 169, wickets: 3, overs: '18.2' },
      liveDetails: {
        inningsId: 2,
        overs: '0.0',
        commentary: 'Purani Dilli 6 won',
      },
    };
    const api = {
      matchId: 'cb_169111',
      batter1: { name: '', runs: 0, balls: 0, fours: 0, sixes: 0 },
      batter2: { name: '', runs: 0, balls: 0, fours: 0, sixes: 0 },
      bowler: '',
      overBalls: [],
    };
    const first = mergeFieldStateWithInnings(null, api, match);
    expect(first.syncedRuns).toBe(169);
    expect(first.batter1.runs + first.batter2.runs).toBeGreaterThan(0);
  });

  it('advances striker stats when the innings score moves and the feed has no players', () => {
    const match = {
      id: 'm1',
      team1: { name: 'Darmstadt Sultans' },
      team2: { name: 'FC Germania Gustavsburg' },
      liveDetails: {
        inningsId: 2,
        firstRuns: 162,
        firstWickets: 5,
        firstOvers: '10.0',
        chaseRuns: 31,
        chaseWickets: 1,
        chaseOvers: '3.3',
        score2: 31,
        wickets2: 1,
        overs2: '3.3',
      },
    };
    const api = {
      matchId: 'm1',
      batter1: { name: '', runs: 0, balls: 0, fours: 0, sixes: 0 },
      batter2: { name: '', runs: 0, balls: 0, fours: 0, sixes: 0 },
      bowler: '',
      strikerIdx: 0,
      inningsFours: 0,
      inningsSixes: 0,
      extras: 0,
      overBalls: [],
    };
    const first = mergeFieldStateWithInnings(null, api, match);
    expect(first.batter1.runs + first.batter2.runs).toBeGreaterThan(0);
    expect(first.syncedRuns).toBe(31);

    const nextMatch = {
      ...match,
      liveDetails: { ...match.liveDetails, chaseRuns: 35, score2: 35, chaseOvers: '3.5', overs2: '3.5' },
    };
    const second = mergeFieldStateWithInnings(first, api, nextMatch);
    expect(second.batter1.runs + second.batter2.runs).toBe(
      first.batter1.runs + first.batter2.runs + 4,
    );
    expect(second.batter1.balls + second.batter2.balls).toBe(
      first.batter1.balls + first.batter2.balls + 2,
    );
  });
});
