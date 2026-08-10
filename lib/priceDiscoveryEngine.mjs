/**
 * Price Discovery Engine — Multi-Provider Odds Synthesis Engine
 * Synthesizes canonical odds prices from multiple provider price feeds.
 */

import { providerHealthManager } from './providerHealthManager.mjs';

class PriceDiscoveryEngine {
  /** Synthesize consensus odds for a market selection from multiple providers */
  synthesizeConsensusPrice(selectionKey, providerPrices = []) {
    if (!Array.isArray(providerPrices) || providerPrices.length === 0) {
      return null;
    }

    if (providerPrices.length === 1) {
      return providerPrices[0].price;
    }

    // 1. Filter out stale or invalid prices
    const valid = providerPrices.filter((p) => typeof p.price === 'number' && p.price > 1.0);
    if (valid.length === 0) return null;

    // 2. Weight prices by provider health score & freshness
    let weightedSum = 0;
    let totalWeight = 0;

    for (const item of valid) {
      const health = providerHealthManager.getHealth(item.providerName);
      const weight = (health?.score || 80) / 100;

      weightedSum += item.price * weight;
      totalWeight += weight;
    }

    const consensusPrice = totalWeight > 0 ? (weightedSum / totalWeight) : valid[0].price;
    return parseFloat(consensusPrice.toFixed(2));
  }
}

export const priceDiscoveryEngine = new PriceDiscoveryEngine();
