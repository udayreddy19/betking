import { describe, it, expect } from 'vitest';
import { generate } from '../../lib/odds-v3/OddsEngineV3.mjs';
import { generateOtherSportsSnapshot } from '../../lib/odds-v3/otherSportsOdds.mjs';
import { betRiskEngine } from '../../lib/betRiskEngine.mjs';
import { calculateMatchWinnerProbability } from '../../lib/odds-v3/pricing/ProbabilityModel.mjs';
import { applyMargin } from '../../lib/odds-v3/pricing/MarginCalculator.mjs';
import { recordPrediction, recordSettledOutcome, calculateCalibrationMetrics } from '../../lib/odds-v3/calibration/calibrationEngine.mjs';

describe('OddsEngineV3 — Phase 13: Production Runtime Wiring & Verification', () => {
  it('Soccer: otherSportsOdds generates Dixon-Coles 1X2, BTTS, and Totals without provider odds', () => {
    const soccerMatch = {
      id: 'soc_live_101',
      matchId: 'soc_live_101',
      sport: 'soccer',
      status: 'LIVE',
      isLive: true,
      team1: { name: 'Arsenal' },
      team2: { name: 'Chelsea' },
      score1: 1,
      score2: 0,
      liveDetails: { minute: 55, score1: 1, score2: 0 },
    };

    const snapshot = generateOtherSportsSnapshot(soccerMatch);
    expect(snapshot.status).toBe('OK');
    expect(snapshot.markets.length).toBeGreaterThan(0);

    const winnerMkt = snapshot.markets.find((m) => m.marketId === 'match_winner');
    expect(winnerMkt).toBeDefined();
    expect(winnerMkt.status).toBe('OPEN');
    expect(winnerMkt.selections.length).toBe(3); // 1, X, 2

    // Arsenal leading 1-0 in 55th min should have higher win probability (lower odds) than Chelsea
    const arsenal = winnerMkt.selections.find((s) => s.selectionId === '1');
    const chelsea = winnerMkt.selections.find((s) => s.selectionId === '2');
    expect(arsenal.odds).toBeLessThan(chelsea.odds);

    const bttsMkt = snapshot.markets.find((m) => m.marketId === 'btts');
    expect(bttsMkt).toBeDefined();
    expect(bttsMkt.status).toBe('OPEN');
  });

  it('Tennis: otherSportsOdds generates Markov model match winner odds', () => {
    const tennisMatch = {
      id: 'ten_live_202',
      matchId: 'ten_live_202',
      sport: 'tennis',
      status: 'LIVE',
      isLive: true,
      team1: { name: 'Alcaraz' },
      team2: { name: 'Sinner' },
      score1: 4,
      score2: 2,
      liveDetails: { sets1: 1, sets2: 0, score1: 4, score2: 2 },
    };

    const snapshot = generateOtherSportsSnapshot(tennisMatch);
    expect(snapshot.status).toBe('OK');
    const winnerMkt = snapshot.markets.find((m) => m.marketId === 'match_winner');
    expect(winnerMkt).toBeDefined();
    expect(winnerMkt.status).toBe('OPEN');

    const alcaraz = winnerMkt.selections.find((s) => s.selectionId === '1');
    const sinner = winnerMkt.selections.find((s) => s.selectionId === '2');
    expect(alcaraz.odds).toBeLessThan(sinner.odds);
  });

  it('Basketball: otherSportsOdds generates Pace-model moneyline odds', () => {
    const bbMatch = {
      id: 'bb_live_303',
      matchId: 'bb_live_303',
      sport: 'basketball',
      status: 'LIVE',
      isLive: true,
      team1: { name: 'Lakers' },
      team2: { name: 'Celtics' },
      score1: 85,
      score2: 70,
      liveDetails: { minute: 36, score1: 85, score2: 70 },
    };

    const snapshot = generateOtherSportsSnapshot(bbMatch);
    expect(snapshot.status).toBe('OK');
    const winnerMkt = snapshot.markets.find((m) => m.marketId === 'match_winner');
    expect(winnerMkt).toBeDefined();

    const lakers = winnerMkt.selections.find((s) => s.selectionId === '1');
    const celtics = winnerMkt.selections.find((s) => s.selectionId === '2');
    expect(lakers.odds).toBeLessThan(celtics.odds);
  });

  it('SGP Accumulator: betRiskEngine applies Gaussian Copula correlation for same-match selections', () => {
    const accumulatorSelections = [
      { matchId: 'm_csk_mi', marketId: 'match_winner', selectionId: 'CSK', odds: 1.50 },
      { matchId: 'm_csk_mi', marketId: 'team_total', selectionId: 'CSK_OVER', odds: 1.60 },
    ];

    const payout = betRiskEngine.calculateAccumulatorPayout(100, accumulatorSelections);
    expect(payout.stake).toBe(100);
    // Correlated SGP odds will be lower than naive 1.50 * 1.60 = 2.40 to protect the house
    expect(payout.combinedOdds).toBeLessThan(2.40);
    expect(payout.potentialPayout).toBeLessThan(240);
  });

  it('SGP Accumulator: betRiskEngine rejects contradictory mutually exclusive same-match selections', () => {
    const contradictorySelections = [
      { matchId: 'm_csk_mi', marketId: 'match_winner', selectionId: 'CSK', odds: 1.50 },
      { matchId: 'm_csk_mi', marketId: 'match_winner', selectionId: 'MI', odds: 2.60 },
    ];

    expect(() => {
      betRiskEngine.calculateAccumulatorPayout(100, contradictorySelections);
    }).toThrow('INVALID_SGP_BET');
  });

  it('Cricket Early-Overs CRR Smoothing: prevents probability spikes during overs 0 to 3', () => {
    // 1 ball bowled, 0 runs scored in chase of 180 (target 181)
    const prob1Ball = calculateMatchWinnerProbability({
      runsRequired: 181,
      ballsRemaining: 119,
      wicketsRemaining: 10,
      ballsCompleted: 1,
      ballsPerInnings: 120,
      target: 181,
      chasingScore: 0,
      format: 'T20',
      chasingTeamId: 'T2',
      fieldingTeamId: 'T1',
    });

    // 6 balls bowled, 4 runs scored
    const prob6Balls = calculateMatchWinnerProbability({
      runsRequired: 177,
      ballsRemaining: 114,
      wicketsRemaining: 10,
      ballsCompleted: 6,
      ballsPerInnings: 120,
      target: 181,
      chasingScore: 4,
      format: 'T20',
      chasingTeamId: 'T2',
      fieldingTeamId: 'T1',
    });

    expect(prob1Ball.pChase).toBeGreaterThan(0.20);
    expect(prob1Ball.pChase).toBeLessThan(0.70);
    expect(prob6Balls.pChase).toBeGreaterThan(0.20);
    expect(prob6Balls.pChase).toBeLessThan(0.70);
  });

  it('Dynamic Margin: applyMargin adjusts overround under high volatility or latency', () => {
    const base = applyMargin(0.50, 0.05);
    const dynamic = applyMargin(0.50, 0.05, { isLive: true, volatilityScore: 0.95 });

    expect(base.odds).toBeGreaterThanOrEqual(1.90);
    expect(dynamic.margin).toBeGreaterThanOrEqual(0.05);
  });

  it('Calibration Hook: settlement updates populate Brier score tracking', () => {
    const eventId = `p13_calib_${Date.now()}`;
    recordPrediction({
      eventId,
      sport: 'soccer',
      marketId: 'match_winner',
      selectionId: '1',
      predictedProbability: 0.75,
      odds: 1.33,
      modelVersion: 'dixon_coles_v1',
    });

    recordSettledOutcome({
      eventId,
      marketId: 'match_winner',
      selectionId: '1',
      won: true,
    });

    const metrics = calculateCalibrationMetrics({ sport: 'soccer', modelVersion: 'dixon_coles_v1' });
    expect(metrics.sampleSize).toBeGreaterThan(0);
  });
});
