/**
 * Volatility Spike Filter — OddsEngine V3
 *
 * Inspects consecutive price updates per selection.
 * If odds move faster than normal variance limits (e.g. >35% single-tick swing)
 * without a verified live event (such as a wicket, boundary, or penalty),
 * the tick is flagged, dampened, or quarantined.
 */

export const DEFAULT_VOLATILITY_CONFIG = {
  maxSingleTickPercentChange: 0.35, // 35% max change without game event
  maxImpliedProbJump: 0.25,         // 25% implied probability shift
  dampeningFactor: 0.5,             // Reduce aggressive jumps when dampening
  allowedEvents: ['WICKET', 'BOUNDARY_SIX', 'BOUNDARY_FOUR', 'GOAL', 'RED_CARD', 'PENALTY'],
};

const SELECTION_PRICE_HISTORY = new Map();

function readSelectionOdds(selection) {
  const odds = Number(selection?.odds ?? selection?.price);
  return Number.isFinite(odds) && odds >= 1.01 ? odds : 1.01;
}

/**
 * Filter an individual selection price against historical volatility
 * @param {string} matchId
 * @param {string} marketId
 * @param {object} selection { id, odds|price, prob }
 * @param {object} context { eventType, isLive }
 * @param {object} customConfig
 * @returns {{ odds: number, price: number, isQuarantined: boolean, wasDampened: boolean, originalPrice: number }}
 */
export function filterSelectionVolatility(matchId, marketId, selection, context = {}, customConfig = {}) {
  const config = { ...DEFAULT_VOLATILITY_CONFIG, ...customConfig };
  const key = `${matchId}::${marketId}::${selection.id || selection.selectionId}`;
  const currentPrice = readSelectionOdds(selection);
  const previous = SELECTION_PRICE_HISTORY.get(key);

  if (!previous) {
    SELECTION_PRICE_HISTORY.set(key, { price: currentPrice, timestamp: Date.now() });
    return {
      odds: currentPrice,
      price: currentPrice,
      isQuarantined: false,
      wasDampened: false,
      originalPrice: currentPrice,
    };
  }

  const prevPrice = previous.price;
  const priceRatio = Math.abs(currentPrice - prevPrice) / prevPrice;
  const hasLegitEvent = context.eventType && config.allowedEvents.includes(String(context.eventType).toUpperCase());

  if (hasLegitEvent) {
    SELECTION_PRICE_HISTORY.set(key, { price: currentPrice, timestamp: Date.now() });
    return {
      odds: currentPrice,
      price: currentPrice,
      isQuarantined: false,
      wasDampened: false,
      originalPrice: currentPrice,
    };
  }

  if (priceRatio > config.maxSingleTickPercentChange) {
    const smoothedPrice = Number((prevPrice + (currentPrice - prevPrice) * config.dampeningFactor).toFixed(2));
    const finalPrice = Math.max(1.01, smoothedPrice);

    SELECTION_PRICE_HISTORY.set(key, { price: finalPrice, timestamp: Date.now() });
    return {
      odds: finalPrice,
      price: finalPrice,
      isQuarantined: priceRatio > (config.maxSingleTickPercentChange * 1.5),
      wasDampened: true,
      originalPrice: currentPrice,
    };
  }

  SELECTION_PRICE_HISTORY.set(key, { price: currentPrice, timestamp: Date.now() });
  return {
    odds: currentPrice,
    price: currentPrice,
    isQuarantined: false,
    wasDampened: false,
    originalPrice: currentPrice,
  };
}

/**
 * Apply volatility protection across all markets in a snapshot
 */
export function applyVolatilityProtection(markets = [], matchId = 'global', context = {}) {
  return markets.map((market) => {
    let marketQuarantined = false;
    const protectedSelections = (market.selections || []).map((sel) => {
      const res = filterSelectionVolatility(matchId, market.marketId, sel, context);
      if (res.isQuarantined) marketQuarantined = true;
      const next = {
        ...sel,
        odds: res.odds,
        price: res.odds,
        dampened: res.wasDampened,
      };
      if (Number.isFinite(res.odds) && res.odds > 0) {
        next.finalProbability = Number((1 / res.odds).toFixed(8));
      }
      return next;
    });

    return {
      ...market,
      status: marketQuarantined ? 'SUSPENDED' : market.status,
      suspensionReason: marketQuarantined ? 'VOLATILITY_SPIKE_QUARANTINE' : market.suspensionReason,
      selections: protectedSelections,
    };
  });
}

/**
 * Clear volatility cache for a match
 */
export function clearVolatilityHistory(matchId) {
  for (const key of SELECTION_PRICE_HISTORY.keys()) {
    if (key.startsWith(`${matchId}::`)) {
      SELECTION_PRICE_HISTORY.delete(key);
    }
  }
}
