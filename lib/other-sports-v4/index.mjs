/**
 * OtherSportsEngineV4 public API.
 */

export {
  generate,
  isOtherSportsV4Sport,
  OSV4_SPORTS,
  OSV4_ENGINE_VERSION,
  OSV4_MARGIN_CONFIG,
  marginsForSport,
} from './OtherSportsEngineV4.mjs';

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
export { getOtherSportsShadowMetrics, runOtherSportsShadowCompare } from './shadowCompare.mjs';
