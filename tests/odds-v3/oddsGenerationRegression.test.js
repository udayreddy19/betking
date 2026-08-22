import { describe, it, expect } from 'vitest';
import { buildCanonicalFromMatch } from '../../lib/odds-v3/buildCanonicalFromMatch.mjs';
import { validateMatchState } from '../../lib/odds-v3/validation/MatchStateValidator.mjs';
import { generate } from '../../lib/odds-v3/OddsEngineV3.mjs';
import { createCanonicalMatchState } from '../../lib/odds-v3/models/CanonicalMatchState.mjs';

describe('Odds generation regressions', () => {
  it('reads mid-chase overs from liveDetails.overs when chaseOvers/overs2 are missing', () => {
    const state = buildCanonicalFromMatch({
      id: 'cb_chase_overs',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      team1: { name: 'RCB', shortName: 'RCB' },
      team2: { name: 'PBKS', shortName: 'PBKS' },
      liveDetails: {
        inningsId: 2,
        firstRuns: 180,
        firstWickets: 6,
        firstOvers: '20.0',
        chaseRuns: 120,
        chaseWickets: 2,
        overs: '12.3',
        chaseTeamName: 'PBKS',
        firstTeamName: 'RCB',
      },
    });

    expect(state.currentInnings).toBe(2);
    expect(state.ballsCompleted).toBe(75);
    expect(state.ballsRemaining).toBe(45);
    expect(state.target).toBe(181);
    expect(state.runsRequired).toBe(61);

    const snap = generate(state, { winnerOnly: true });
    expect(snap.status).not.toBe('INVALID_STATE');
    const winner = snap.markets.find((m) => m.marketId === 'match_winner');
    expect(winner?.status).toBe('OPEN');
    expect(winner.selections.every((s) => Number.isFinite(s.odds) && s.odds > 1)).toBe(true);
  });

  it('parses Hundred ball-count overs like "64.0" as 64 balls not 320', () => {
    const state = buildCanonicalFromMatch({
      id: 'cb_hundred_balls',
      sport: 'cricket',
      league: 'The Hundred',
      isLive: true,
      matchState: 'in',
      team1: { name: 'Oval Invincibles', shortName: 'OVI' },
      team2: { name: 'Trent Rockets', shortName: 'TRT' },
      liveDetails: {
        inningsId: 1,
        firstRuns: 95,
        firstWickets: 3,
        overs: '64.0',
        firstTeamName: 'Oval Invincibles',
      },
    });

    expect(state.format).toBe('THE_HUNDRED');
    expect(state.ballsCompleted).toBe(64);
    expect(state.ballsRemaining).toBe(36);
    expect(state.status).toBe('LIVE');

    const snap = generate(state, { winnerOnly: true });
    expect(snap.status).not.toBe('DETERMINED');
    expect(snap.status).not.toBe('INVALID_STATE');
    const winner = snap.markets.find((m) => m.marketId === 'match_winner');
    expect(winner?.status).toBe('OPEN');
    expect(winner.selections.every((s) => Number.isFinite(s.odds) && s.odds > 1)).toBe(true);
  });

  it('does not swap South Africa vs South Australia on fuzzy slice match', () => {
    const state = buildCanonicalFromMatch({
      id: 'cb_south_clash',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      team1: { name: 'South Africa', shortName: 'SA' },
      team2: { name: 'South Australia', shortName: 'SOA' },
      liveDetails: {
        inningsId: 1,
        firstRuns: 120,
        firstWickets: 2,
        overs: '15.0',
        firstTeamName: 'South Africa',
      },
    });

    expect(state.team1.runs).toBe(120);
    expect(state.team1.balls).toBe(90);
    expect(state.battingTeamId).toBe('SA');
    expect(state.ballsCompleted).toBe(90);
  });

  it('determines chase won when batting side overshoots the target', () => {
    const state = createCanonicalMatchState({
      matchId: 'surplus_chase',
      sport: 'CRICKET',
      format: 'T20',
      status: 'LIVE',
      team1: { id: 'RCB', name: 'RCB', runs: 140, wickets: 5, balls: 120 },
      team2: { id: 'PBKS', name: 'PBKS', runs: 146, wickets: 3, balls: 110 },
      currentInnings: 2,
      battingTeamId: 'PBKS',
      bowlingTeamId: 'RCB',
      target: 141,
      runsRequired: 0,
      ballsPerInnings: 120,
      ballsCompleted: 110,
      ballsRemaining: 10,
      providerTimestamp: Date.now(),
      stateVersion: 1,
    });

    const validation = validateMatchState(state);
    expect(validation.valid).toBe(true);
    expect(validation.determined).toBe(true);
    expect(validation.winnerId).toBe('PBKS');

    const snap = generate(state);
    expect(snap.status).toBe('DETERMINED');
    const winner = snap.markets[0];
    expect(winner.status).toBe('SETTLED');
    expect(winner.selections.every((s) => s.odds == null && s.bettable === false)).toBe(true);
    expect(winner.selections.every((s) => s.odds !== Infinity)).toBe(true);
  });

  it('determines chase lost when required runs exceed max possible', () => {
    const state = createCanonicalMatchState({
      matchId: 'impossible_chase',
      sport: 'CRICKET',
      format: 'T20',
      status: 'LIVE',
      team1: { id: 'RCB', name: 'RCB', runs: 200, wickets: 4, balls: 120 },
      team2: { id: 'PBKS', name: 'PBKS', runs: 110, wickets: 6, balls: 115 },
      currentInnings: 2,
      battingTeamId: 'PBKS',
      bowlingTeamId: 'RCB',
      target: 201,
      runsRequired: 91,
      ballsPerInnings: 120,
      ballsCompleted: 115,
      ballsRemaining: 5,
      providerTimestamp: Date.now(),
      stateVersion: 1,
    });

    const validation = validateMatchState(state);
    expect(validation.valid).toBe(true);
    expect(validation.determined).toBe(true);
    expect(validation.winnerId).toBe('RCB');
  });

  it('omits wicket-in-current-over when the over has just finished', () => {
    const state = createCanonicalMatchState({
      matchId: 'over_boundary',
      sport: 'CRICKET',
      format: 'T20',
      status: 'LIVE',
      team1: { id: 'RCB', name: 'RCB', runs: 45, wickets: 1, balls: 36 },
      team2: { id: 'PBKS', name: 'PBKS', runs: 0, wickets: 0, balls: 0 },
      currentInnings: 1,
      battingTeamId: 'RCB',
      bowlingTeamId: 'PBKS',
      target: null,
      runsRequired: null,
      ballsPerInnings: 120,
      ballsCompleted: 36,
      ballsRemaining: 84,
      providerTimestamp: Date.now(),
      stateVersion: 1,
    });

    const snap = generate(state);
    expect(snap.markets.some((m) => /wicket_in_over_/i.test(m.marketId || ''))).toBe(false);
    expect(snap.markets.some((m) => /wicket_in_next_over_/i.test(m.marketId || ''))).toBe(true);
  });

  it('when team2 batted first without chaseTeamName, team1 is the chasing side', () => {
    const state = buildCanonicalFromMatch({
      id: 'cb_team2_first',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      team1: { name: 'Mumbai Indians', shortName: 'MI' },
      team2: { name: 'Chennai Super Kings', shortName: 'CSK' },
      liveDetails: {
        inningsId: 2,
        firstRuns: 180,
        firstWickets: 5,
        firstOvers: '20.0',
        firstTeamName: 'Chennai Super Kings',
        chaseRuns: 50,
        chaseWickets: 1,
        overs: '8.0',
      },
    });

    expect(state.battingTeamId).toBe('MI');
    expect(state.bowlingTeamId).toBe('CSK');
    expect(state.target).toBe(181);
    expect(state.runsRequired).toBe(131);
    expect(state.ballsCompleted).toBe(48);

    const snap = generate(state, { winnerOnly: true });
    expect(snap.status).not.toBe('DETERMINED');
    const winner = snap.markets.find((m) => m.marketId === 'match_winner');
    expect(winner?.status).toBe('OPEN');
  });

  it('detects chase start at 0.0 when chaseTeamName is set without inningsId', () => {
    const state = buildCanonicalFromMatch({
      id: 'cb_chase_start',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      team1: { name: 'RCB', shortName: 'RCB' },
      team2: { name: 'PBKS', shortName: 'PBKS' },
      liveDetails: {
        firstRuns: 165,
        firstWickets: 6,
        firstOvers: '20.0',
        firstTeamName: 'RCB',
        chaseRuns: 0,
        chaseWickets: 0,
        chaseOvers: '0.0',
        chaseTeamName: 'PBKS',
      },
    });

    expect(state.currentInnings).toBe(2);
    expect(state.battingTeamId).toBe('PBKS');
    expect(state.target).toBe(166);
    expect(state.runsRequired).toBe(166);
    expect(state.ballsCompleted).toBe(0);
  });

  it('does not invent first-innings total from liveDetails.runs mid-chase', () => {
    const state = buildCanonicalFromMatch({
      id: 'cb_no_invent_first',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      team1: { name: 'RCB', shortName: 'RCB' },
      team2: { name: 'PBKS', shortName: 'PBKS' },
      liveDetails: {
        inningsId: 2,
        chaseRuns: 140,
        chaseWickets: 3,
        overs: '15.0',
        runs: 140,
        chaseTeamName: 'PBKS',
        firstTeamName: 'RCB',
        // firstRuns intentionally missing
      },
    });

    // Without a real first-innings total, do not set target from chase runs
    expect(state.team1.runs).toBe(0);
    expect(state.team2.runs).toBe(140);
    expect(state.target).toBeNull();
    expect(state.runsRequired).toBeNull();

    const snap = generate(state, { winnerOnly: true });
    expect(snap.status).not.toBe('DETERMINED');
  });

  it('does not false-settle when team.runs are innings-slot ordered after firstTeamName remap', () => {
    const state = buildCanonicalFromMatch({
      id: 'cb_slot_override',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      team1: { name: 'Mumbai Indians', shortName: 'MI', runs: 180, wickets: 5 },
      team2: { name: 'Chennai Super Kings', shortName: 'CSK', runs: 50, wickets: 1 },
      liveDetails: {
        inningsId: 2,
        firstRuns: 180,
        firstWickets: 5,
        firstOvers: '20.0',
        firstTeamName: 'Chennai Super Kings',
        chaseRuns: 50,
        chaseWickets: 1,
        overs: '8.0',
        chaseTeamName: 'Mumbai Indians',
      },
    });

    expect(state.battingTeamId).toBe('MI');
    expect(state.team1.runs).toBe(50);
    expect(state.team2.runs).toBe(180);
    expect(state.target).toBe(181);
    expect(state.runsRequired).toBe(131);

    const snap = generate(state, { winnerOnly: true });
    expect(snap.status).not.toBe('DETERMINED');
  });

  it('handles unlabeled team-aligned scores when team2 batted first', () => {
    const state = buildCanonicalFromMatch({
      id: 'crex_team2_first',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      team1: { name: 'MI', shortName: 'MI', runs: 50, wickets: 1, overs: '8.0' },
      team2: { name: 'CSK', shortName: 'CSK', runs: 180, wickets: 5, overs: '20.0' },
      liveDetails: {
        score1: 50,
        score2: 180,
        wickets1: 1,
        wickets2: 5,
        overs: '8.0',
        overs2: '20.0',
      },
    });

    expect(state.currentInnings).toBe(2);
    expect(state.battingTeamId).toBe('MI');
    expect(state.target).toBe(181);
    expect(state.runsRequired).toBe(131);

    const snap = generate(state, { winnerOnly: true });
    expect(snap.status).not.toBe('DETERMINED');
  });

  it('remaps innings-slot scores when only chaseTeamName says team1 is chasing', () => {
    const state = buildCanonicalFromMatch({
      id: 'cb_chase_only_label',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      team1: { name: 'Mumbai Indians', shortName: 'MI' },
      team2: { name: 'Chennai Super Kings', shortName: 'CSK' },
      liveDetails: {
        inningsId: 2,
        firstRuns: 180,
        firstWickets: 5,
        firstOvers: '20.0',
        chaseRuns: 50,
        chaseWickets: 1,
        overs: '8.0',
        chaseTeamName: 'Mumbai Indians',
        // firstTeamName intentionally missing
      },
    });

    expect(state.battingTeamId).toBe('MI');
    expect(state.team1.runs).toBe(50);
    expect(state.team2.runs).toBe(180);
    expect(state.target).toBe(181);
    expect(state.runsRequired).toBe(131);

    const snap = generate(state, { winnerOnly: true });
    expect(snap.status).not.toBe('DETERMINED');
  });

  it('does not mark live match completed from noisy commentary', async () => {
    const { isCricketMatchCompleted } = await import('../../src/utils/cricketMatchComplete.js');
    const base = {
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      team1: { name: 'RCB', runs: 100 },
      team2: { name: 'PBKS', runs: 180 },
      liveDetails: {
        inningsId: 2,
        firstRuns: 180,
        chaseRuns: 100,
        chaseTeamName: 'RCB',
        firstTeamName: 'PBKS',
      },
    };
    expect(isCricketMatchCompleted({
      ...base,
      liveDetails: { ...base.liveDetails, commentary: 'Kohli won the race back to the crease' },
    })).toBe(false);
    expect(isCricketMatchCompleted({
      ...base,
      liveDetails: { ...base.liveDetails, commentary: 'PBKS have won the review' },
    })).toBe(false);
    expect(isCricketMatchCompleted({
      ...base,
      liveDetails: { ...base.liveDetails, commentary: 'That delivery beat the bat' },
    })).toBe(false);
    expect(isCricketMatchCompleted({
      ...base,
      liveDetails: { ...base.liveDetails, runsRequired: 0 },
    })).toBe(false);
  });

  it('settles COMPLETED all-out tie as PUSH not empty markets', () => {
    const tied = createCanonicalMatchState({
      matchId: 'tie_completed',
      sport: 'CRICKET',
      format: 'T20',
      status: 'COMPLETED',
      team1: { id: 'RCB', name: 'RCB', runs: 150, wickets: 5, balls: 120 },
      team2: { id: 'PBKS', name: 'PBKS', runs: 150, wickets: 10, balls: 120 },
      currentInnings: 2,
      battingTeamId: 'PBKS',
      bowlingTeamId: 'RCB',
      target: 151,
      runsRequired: 1,
      ballsPerInnings: 120,
      ballsCompleted: 120,
      ballsRemaining: 0,
      providerTimestamp: Date.now(),
      stateVersion: 1,
    });
    const snap = generate(tied);
    expect(snap.status).toBe('DETERMINED');
    expect(snap.markets).toHaveLength(1);
    expect(snap.markets[0].selections.every((s) => s.status === 'PUSH' && s.odds == null)).toBe(true);
  });

  it('does not settle a live Test when the follow-on side passes first-innings runs', () => {
    const state = buildCanonicalFromMatch({
      id: 'test_followon',
      sport: 'cricket',
      league: 'Test Series India vs England',
      matchType: 'TEST',
      isLive: true,
      matchState: 'in',
      team1: { name: 'India', shortName: 'IND' },
      team2: { name: 'England', shortName: 'ENG' },
      liveDetails: {
        inningsId: 2,
        firstRuns: 350,
        firstWickets: 10,
        firstOvers: '95.0',
        firstTeamName: 'India',
        chaseRuns: 351,
        chaseWickets: 4,
        overs: '90.0',
        chaseTeamName: 'England',
      },
    });

    expect(state.format).toBe('TEST');
    expect(state.target).toBeNull();
    expect(state.status).toBe('LIVE');

    const snap = generate(state, { winnerOnly: true });
    expect(snap.status).not.toBe('DETERMINED');
    const winner = snap.markets.find((m) => m.marketId === 'match_winner');
    expect(winner?.status).not.toBe('SETTLED');
  });

  it('does not settle a live Test at the 450-ball cap', () => {
    const state = buildCanonicalFromMatch({
      id: 'test_long_innings',
      sport: 'cricket',
      league: 'Test Series',
      matchType: 'TEST',
      isLive: true,
      matchState: 'in',
      team1: { name: 'India', shortName: 'IND' },
      team2: { name: 'England', shortName: 'ENG' },
      liveDetails: {
        inningsId: 2,
        firstRuns: 450,
        firstWickets: 10,
        firstOvers: '120.0',
        firstTeamName: 'India',
        chaseRuns: 280,
        chaseWickets: 4,
        overs: '90.0',
        chaseTeamName: 'England',
      },
    });

    expect(state.format).toBe('TEST');
    expect(state.ballsRemaining).toBeGreaterThan(0);
    const snap = generate(state, { winnerOnly: true });
    expect(snap.status).not.toBe('DETERMINED');
  });

  it('does not treat "second slip" commentary as second innings', () => {
    const state = buildCanonicalFromMatch({
      id: 't20_second_slip',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      team1: { name: 'RCB', shortName: 'RCB' },
      team2: { name: 'PBKS', shortName: 'PBKS' },
      liveDetails: {
        inningsId: 1,
        runs: 80,
        wickets: 2,
        overs: '10.0',
        commentary: 'caught at second slip',
      },
    });

    expect(state.currentInnings).toBe(1);
    expect(state.target).toBeNull();
    const snap = generate(state, { winnerOnly: true });
    expect(snap.status).not.toBe('INVALID_STATE');
  });

  it('does not complete a live Test 4th innings just for passing 1st-innings total', async () => {
    const { isCricketMatchCompleted } = await import('../../src/utils/cricketMatchComplete.js');
    const match = {
      id: 'test_4th_innings',
      sport: 'cricket',
      league: 'Test Series',
      matchType: 'TEST',
      isLive: true,
      matchState: 'in',
      team1: { name: 'India', shortName: 'IND' },
      team2: { name: 'England', shortName: 'ENG' },
      liveDetails: {
        inningsId: 4,
        firstRuns: 350,
        chaseRuns: 351,
        chaseWickets: 4,
        overs: '90.0',
        firstTeamName: 'India',
        chaseTeamName: 'England',
      },
    };
    expect(isCricketMatchCompleted(match)).toBe(false);
    const state = buildCanonicalFromMatch(match);
    expect(state.status).toBe('LIVE');
    expect(generate(state, { winnerOnly: true }).status).not.toBe('DETERMINED');
  });

  it('does not treat fielder "chase" commentary as second innings without inningsId', () => {
    const state = buildCanonicalFromMatch({
      id: 't20_fielder_chase',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      team1: { name: 'RCB', shortName: 'RCB', runs: 80, wickets: 2 },
      team2: { name: 'PBKS', shortName: 'PBKS', runs: 0, wickets: 0 },
      liveDetails: {
        // no inningsId (CREX-style)
        runs: 80,
        wickets: 2,
        overs: '10.0',
        commentary: 'good chase from the fielder',
      },
    });

    expect(state.currentInnings).toBe(1);
    expect(state.target).toBeNull();
    const snap = generate(state, { winnerOnly: true });
    expect(snap.status).not.toBe('INVALID_STATE');
    expect(snap.status).not.toBe('DETERMINED');
  });

  it('does not false-settle chase start from stale first-innings chaseBallNbr', () => {
    const state = buildCanonicalFromMatch({
      id: 'chase_start_stale_balls',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      team1: { name: 'RCB', shortName: 'RCB' },
      team2: { name: 'PBKS', shortName: 'PBKS' },
      liveDetails: {
        inningsId: 2,
        firstRuns: 180,
        firstWickets: 6,
        firstOvers: '20.0',
        firstTeamName: 'RCB',
        chaseRuns: 0,
        chaseWickets: 0,
        chaseOvers: '0.0',
        chaseTeamName: 'PBKS',
        // Stale leftover from end of first innings
        chaseBallNbr: 120,
        overs: '20.0',
      },
    });

    expect(state.currentInnings).toBe(2);
    expect(state.ballsCompleted).toBe(0);
    expect(state.ballsRemaining).toBe(120);
    expect(state.target).toBe(181);
    expect(state.runsRequired).toBe(181);

    const snap = generate(state, { winnerOnly: true });
    expect(snap.status).not.toBe('DETERMINED');
    const winner = snap.markets.find((m) => m.marketId === 'match_winner');
    expect(winner?.status).toBe('OPEN');
  });

  it('does not false-settle chase start when chaseOvers missing and overs is still first inns', () => {
    const state = buildCanonicalFromMatch({
      id: 'chase_start_stale_overs',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      team1: { name: 'RCB', shortName: 'RCB' },
      team2: { name: 'PBKS', shortName: 'PBKS' },
      liveDetails: {
        inningsId: 2,
        firstRuns: 180,
        firstWickets: 6,
        firstOvers: '20.0',
        firstTeamName: 'RCB',
        chaseRuns: 0,
        chaseWickets: 0,
        chaseTeamName: 'PBKS',
        // No chaseOvers — leftover first-innings overs must not exhaust the chase
        overs: '20.0',
      },
    });

    expect(state.ballsCompleted).toBe(0);
    expect(state.ballsRemaining).toBe(120);
    expect(state.status).toBe('LIVE');

    const snap = generate(state, { winnerOnly: true });
    expect(snap.status).not.toBe('DETERMINED');
    expect(snap.markets.find((m) => m.marketId === 'match_winner')?.status).toBe('OPEN');
  });

  it('keeps Portugal batting first — does not offer Spain 1st dismissal after a wicket', () => {
    const match = {
      id: '10cric_spain_portugal',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      matchFormat: 'T20',
      team1: { name: 'Spain', shortName: 'SPAI', runs: 0, wickets: 0 },
      team2: { name: 'Portugal', shortName: 'PORT', runs: 73, wickets: 1 },
      liveDetails: {
        runs: 73,
        wickets: 1,
        overs: '9.1',
        // Away batting first often lands in score2 — must NOT flip to chase
        score2: 73,
        wickets2: 1,
        overs2: '0.0',
        firstRuns: 73,
        firstWickets: 1,
        firstOvers: '9.1',
        firstTeamName: 'Portugal',
        inningsId: 1,
        // Leaked chase clock from merge noise
        chaseOvers: '0.0',
        commentary: 'First innings',
      },
    };

    const state = buildCanonicalFromMatch(match);
    expect(state.currentInnings).toBe(1);
    expect(state.battingTeamId).toBe('PORT');
    expect(state.team2.wickets).toBe(1);
    expect(state.team1.runs).toBe(0);

    const snap = generate(state);
    const dismissal = (snap.markets || []).filter((m) => /dismissal/i.test(m.marketId || m.name || ''));
    expect(dismissal.some((m) => /Spain/i.test(m.name))).toBe(false);
    expect(dismissal.some((m) => /1st Dismissal/i.test(m.name))).toBe(false);
    const next = dismissal.find((m) => m.marketId === 'i1_team_score_at_2_dismissal' || m.marketId === 'team_score_at_2_dismissal');
    expect(next).toBeTruthy();
    expect(next.name).toMatch(/Portugal Total at 2nd Dismissal/i);
    expect(next.status).toBe('OPEN');
  });

  it('infers away batting first when firstTeamName is missing', () => {
    const state = buildCanonicalFromMatch({
      id: 'unlabeled_away_first',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      matchFormat: 'T20',
      team1: { name: 'Spain', shortName: 'SPAI', runs: 0, wickets: 0 },
      team2: { name: 'Portugal', shortName: 'PORT', runs: 55, wickets: 2 },
      liveDetails: {
        runs: 55,
        wickets: 2,
        overs: '7.2',
        score2: 55,
        wickets2: 2,
        overs2: '0.0',
        firstRuns: 55,
        firstWickets: 2,
        firstOvers: '7.2',
        inningsId: 1,
        commentary: 'First innings',
      },
    });
    expect(state.currentInnings).toBe(1);
    expect(state.battingTeamId).toBe('PORT');
    expect(state.team2.wickets).toBe(2);

    const snap = generate(state);
    const dismissal = (snap.markets || []).find((m) => m.marketId === 'i1_team_score_at_3_dismissal' || m.marketId === 'team_score_at_3_dismissal');
    expect(dismissal?.name).toMatch(/Portugal Total at 3rd Dismissal/i);
    expect((snap.markets || []).some((m) => /1st Dismissal/i.test(m.name))).toBe(false);
  });

  it('offers Next Over (1) at start of innings, not Next Over (2)', () => {
    const state = buildCanonicalFromMatch({
      id: 'next_over_start',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      matchFormat: 'T20',
      team1: { name: 'India', shortName: 'IND', runs: 0, wickets: 0 },
      team2: { name: 'Australia', shortName: 'AUS', runs: 0, wickets: 0 },
      liveDetails: {
        runs: 0,
        wickets: 0,
        overs: '0.0',
        firstRuns: 0,
        firstWickets: 0,
        firstOvers: '0.0',
        firstTeamName: 'India',
        inningsId: 1,
      },
    });
    expect(state.ballsCompleted).toBe(0);
    const snap = generate(state);
    const nextOver = (snap.markets || []).find((m) => /next_over_\d+_total$/i.test(m.marketId || ''));
    expect(nextOver?.marketId).toMatch(/^(?:i1_)?next_over_1_total$/);
    expect(nextOver?.name).toMatch(/Next Over \(1\)/);
  });

  it('suspends overs_0_5 once 5 overs are complete', () => {
    const state = buildCanonicalFromMatch({
      id: 'pp_done',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      matchFormat: 'T20',
      team1: { name: 'India', shortName: 'IND', runs: 48, wickets: 1 },
      team2: { name: 'Australia', shortName: 'AUS', runs: 0, wickets: 0 },
      liveDetails: {
        runs: 48,
        wickets: 1,
        overs: '5.0',
        firstRuns: 48,
        firstWickets: 1,
        firstOvers: '5.0',
        firstTeamName: 'India',
        inningsId: 1,
      },
    });
    expect(state.ballsCompleted).toBe(30);
    const snap = generate(state);
    const pp = (snap.markets || []).find((m) => m.marketId === 'i1_overs_0_5_total' || m.marketId === 'overs_0_5_total');
    // Filtered out when ineligible, or suspended
    expect(!pp || pp.status === 'SUSPENDED').toBe(true);
  });

  it('does not treat unlabeled overs2 alone as chase', () => {
    const state = buildCanonicalFromMatch({
      id: 'overs2_away_first',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      matchFormat: 'T20',
      team1: { name: 'Spain', shortName: 'SPAI', runs: 0, wickets: 0 },
      team2: { name: 'Portugal', shortName: 'PORT', runs: 40, wickets: 1 },
      liveDetails: {
        runs: 40,
        wickets: 1,
        overs: '5.2',
        score2: 40,
        wickets2: 1,
        overs2: '5.2',
        firstRuns: 40,
        firstWickets: 1,
        firstOvers: '5.2',
        firstTeamName: 'Portugal',
        // inningsId missing — must not flip on overs2
      },
    });
    expect(state.currentInnings).toBe(1);
    expect(state.battingTeamId).toBe('PORT');
  });

  it('scopes overs_0_N market ids by innings so chase does not reopen 1st-innings id', () => {
    const first = buildCanonicalFromMatch({
      id: 'scope_pp',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      matchFormat: 'T20',
      team1: { name: 'India', shortName: 'IND', runs: 20, wickets: 0 },
      team2: { name: 'Aus', shortName: 'AUS', runs: 0, wickets: 0 },
      liveDetails: {
        runs: 20, wickets: 0, overs: '2.3', firstRuns: 20, firstWickets: 0,
        firstOvers: '2.3', firstTeamName: 'India', inningsId: 1,
      },
    });
    const snap1 = generate(first);
    expect((snap1.markets || []).some((m) => m.marketId === 'i1_overs_0_5_total')).toBe(true);
    expect((snap1.markets || []).some((m) => m.marketId === 'overs_0_5_total')).toBe(false);

    const chase = buildCanonicalFromMatch({
      id: 'scope_pp',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      matchFormat: 'T20',
      team1: { name: 'India', shortName: 'IND', runs: 160, wickets: 6 },
      team2: { name: 'Aus', shortName: 'AUS', runs: 12, wickets: 0 },
      liveDetails: {
        inningsId: 2,
        firstRuns: 160, firstWickets: 6, firstOvers: '20.0', firstTeamName: 'India',
        chaseRuns: 12, chaseWickets: 0, chaseOvers: '1.2', chaseTeamName: 'Aus',
      },
    });
    const snap2 = generate(chase);
    expect((snap2.markets || []).some((m) => m.marketId === 'i2_overs_0_5_total')).toBe(true);
    expect((snap2.markets || []).some((m) => m.marketId === 'i1_overs_0_5_total')).toBe(false);
  });

  it('line-scopes team_total selection ids so bumped lines cannot cash out old bets', async () => {
    const { findQuotedSelection } = await import('../../lib/odds-v3/bookIntegrity.mjs');
    const snap = {
      markets: [{
        marketId: 'team_total',
        status: 'OPEN',
        line: 143.5,
        selections: [
          { selectionId: 'sel_over_143.5', name: 'Over 143.5', odds: 1.9, bettable: true },
          { selectionId: 'sel_under_143.5', name: 'Under 143.5', odds: 1.9, bettable: true },
        ],
      }],
    };
    expect(() => findQuotedSelection(snap, 'team_total', 'sel_under', {
      selectionName: 'Under 100.5',
      acceptedLine: 100.5,
    })).toThrow(/MARKET_ALREADY_DETERMINED/);

    const ok = findQuotedSelection(snap, 'team_total', 'sel_under_143.5', {
      selectionName: 'Under 143.5',
      acceptedLine: 143.5,
    });
    expect(ok?.odds).toBe(1.9);
  });

  it('caps Team / Match Total Runs in second innings (chase) instead of removing them', () => {
    const state = buildCanonicalFromMatch({
      id: 'leic_glam',
      sport: 'cricket',
      isLive: true,
      matchState: 'in',
      matchFormat: 'TEST',
      team1: { name: 'Leicestershire', shortName: 'LEIC', runs: 151, wickets: 10 },
      team2: { name: 'Glamorgan', shortName: 'GLAM', runs: 97, wickets: 6 },
      liveDetails: {
        inningsId: 2,
        firstRuns: 151,
        firstWickets: 10,
        firstOvers: '45.0',
        firstTeamName: 'Leicestershire',
        chaseRuns: 97,
        chaseWickets: 6,
        chaseOvers: '30.0',
        chaseTeamName: 'Glamorgan',
        commentary: '1st Day · Second innings',
      },
    });
    expect(state.currentInnings).toBe(2);
    expect(state.battingTeamId).toBe('GLAM');

    const snap = generate(state);
    expect((snap.markets || []).some((m) => m.marketId === 'team_total' && m.status === 'OPEN')).toBe(true);
    expect((snap.markets || []).some((m) => m.marketId === 'match_total' && m.status === 'OPEN')).toBe(true);
    const teamTotal = snap.markets.find((m) => m.marketId === 'team_total' && m.status === 'OPEN');
    const matchTotal = snap.markets.find((m) => m.marketId === 'match_total' && m.status === 'OPEN');
    expect(teamTotal?.line).toBeDefined();
    expect(matchTotal?.line).toBeDefined();
    if (state.target != null) {
      expect(teamTotal.line).toBeLessThanOrEqual(state.target + 2.5);
      expect(matchTotal.line).toBeLessThanOrEqual((state.team1?.runs || 0) + (state.team2?.runs || 0) + state.target + 2.5);
    }
    expect((snap.markets || []).some((m) => /^team_total_alt_/i.test(m.marketId || '') && m.status === 'OPEN')).toBe(false);
  });
});
