/**
 * OtherSportsEngineV5 public API.
 */

export {
  generate,
  isOtherSportsV4Sport,
  OSV5_SPORTS,
  OSV5_ENGINE_VERSION,
  OSV5_MARGIN_CONFIG,
  marginsForSport,
} from './OtherSportsEngineV5.mjs';

export {
  resolveOtherSportsEngineMode,
  resolveOtherSportsEngineModeAsync,
  getOtherSportsEngineModeStatus,
  setRuntimeOtherSportsEngineMode,
  clearRuntimeOtherSportsEngineMode,
  OTHER_SPORTS_ENGINE_MODES,
} from './EngineModeControl.mjs';

export { bookPoints } from './book/helpers.mjs';
export { overroundForMarket } from './pricing/MarginPolicy.mjs';
export { tightenOsV4Markets, liveMarginBump, applyOsV4LateLock } from './book/houseProtect.mjs';
export { guardOsV4Book, applyOsV4StabilityFallback } from './book/guardian.mjs';
export { scoreOsV4Book, applyScoreDrivenFallback } from './book/scorecard.mjs';
export { getOtherSportsShadowMetrics, runOtherSportsShadowCompare } from './shadowCompare.mjs';
