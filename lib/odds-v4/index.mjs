/**
 * OddsEngineV4 public API.
 */

export { generate, V4_ENGINE_VERSION } from './OddsEngineV4.mjs';
export { generateMatchWinnerMarketV4 } from './markets/MatchWinnerMarketV4.mjs';
export { generateV4ExtraMarkets } from './markets/v4ExtraMarkets.mjs';
export { shouldSkipV4LiveMarket, V4_UNLOCKED_VS_COMPACT } from './marketCatalog.mjs';
export { chaseWinProbability, inningsOneWinProbability } from './models/WinExpectancyEngine.mjs';
export {
  V4_MARGIN_CONFIG,
  tightenV4Markets,
  shortenFavoritePair,
  applySideHouseBias,
} from './v4HouseProtect.mjs';
export {
  applyV4ChaseTotalSanity,
  pOverChaseTeamTotal,
  expectedChaseTeamTotal,
  maxChaseTeamScore,
} from './chaseTotalCaps.mjs';
export { computeMomentum, applyMomentumToExpected } from './models/MomentumEngine.mjs';
export { applyLateChaseProtect } from './lateChaseProtect.mjs';
export { applyEventFreeze } from './eventFreeze.mjs';
export { generateV4FeatureMarkets } from './markets/v4FeatureMarkets.mjs';
export { guardV4Book, scoreV4Book, applyStabilityFallback } from './v4BookGuardian.mjs';
export { blendModelWithProvider } from './models/providerBlend.mjs';
export {
  resolveOddsEngineMode,
  getEngineModeStatus,
  setRuntimeEngineMode,
  clearRuntimeEngineMode,
  ENGINE_MODES,
} from './EngineModeControl.mjs';
export {
  priceMatchWinnerForAggregator,
  generatePublicMatchOddsSnapshot,
  runShadowCompare,
  getShadowMetrics,
} from './engineDispatch.mjs';
