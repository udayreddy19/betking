import { describe, it, expect } from 'vitest';
import { findLiveMatch, matchIdsReferToSame, matchMatchesNameHint } from '../../src/utils/findLiveMatch.js';
import { matchIdsEqual, stripMatchIdPrefix } from '../../lib/matchIdPublic.mjs';

describe('findLiveMatch', () => {
  const matches = [
    {
      id: 'oy_abc-123',
      team1: { name: 'Australia' },
      team2: { name: 'Bangladesh' },
      league: 'Test Series Australia vs Bangladesh',
      cricbuzzMatchId: 148327,
    },
    {
      id: 'fc_4248299',
      team1: { name: 'Trinbago Knight Riders' },
      team2: { name: 'Antigua & Barbuda Falcons' },
      fancodeMatchId: 4248299,
    },
  ];

  it('finds by current public id', () => {
    expect(findLiveMatch(matches, { matchId: 'oy_abc-123' })?.id).toBe('oy_abc-123');
  });

  it('finds by cricbuzz alias when feed id is oy_', () => {
    expect(findLiveMatch(matches, { matchId: 'cb_148327' })?.id).toBe('oy_abc-123');
  });

  it('finds by team name hint when ids diverge', () => {
    expect(
      findLiveMatch(matches, {
        matchId: 'cb_999999',
        matchName: 'Australia vs Bangladesh',
      })?.id,
    ).toBe('oy_abc-123');
  });

  it('matches fc_ and fancode_ prefixes', () => {
    expect(stripMatchIdPrefix('fc_4248299')).toBe('4248299');
    expect(matchIdsEqual('fc_4248299', 'fancode_4248299')).toBe(true);
    expect(matchIdsReferToSame(matches[1], 'fancode_4248299')).toBe(true);
  });

  it('matches name hint with either team order', () => {
    expect(matchMatchesNameHint(matches[0], 'Bangladesh vs Australia')).toBe(true);
  });

  it('keeps the explicit id match even when a live name-hint twin exists', () => {
    const twins = [
      {
        id: 'oy_upcoming',
        team1: { name: 'Muscat Thunders' },
        team2: { name: 'IAS Invincibles' },
        league: 'SRL T20',
        isLive: false,
        matchState: 'pre',
      },
      {
        id: 'oy_live',
        team1: { name: 'Muscat Thunderers' },
        team2: { name: 'IAS Invincibles' },
        league: 'SRL T20',
        isLive: true,
        matchState: 'in',
        liveDetails: { runs: 94, wickets: 3 },
      },
    ];
    expect(findLiveMatch(twins, {
      matchId: 'oy_upcoming',
      matchName: 'Muscat Thunders vs IAS Invincibles',
    })?.id).toBe('oy_upcoming');
  });

  it('prefers the live scored listing when only a name hint is available', () => {
    const twins = [
      {
        id: 'oy_upcoming',
        team1: { name: 'Muscat Thunders' },
        team2: { name: 'IAS Invincibles' },
        league: 'SRL T20',
        isLive: false,
        matchState: 'pre',
      },
      {
        id: 'oy_live',
        team1: { name: 'Muscat Thunderers' },
        team2: { name: 'IAS Invincibles' },
        league: 'SRL T20',
        isLive: true,
        matchState: 'in',
        liveDetails: { runs: 94, wickets: 3 },
      },
    ];
    expect(findLiveMatch(twins, {
      matchId: 'missing_id',
      matchName: 'Muscat Thunders vs IAS Invincibles',
    })?.id).toBe('oy_live');
  });

  it('does not open a completed fixture via leftover teams hint when live id matches', () => {
    const board = [
      {
        id: 'srl_ipl_10',
        team1: { name: 'Delhi Capitals OddsYra SRL', shortName: 'DC' },
        team2: { name: 'Royal Challengers Bengaluru OddsYra SRL', shortName: 'RCB' },
        matchState: 'in',
        isLive: true,
        source: 'srl',
      },
      {
        id: 'srl_ipl_9',
        team1: { name: 'Punjab Kings OddsYra SRL', shortName: 'PBKS' },
        team2: { name: 'Rajasthan Royals OddsYra SRL', shortName: 'RR' },
        matchState: 'post',
        isLive: false,
        source: 'srl',
      },
    ];
    expect(findLiveMatch(board, {
      matchId: 'srl_ipl_10',
      matchName: 'Punjab Kings OddsYra SRL vs Rajasthan Royals OddsYra SRL',
    })?.id).toBe('srl_ipl_10');
  });

  it('does not treat SRL ids as equal to oy_/bare aliases', () => {
    expect(matchIdsEqual('srl_ipl_5', 'oy_ipl_5')).toBe(false);
    expect(matchIdsEqual('srl_ipl_5', 'ipl_5')).toBe(false);
    expect(matchIdsEqual('srl_ipl_5', 'srl_ipl_5')).toBe(true);
  });
});
