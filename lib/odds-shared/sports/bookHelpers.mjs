import { createMarketDefinition } from '../models/MarketDefinition.mjs';
import { priceSelection, priceExclusiveSelections } from '../pricing/OddsCalculator.mjs';

export function teamName(team, fallback) {
  if (team == null) return fallback;
  if (typeof team === 'string') return team;
  return team.name || team.shortName || fallback;
}

export function clampProb(p, lo = 0.03, hi = 0.94) {
  return Math.max(lo, Math.min(hi, p));
}

export function normalizeProbs(values) {
  const safe = values.map((v) => Math.max(0.001, Number(v) || 0));
  const sum = safe.reduce((acc, v) => acc + v, 0);
  return safe.map((v) => v / sum);
}

export function matchSeed(id) {
  return [...String(id || 'm')].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
}

export function priced(selectionId, name, probability, overround) {
  return priceSelection({
    selectionId,
    name,
    probability: clampProb(probability),
    overround,
  });
}

export function twoWayMarket({
  marketId,
  marketType,
  name,
  category,
  line,
  left,
  right,
  pLeft,
  overround,
  status = 'OPEN',
}) {
  if (status === 'SUSPENDED') {
    return createMarketDefinition({
      marketId,
      marketType,
      name,
      status: 'SUSPENDED',
      line: line ?? null,
      category,
      selections: [],
    });
  }
  const [p0, p1] = normalizeProbs([pLeft, 1 - pLeft]);
  const pricedSels = priceExclusiveSelections([
    { selectionId: left.id, name: left.name, probability: p0 },
    { selectionId: right.id, name: right.name, probability: p1 },
  ], overround);
  if (pricedSels.suspended) {
    return createMarketDefinition({
      marketId,
      marketType,
      name,
      status: 'SUSPENDED',
      line: line ?? null,
      category,
      selections: [],
    });
  }
  return createMarketDefinition({
    marketId,
    marketType,
    name,
    status: 'OPEN',
    line: line ?? null,
    category,
    selections: pricedSels.selections,
  });
}

export function suspendedMarket({ marketId, marketType, name, category, line = null }) {
  return createMarketDefinition({
    marketId,
    marketType,
    name,
    status: 'SUSPENDED',
    line,
    category,
    selections: [],
  });
}
