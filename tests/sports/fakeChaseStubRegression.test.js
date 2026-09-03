/**
 * Regression: incomplete first innings must not invent chase "0/W @ 0.0" / need N.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveCricketTeamScores,
  isCricketSecondInnings,
  looksLikeFakeChaseStub,
  formatCricketInlineScore,
} from '../../src/utils/cricketScores.js';
import { mergeCricketLiveDetails } from '../../src/utils/cricketScoreMerge.js';
import { normalizeMatch } from '../../src/utils/cricketMatchNormalizer.js';

const engIre = {
  id: 'eng_ire_odi',
  sport: 'cricket',
  isLive: true,
  matchState: 'in',
  team1: { name: 'England' },
  team2: { name: 'Ireland' },
};

describe('fake chase stub — England vs Ireland mid first innings', () => {
  const corruptLd = {
    inningsId: 2,
    firstRuns: 36,
    firstWickets: 2,
    firstOvers: '12.3',
    firstTeamName: 'Ireland',
    chaseRuns: 0,
    chaseWickets: 2, // leaked
    chaseOvers: '0.0',
    chaseTeamName: 'England',
    score2: 36,
    wickets2: 2,
  };

  it('detects fake chase stub', () => {
    expect(looksLikeFakeChaseStub(corruptLd)).toBe(true);
  });

  it('does not treat as second innings', () => {
    expect(isCricketSecondInnings(engIre, corruptLd)).toBe(false);
  });

  it('normalizeMatch stays on first innings only (no 0/2 chase board)', () => {
    const n = normalizeMatch({ ...engIre, liveDetails: corruptLd });
    expect(n.innings.length).toBe(1);
    expect(n.currentInnings.number).toBe(1);
    const scores = resolveCricketTeamScores(engIre, corruptLd);
    const line = formatCricketInlineScore(engIre, corruptLd);
    expect(line).not.toMatch(/^0\/2/);
    expect(String(line)).not.toContain('0/2 : 36/2');
    // Ireland's 36/2 should appear; England should not show 2 wickets at 0.0
    expect(scores.team2.runs === 36 || scores.team1.runs === 36).toBe(true);
    const eng = scores.team1.name?.includes('England') ? scores.team1 : scores.team2;
    if (eng.runs === 0) {
      expect(eng.wickets).toBe(0);
    }
  });

  it('merge clears sticky false chase from a bad previous tick', () => {
    const prev = {
      inningsId: 2,
      chaseRuns: 0,
      chaseWickets: 2,
      chaseOvers: '0.0',
      firstRuns: 36,
      firstWickets: 2,
      firstOvers: '12.3',
      wickets2: 2,
      score2: 36,
    };
    const next = {
      inningsId: 1,
      firstRuns: 38,
      firstWickets: 2,
      firstOvers: '13.1',
      firstTeamName: 'Ireland',
      score2: 38,
      wickets2: 2,
      overs2: '13.1',
    };
    const merged = mergeCricketLiveDetails(prev, next, engIre);
    expect(isCricketSecondInnings(engIre, merged)).toBe(false);
    expect(Number(merged.chaseWickets || 0)).toBe(0);
    expect(Number(merged.firstRuns)).toBeGreaterThanOrEqual(36);
  });

  it('allows genuine chase start 0/0 at 0.0 after first innings complete', () => {
    const realChase = {
      inningsId: 2,
      firstRuns: 248,
      firstWickets: 10,
      firstOvers: '49.5',
      firstTeamName: 'Ireland',
      chaseRuns: 0,
      chaseWickets: 0,
      chaseOvers: '0.0',
      chaseTeamName: 'England',
    };
    expect(looksLikeFakeChaseStub(realChase)).toBe(false);
    expect(isCricketSecondInnings(engIre, realChase)).toBe(true);
  });
});
