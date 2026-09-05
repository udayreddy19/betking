/**
 * Shared market helpers for OddsEngineV4.
 */

import { createMarketDefinition } from '../../odds-v3/models/MarketDefinition.mjs';
import { validateMarketSettlementCompatibility } from '../../settlement/marketSettlementContract.mjs';

export function emitMarket(def) {
  const compat = validateMarketSettlementCompatibility(def);
  if (!compat.compatible) return null;
  return def;
}

export function ouMarket({
  marketId,
  marketType,
  name,
  line,
  pOver,
  pUnder,
  overround,
  priceExclusive,
}) {
  const priced = priceExclusive([
    { id: `${marketId}_over`, name: 'Over', probability: pOver },
    { id: `${marketId}_under`, name: 'Under', probability: pUnder },
  ], overround);
  if (priced.suspended) {
    return emitMarket(createMarketDefinition({
      marketId,
      marketType,
      name,
      status: 'SUSPENDED',
      line,
      selections: [],
      overround,
    }));
  }
  return emitMarket(createMarketDefinition({
    marketId,
    marketType,
    name,
    status: 'OPEN',
    line,
    selections: priced.selections,
    overround,
  }));
}

export { createMarketDefinition };
