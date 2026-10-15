/** Compatibility shim — OddsEngineV3 removed; live engine is V5. */
export {
  generate,
  V5_ENGINE_VERSION as V3_ENGINE_VERSION,
  V5_ENGINE_VERSION as ENGINE_VERSION,
} from '../odds-v5/OddsEngineV5.mjs';
