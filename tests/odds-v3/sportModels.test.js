import { describe, it, expect } from 'vitest';
import { calculateScoreMatrix } from '../../lib/odds-v3/models/soccerDixonColesModel.mjs';
import { calculateTennisMatchProb, calculateGameWinProb } from '../../lib/odds-v3/models/tennisMarkovModel.mjs';
import { calculateBasketballProbabilities } from '../../lib/odds-v3/models/basketballPaceModel.mjs';

describe('OddsEngineV3 — P1: Sport Parametric Models', () => {
  it('Soccer: computes coherent 1X2, Over/Under, and BTTS probabilities', () => {
    const soccer = calculateScoreMatrix({
      homeExpectedGoals: 1.6,
      awayExpectedGoals: 1.1,
      minute: 0,
    });

    expect(soccer.modelVersion).toBe('dixon_coles_v1');
    expect(soccer.pHomeWin).toBeGreaterThan(soccer.pAwayWin);
    const sum1X2 = soccer.pHomeWin + soccer.pDraw + soccer.pAwayWin;
    expect(Math.abs(sum1X2 - 1.0)).toBeLessThan(0.01);
    expect(Math.abs(soccer.pOver25 + soccer.pUnder25 - 1.0)).toBeLessThan(0.01);
    expect(Math.abs(soccer.pBttsYes + soccer.pBttsNo - 1.0)).toBeLessThan(0.01);
  });

  it('Tennis: computes point-to-game equity and match probability', () => {
    const pGame40_0 = calculateGameWinProb(0.65, 3, 0);
    expect(pGame40_0).toBeGreaterThan(0.95);

    const match = calculateTennisMatchProb({
      pServeA: 0.68,
      pServeB: 0.60,
      setsA: 1,
      setsB: 0,
    });

    expect(match.modelVersion).toBe('tennis_markov_v1');
    expect(match.pWinA).toBeGreaterThan(match.pWinB);
    expect(Math.abs(match.pWinA + match.pWinB - 1.0)).toBeLessThan(0.001);
  });

  it('Basketball: computes score projections and moneyline probabilities', () => {
    const bb = calculateBasketballProbabilities({
      homeOffensiveRating: 115,
      awayOffensiveRating: 108,
      currentHomeScore: 60,
      currentAwayScore: 50,
      minute: 24,
    });

    expect(bb.modelVersion).toBe('basketball_pace_v1');
    expect(bb.expectedHomeScore).toBeGreaterThan(bb.expectedAwayScore);
    expect(bb.pHomeWin).toBeGreaterThan(0.70);
    expect(Math.abs(bb.pHomeWin + bb.pAwayWin - 1.0)).toBeLessThan(0.001);
    
    const ou = bb.calculateOverUnderProb(220.5);
    expect(ou.pOver + ou.pUnder).toBe(1.0);
  });
});
