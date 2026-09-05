/**
 * OddsEngineV4 public API.
 */

export { generate, generateFromState, buildCanonicalFromMatchV4, evaluateStateQuality, DEFAULT_V4_MARGIN } from './OddsEngineV4.mjs';
export { extractMatchWinnerOddsV4 } from './adapters/extractWinnerOdds.mjs';
export { runShadowCompare, getShadowMetrics, clearShadowRing, compareWinnerBooks } from './shadow/ShadowHarness.mjs';
export { evaluateCutoverReadiness, resolveOddsEngineMode, CUTOVER_THRESHOLDS } from './shadow/CutoverGate.mjs';
export {
  getEngineModeStatus,
  setRuntimeEngineMode,
  clearRuntimeEngineMode,
  getRuntimeEngineMode,
  ENGINE_MODES,
} from './shadow/EngineModeControl.mjs';
export { priceMatchWinnerForAggregator, generatePublicMatchOddsSnapshot } from './engineDispatch.mjs';
