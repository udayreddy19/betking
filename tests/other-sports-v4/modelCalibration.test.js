import { describe, it, expect } from 'vitest';
import { calculateScoreMatrix } from '../../lib/other-sports-v4/models/soccerDixonColes.mjs';
import { calculateBasketballProbabilities } from '../../lib/other-sports-v4/models/basketballPace.mjs';
import { calculateTennisMatchProb } from '../../lib/other-sports-v4/models/tennisMarkov.mjs';
import { calculateAmericanFootballProbabilities } from '../../lib/other-sports-v4/models/americanFootballDrive.mjs';
import { calculateBaseballProbabilities } from '../../lib/other-sports-v4/models/baseballModel.mjs';
import { calculateIceHockeyProbabilities } from '../../lib/other-sports-v4/models/iceHockeyModel.mjs';

describe('Dixon-Coles Soccer Model', () => {
  it('probabilities sum to ~1.0', () => {
    const m = calculateScoreMatrix();
    const sum = m.pHomeWin + m.pDraw + m.pAwayWin;
    expect(sum).toBeGreaterThan(0.97);
    expect(sum).toBeLessThan(1.03);
  });

  it('home advantage → pHomeWin > pAwayWin by default', () => {
    const m = calculateScoreMatrix();
    expect(m.pHomeWin).toBeGreaterThan(m.pAwayWin);
  });

  it('red card reduces scoring for affected team', () => {
    const normal = calculateScoreMatrix();
    const withRed = calculateScoreMatrix({ homeRedCards: 1 });
    expect(withRed.pHomeWin).toBeLessThan(normal.pHomeWin);
    expect(withRed.pAwayWin).toBeGreaterThan(normal.pAwayWin);
  });

  it('provider-implied probabilities calibrate xG', () => {
    // Strong home favorite
    const strong = calculateScoreMatrix({ providerImpliedHome: 0.6, providerImpliedAway: 0.15 });
    // Evenly matched
    const even = calculateScoreMatrix({ providerImpliedHome: 0.35, providerImpliedAway: 0.35 });
    expect(strong.pHomeWin).toBeGreaterThan(even.pHomeWin);
  });

  it('time decay: 80th minute → probabilities shift toward current score', () => {
    const early = calculateScoreMatrix({ currentHomeScore: 1, currentAwayScore: 0, minute: 10 });
    const late = calculateScoreMatrix({ currentHomeScore: 1, currentAwayScore: 0, minute: 80 });
    // Late in the game with 1-0, home win probability should be higher
    expect(late.pHomeWin).toBeGreaterThan(early.pHomeWin);
  });

  it('pOver25 is between 0 and 1', () => {
    const m = calculateScoreMatrix();
    expect(m.pOver25).toBeGreaterThan(0);
    expect(m.pOver25).toBeLessThan(1);
  });
});

describe('Basketball Pace Model', () => {
  it('probabilities sum to 1.0', () => {
    const bb = calculateBasketballProbabilities();
    expect(bb.pHomeWin + bb.pAwayWin).toBeCloseTo(1, 4);
  });

  it('home advantage when home offensive rating is higher', () => {
    const bb = calculateBasketballProbabilities({ homeOffensiveRating: 115, awayOffensiveRating: 105 });
    expect(bb.pHomeWin).toBeGreaterThan(bb.pAwayWin);
  });

  it('score differential affects probability direction', () => {
    const leading = calculateBasketballProbabilities({ currentHomeScore: 90, currentAwayScore: 70, minute: 35 });
    const trailing = calculateBasketballProbabilities({ currentHomeScore: 70, currentAwayScore: 90, minute: 35 });
    expect(leading.pHomeWin).toBeGreaterThan(trailing.pHomeWin);
  });

  it('spread cover probability is between 0 and 1', () => {
    const bb = calculateBasketballProbabilities();
    const cover = bb.calculateSpreadCoverProb(5.5, true);
    expect(cover.pHomeCover).toBeGreaterThan(0);
    expect(cover.pHomeCover).toBeLessThan(1);
    expect(cover.pHomeCover + cover.pAwayCover).toBeCloseTo(1, 4);
  });

  it('over/under probability is between 0 and 1', () => {
    const bb = calculateBasketballProbabilities();
    const ou = bb.calculateOverUnderProb(214.5);
    expect(ou.pOver).toBeGreaterThan(0);
    expect(ou.pOver).toBeLessThan(1);
    expect(ou.pOver + ou.pUnder).toBeCloseTo(1, 4);
  });
});

