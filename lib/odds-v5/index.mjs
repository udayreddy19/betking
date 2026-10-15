/**
 * OddsEngineV5 public API (live). V4 remains available under ../odds-v4 for fallback.
 */

export { generate, V5_ENGINE_VERSION } from './OddsEngineV5.mjs';
export { generateMatchWinnerMarketV5 } from './markets/MatchWinnerMarketV5.mjs';
export { generateV5ExtraMarkets } from './markets/v5ExtraMarkets.mjs';
export { shouldSkipV5LiveMarket, V5_UNLOCKED_VS_COMPACT } from './marketCatalog.mjs';
export { chaseWinProbability, inningsOneWinProbability } from './models/WinExpectancyEngine.mjs';
export {
  V5_MARGIN_CONFIG,
  tightenV5Markets,
  shortenFavoritePair,
  applySideHouseBias,
} from './v5HouseProtect.mjs';
export {
  applyV5ChaseTotalSanity,
  pOverChaseTeamTotal,
  expectedChaseTeamTotal,
  maxChaseTeamScore,
} from './chaseTotalCaps.mjs';
export { computeMomentum, applyMomentumToExpected } from './models/MomentumEngine.mjs';
export { applyLateChaseProtect } from './lateChaseProtect.mjs';
export { applyEventFreeze } from './eventFreeze.mjs';
export { generateV5FeatureMarkets } from './markets/v5FeatureMarkets.mjs';
export { guardV5Book, scoreV5Book, applyStabilityFallback } from './v5BookGuardian.mjs';
export { getEngineProductionTenStatus } from './engineProductionTen.mjs';
export { blendModelWithProvider } from './models/providerBlend.mjs';
export {
  resolveOddsEngineMode,
  resolveOddsEngineModeAsync,
  waitForEngineModeHydrated,
  getEngineModeStatus,
  setRuntimeEngineMode,
  clearRuntimeEngineMode,
  ENGINE_MODES,
  _resetEngineModeControlForTests,
} from './EngineModeControl.mjs';
export {
  priceMatchWinnerForAggregator,
  priceMatchWinnerForAggregatorAsync,
  generatePublicMatchOddsSnapshot,
  generatePublicMatchOddsSnapshotAsync,
  runShadowCompare,
  getShadowMetrics,
  getEngineFallbackMetrics,
  ENGINE_FALLBACK_REASONS,
} from './engineDispatch.mjs';

export { evaluateStateQuality, shouldSuspendForQuality } from './state/StateQualityGate.mjs';
export {
  teamTotalDistribution,
  nextOverRunsDistribution,
  pOverUnderFromDistribution,
  normalCdf,
} from './models/ScoreDistributionEngine.mjs';
export {
  generateTeamTotalMarketV5,
  generateMatchTotalMarketV5,
  generateNextOverTotalMarketV5,
} from './markets/v5CoreTotals.mjs';
export {
  evaluateLiveCalibration,
  loadSettledObservationsForScoring,
  getCalibrationValidationStatus,
  getCalibrationWiringStatus,
} from './calibration/calibrationBridge.mjs';
export { monteCarloChaseWinProbability } from './models/WinExpectancyEngine.mjs';
