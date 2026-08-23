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
});
