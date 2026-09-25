import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveOtherSportsEngineMode,
  _resetOtherSportsEngineModeControlForTests,
} from '../../lib/other-sports-v4/EngineModeControl.mjs';
import {
  generatePublicMatchOddsSnapshot,
  ENGINE_FALLBACK_REASONS,
  getEngineFallbackMetrics,
} from '../../lib/odds-v4/engineDispatch.mjs';
import { _resetEngineModeControlForTests } from '../../lib/odds-v4/EngineModeControl.mjs';
import { ORPHAN_REASON } from '../../lib/settlement/orphanedOpenBetRecovery.mjs';
import {
  getCalibrationValidationStatus,
  recordAcceptedBetPrediction,
  recordSettledCalibrationObservation,
} from '../../lib/odds-v4/calibration/calibrationBridge.mjs';
import { productionObservationRecorder } from '../../lib/odds-v4/calibration/ProductionObservationRecorder.mjs';
import { defaultObservationStore } from '../../lib/odds-v4/calibration/ObservationStore.mjs';

describe('V4 production hardening', () => {
  beforeEach(() => {
    _resetOtherSportsEngineModeControlForTests();
    _resetEngineModeControlForTests();
    productionObservationRecorder.clear();
    defaultObservationStore.clear();
  });

  it('defaults other-sports engine to v4', () => {
    expect(resolveOtherSportsEngineMode({ OTHER_SPORTS_ENGINE: undefined })).toBe('v4');
    expect(resolveOtherSportsEngineMode({ OTHER_SPORTS_ENGINE: '' })).toBe('v4');
  });

  it('publishes OtherSportsEngineV4 for soccer by default', () => {
    const match = {
      matchId: 'soc-harden-1',
      sport: 'soccer',
      team1: { name: 'A' },
      team2: { name: 'B' },
      isLive: true,
      matchState: 'in',
      liveDetails: { score1: 0, score2: 0, minute: 10 },
      odds: { home: 2.1, draw: 3.3, away: 3.4 },
    };
    const { rawSnapshot, publicSnapshot } = generatePublicMatchOddsSnapshot(match, {
      allowModelOnly: true,
    });
    expect(rawSnapshot.engine).toBe('OtherSportsEngineV4');
    expect(publicSnapshot?.engine).toBe('OtherSportsEngineV4');
  });

  it('falls back with NON_OSV4_SPORT reason for unsupported sports', () => {
    const match = {
      matchId: 'kabaddi-1',
      sport: 'kabaddi',
      team1: { name: 'A' },
      team2: { name: 'B' },
      isLive: true,
      odds: { home: 1.9, away: 1.9 },
    };
    const { publicSnapshot, fallbackReason } = generatePublicMatchOddsSnapshot(match, {
      allowModelOnly: true,
    });
    expect(publicSnapshot?.engine).toBe('OddsEngineV3');
    expect(fallbackReason || publicSnapshot?.engineFallbackReason).toBe(
      ENGINE_FALLBACK_REASONS.NON_OSV4_SPORT,
    );
    const metrics = getEngineFallbackMetrics();
    expect(metrics.byReason[ENGINE_FALLBACK_REASONS.NON_OSV4_SPORT]).toBeGreaterThan(0);
  });

  it('exposes orphan reason codes without inventing winners', () => {
    expect(ORPHAN_REASON.PROVIDER_FINALITY_ORPHAN).toBe('PROVIDER_FINALITY_ORPHAN');
    expect(ORPHAN_REASON.PROVIDER_FINALITY_TIMEOUT_VOID).toBe('PROVIDER_FINALITY_TIMEOUT_VOID');
  });

  it('reports NO_DATA calibration status when N=0', () => {
    const status = getCalibrationValidationStatus();
    expect(status.sampleSize).toBe(0);
    expect(status.status).toBe('NO_DATA');
    expect(status.autoPromotionAllowed).toBe(false);
  });

  it('records and links a genuine prediction→settlement observation', () => {
    const pred = recordAcceptedBetPrediction({
      betId: 'bet_cal_1',
      matchId: 'm_cal_1',
      marketId: 'match_winner',
      selectionId: '1',
      acceptedOdds: 2.0,
      fairProbability: 0.5,
      fairOdds: 2.0,
      sport: 'soccer',
      matchState: { status: 'live' },
    });
    expect(pred.recorded).toBe(true);

    const settledAt = new Date(Date.now() + 60_000).toISOString();
    const link = recordSettledCalibrationObservation({
      betId: 'bet_cal_1',
      matchId: 'm_cal_1',
      marketId: 'match_winner',
      selectionId: '1',
      outcome: 'WON',
      acceptedOdds: 2.0,
      sport: 'soccer',
      settledAt,
    });
    expect(link.linked).toBe(true);

    const status = getCalibrationValidationStatus({ sport: 'soccer' });
    expect(status.sampleSize).toBeGreaterThanOrEqual(1);
    expect(['INSUFFICIENT_SAMPLE', 'VALIDATING', 'VALIDATED']).toContain(status.status);
  });
});