describe('Tennis Markov Model v2', () => {
  it('probabilities sum to 1.0', () => {
    const t = calculateTennisMatchProb();
    expect(t.pWinA + t.pWinB).toBeCloseTo(1, 4);
  });

  it('set lead → higher match probability', () => {
    const leading = calculateTennisMatchProb({ setsA: 1, setsB: 0 });
    const trailing = calculateTennisMatchProb({ setsA: 0, setsB: 1 });
    expect(leading.pWinA).toBeGreaterThan(trailing.pWinA);
  });

  it('completed match → 0.99 probability', () => {
    const won = calculateTennisMatchProb({ setsA: 2, setsB: 0, bestOfSets: 3 });
    expect(won.pWinA).toBe(0.99);
  });

  it('best-of-5 support works correctly', () => {
    const bo5 = calculateTennisMatchProb({ setsA: 2, setsB: 1, bestOfSets: 5 });
    expect(bo5.pWinA).toBeGreaterThan(0.4);
    expect(bo5.pWinA).toBeLessThan(0.99);
    expect(bo5.bestOfSets).toBe(5);
  });

  it('expectedGames is a positive number', () => {
    const t = calculateTennisMatchProb();
    expect(t.expectedGames).toBeGreaterThan(10);
  });

  it('provider calibration shifts probabilities', () => {
    const noProvider = calculateTennisMatchProb();
    const strongA = calculateTennisMatchProb({ providerImpliedA: 0.75 });
    expect(strongA.pWinA).toBeGreaterThan(noProvider.pWinA);
  });

  it('monotonicity: more sets won → higher probability', () => {
    const p00 = calculateTennisMatchProb({ setsA: 0, setsB: 0 });
    const p10 = calculateTennisMatchProb({ setsA: 1, setsB: 0 });
    expect(p10.pWinA).toBeGreaterThan(p00.pWinA);
  });
});

describe('American Football Drive Model', () => {
  it('probabilities sum to 1.0', () => {
    const af = calculateAmericanFootballProbabilities();
    expect(af.pHomeWin + af.pAwayWin).toBeCloseTo(1, 4);
  });

  it('score differential affects win probability', () => {
    const leading = calculateAmericanFootballProbabilities({ currentHomeScore: 21, currentAwayScore: 7, minute: 30 });
    const trailing = calculateAmericanFootballProbabilities({ currentHomeScore: 7, currentAwayScore: 21, minute: 30 });
    expect(leading.pHomeWin).toBeGreaterThan(trailing.pHomeWin);
  });

  it('over/under is between 0 and 1', () => {
    const af = calculateAmericanFootballProbabilities();
    const ou = af.calculateOverUnderProb(44.5);
    expect(ou.pOver + ou.pUnder).toBeCloseTo(1, 4);
  });
});

describe('Baseball Run-Expectancy Model', () => {
  it('probabilities sum to 1.0', () => {
    const bb = calculateBaseballProbabilities();
    expect(bb.pHomeWin + bb.pAwayWin).toBeCloseTo(1, 4);
  });

  it('home team advantage when home RPG is higher', () => {
    const bb = calculateBaseballProbabilities({ homeRpg: 5.5, awayRpg: 3.5 });
    expect(bb.pHomeWin).toBeGreaterThan(bb.pAwayWin);
  });

  it('inning progression reduces remaining variance', () => {
    const early = calculateBaseballProbabilities({ currentHomeScore: 3, currentAwayScore: 2, inning: 2 });
    const late = calculateBaseballProbabilities({ currentHomeScore: 3, currentAwayScore: 2, inning: 8 });
    // Late: leading team should have higher win probability
    expect(late.pHomeWin).toBeGreaterThan(early.pHomeWin);
  });

  it('spread cover probability is between 0 and 1', () => {
    const bb = calculateBaseballProbabilities();
    const cover = bb.calculateSpreadCoverProb(1.5, true);
    expect(cover.pHomeCover).toBeGreaterThan(0);
    expect(cover.pHomeCover).toBeLessThan(1);
  });
});

describe('Ice Hockey Poisson Model', () => {
  it('probabilities approximately sum to 1.0', () => {
    const hk = calculateIceHockeyProbabilities();
    const sum = hk.pHomeWin + hk.pDraw + hk.pAwayWin;
    // Should be very close to 1 but regulation draw is split into OT
    expect(hk.pHomeWin + hk.pAwayWin).toBeGreaterThan(0.95);
    expect(hk.pHomeWin + hk.pAwayWin).toBeLessThan(1.05);
  });

  it('regulation draw exists before OT split', () => {
    const hk = calculateIceHockeyProbabilities();
    expect(hk.pDraw).toBeGreaterThan(0);
    expect(hk.pDraw).toBeLessThan(0.4);
    expect(hk.pHomeRegWin).toBeDefined();
  });

  it('home advantage when home expected goals higher', () => {
    const hk = calculateIceHockeyProbabilities({ homeExpectedGoals: 3.5, awayExpectedGoals: 2.0 });
    expect(hk.pHomeWin).toBeGreaterThan(hk.pAwayWin);
  });

  it('over/under probability is between 0 and 1', () => {
    const hk = calculateIceHockeyProbabilities();
    const ou = hk.calculateOverUnderProb(5.5);
    expect(ou.pOver).toBeGreaterThan(0);
    expect(ou.pOver).toBeLessThan(1);
  });

  it('late game with score lead → higher win probability', () => {
    const leading = calculateIceHockeyProbabilities({ currentHomeScore: 3, currentAwayScore: 1, minute: 50 });
    const early = calculateIceHockeyProbabilities({ currentHomeScore: 3, currentAwayScore: 1, minute: 10 });
    expect(leading.pHomeWin).toBeGreaterThan(early.pHomeWin);
  });
});
