import { describe, it, expect } from 'vitest';
import { recordPrediction, recordSettledOutcome, calculateCalibrationMetrics } from '../../lib/odds-v3/calibration/calibrationEngine.mjs';
import { replayHistoricalOdds } from '../../lib/odds-v3/replay/historicalReplayEngine.mjs';

describe('OddsEngineV3 — P2: Calibration, Replay & Quality Monitoring', () => {
  it('records predictions and computes Brier score after settlement', () => {
    // Record sample batch of 6 predictions
    for (let i = 1; i <= 6; i++) {
      recordPrediction({
        eventId: `ev_${i}`,
        sport: 'cricket',
        marketId: 'match_winner',
        selectionId: `sel_${i}`,
        predictedProbability: 0.80,
        odds: 1.20,
      });
      // 5 out of 6 won
      recordSettledOutcome({
        eventId: `ev_${i}`,
        marketId: 'match_winner',
        selectionId: `sel_${i}`,
        won: i <= 5,
      });
    }

    const metrics = calculateCalibrationMetrics({ sport: 'cricket' });
    expect(metrics.sampleSize).toBeGreaterThanOrEqual(6);
    expect(metrics.brierScore).not.toBeNull();
    expect(metrics.brierScore).toBeGreaterThanOrEqual(0);
    expect(metrics.logLoss).not.toBeNull();
    expect(metrics.logLoss).toBeGreaterThanOrEqual(0);
  });

  it('Historical Replay: executes deterministic replay of match state', () => {
    const historicalMatch = {
      matchId: 'cb_test_match_101',
      sport: 'CRICKET',
      format: 'T20',
      status: 'LIVE',
      team1: { id: 'CSK', name: 'Chennai Super Kings', runs: 175, wickets: 6, balls: 120 },
      team2: { id: 'MI', name: 'Mumbai Indians', runs: 120, wickets: 3, balls: 84 },
      currentInnings: 2,
      battingTeamId: 'MI',
      bowlingTeamId: 'CSK',
      target: 176,
      runsRequired: 56,
      ballsPerInnings: 120,
      ballsCompleted: 84,
      ballsRemaining: 36,
      providerTimestamp: Date.now(),
      stateVersion: 1,
    };

    const replayResult = replayHistoricalOdds({
      matchState: historicalMatch,
      recordedOdds: [
        { marketId: 'match_winner', selectionId: 'CSK', odds: 1.85 },
      ],
    });

    expect(replayResult.matchId).toBe('cb_test_match_101');
    expect(replayResult.snapshotStatus).toBe('OK');
    expect(replayResult.totalMarkets).toBeGreaterThan(0);
  });
});
