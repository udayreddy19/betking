/**
 * Book helpers — exclusive pricing with house shorten / Over bias baked in.
 */

import { createMarketDefinition } from '../../odds-v3/models/MarketDefinition.mjs';
import { priceExclusiveSelections, priceSelection } from '../../odds-v3/pricing/OddsCalculator.mjs';
import { OSV4_MARGIN_CONFIG } from '../pricing/MarginPolicy.mjs';
import {
  shortenFavoritePair,
  shortenFavoriteOutcomes,
  applySideHouseBias,
} from './houseProtect.mjs';

export function clampProb(p, lo = 0.001, hi = 0.98) {
  return Math.max(lo, Math.min(hi, Number(p) || 0));
}

export function normalizeProbs(values) {
  const safe = values.map((v) => Math.max(0.001, Number(v) || 0));
  const sum = safe.reduce((acc, v) => acc + v, 0);
  return safe.map((v) => v / sum);
}

export function bookPoints(selections = []) {
  if (!selections?.length) return null;
  const sum = selections.reduce((acc, s) => acc + (1 / Number(s.odds)), 0);
  if (!Number.isFinite(sum)) return null;
  return Number((sum * 100).toFixed(2));
}

function capSelections(selections, maxOdds = OSV4_MARGIN_CONFIG.maxSelectionOdds) {
  const cap = Number(maxOdds) > 1 ? Number(maxOdds) : OSV4_MARGIN_CONFIG.maxSelectionOdds;
  let softLongshot = false;
  const next = (selections || []).map((sel) => {
    const odds = Number(sel.odds);
    if (!(odds > cap)) return sel;
    const fairP = Number(sel.probability ?? sel.finalProbability);
    // Only kill near-certain inverted books on tight 2-way/3-way markets (e.g. 3-0 late Away at 2.75).
    if (cap <= 3.5 && (!Number.isFinite(fairP) || fairP < 0.02)) softLongshot = true;
    const capped = Number(cap.toFixed(2));
    return {
      ...sel,
      odds: capped,
      finalProbability: Number((1 / capped).toFixed(8)),
    };
  });
  return { selections: next, softLongshot };
}

function isOverLeft(left) {
  const n = String(left?.name || '').toLowerCase();
  return n === 'over' || n.startsWith('over ');
}

function isYesLeft(left) {
  const n = String(left?.name || '').toLowerCase();
  return n === 'yes' || n.startsWith('yes');
}

export function twoWayMarket({
  marketId,
  marketType,
  name,
  category,
  line = null,
  left,
  right,
  pLeft,
  overround,
  maxOdds = OSV4_MARGIN_CONFIG.maxSelectionOdds,
  houseBias = true,
  shortenFavorite = true,
  status = 'OPEN',
  margins = OSV4_MARGIN_CONFIG,
}) {
  if (status === 'SUSPENDED') {
    return createMarketDefinition({
      marketId,
      marketType,
      name,
      status: 'SUSPENDED',
      line,
      category,
      selections: [],
      overround,
    });
  }

  let p0 = clampProb(pLeft);
  let p1 = clampProb(1 - pLeft);

  if (houseBias && (isOverLeft(left) || isYesLeft(left))) {
    p0 = applySideHouseBias(p0, margins.sideHouseBias);
    p1 = 1 - p0;
  }

  if (shortenFavorite) {
    [p0, p1] = shortenFavoritePair(p0, p1, margins.favoriteShortenFactor);
  }

  const [n0, n1] = normalizeProbs([p0, p1]);
  let oo = Number(overround) || 0;
  if (houseBias && isOverLeft(left)) {
    oo += Number(margins.overExtraOverround) || 0;
  }

  const priced = priceExclusiveSelections([
    { selectionId: left.id, name: left.name, probability: n0 },
    { selectionId: right.id, name: right.name, probability: n1 },
  ], oo);
  if (priced.suspended) {
    return createMarketDefinition({
      marketId,
      marketType,
      name,
      status: 'SUSPENDED',
      line,
      category,
      selections: [],
      overround: oo,
    });
  }
  const capped = capSelections(priced.selections, maxOdds);
  return createMarketDefinition({
    marketId,
    marketType,
    name,
    status: 'OPEN',
    line,
    category,
    selections: capped.selections,
    overround: oo,
  });
}

export function exclusiveMarket({
  marketId,
  marketType,
  name,
  category,
  line = null,
  outcomes,
  overround,
  maxOdds = OSV4_MARGIN_CONFIG.maxSelectionOdds,
  shortenFavorite = true,
  margins = OSV4_MARGIN_CONFIG,
}) {
  let probs = (outcomes || []).map((o) => clampProb(o.probability));
  if (shortenFavorite) {
    probs = shortenFavoriteOutcomes(probs, margins.favoriteShortenFactor);
  }
  const normalized = normalizeProbs(probs);
  const pricedOutcomes = outcomes.map((o, i) => ({
    ...o,
    probability: normalized[i],
  }));

  const priced = priceExclusiveSelections(pricedOutcomes, overround);
  if (priced.suspended) {
    return createMarketDefinition({
      marketId,
      marketType,
      name,
      status: 'SUSPENDED',
      line,
      category,
      selections: [],
      overround,
    });
  }
  const capped = capSelections(priced.selections, maxOdds);
  if (capped.softLongshot) {
    return createMarketDefinition({
      marketId,
      marketType,
      name,
      status: 'SUSPENDED',
      line,
      category,
      selections: [],
      overround,
      suspensionReason: 'soft_longshot_cap',
    });
  }
  return createMarketDefinition({
    marketId,
    marketType,
    name,
    status: 'OPEN',
    line,
    category,
    selections: capped.selections,
    overround,
  });
}

export function doubleChanceAsBinaryMarkets({
  team1Name,
  team2Name,
  p1,
  pDraw,
  p2,
  overround,
  margins = OSV4_MARGIN_CONFIG,
}) {
  return [
    twoWayMarket({
      marketId: 'double_chance_1x',
      marketType: 'DOUBLE_CHANCE',
      name: `${team1Name} or Draw`,
      category: 'chance',
      left: { id: 'DC:1X', name: `${team1Name} or Draw` },
      right: { id: 'DC:1X:No', name: 'No' },
      pLeft: clampProb(p1 + pDraw),
      overround,
      houseBias: true,
      margins,
    }),
    twoWayMarket({
      marketId: 'double_chance_12',
      marketType: 'DOUBLE_CHANCE',
      name: `${team1Name} or ${team2Name}`,
      category: 'chance',
      left: { id: 'DC:12', name: `${team1Name} or ${team2Name}` },
      right: { id: 'DC:12:No', name: 'No' },
      pLeft: clampProb(p1 + p2),
      overround,
      houseBias: true,
      margins,
    }),
    twoWayMarket({
      marketId: 'double_chance_x2',
      marketType: 'DOUBLE_CHANCE',
      name: `Draw or ${team2Name}`,
      category: 'chance',
      left: { id: 'DC:X2', name: `Draw or ${team2Name}` },
      right: { id: 'DC:X2:No', name: 'No' },
      pLeft: clampProb(pDraw + p2),
      overround,
      houseBias: true,
      margins,
    }),
  ].filter(Boolean);
}

export function doubleChanceMarket({
  team1Name,
  team2Name,
  p1,
  pDraw,
  p2,
  overround,
  maxOdds = OSV4_MARGIN_CONFIG.maxSelectionOdds,
  margins = OSV4_MARGIN_CONFIG,
}) {
  const bias = margins.sideHouseBias;
  const sels = [
    priceSelection({
      selectionId: 'DC:1X',
      name: `${team1Name} or Draw`,
      probability: applySideHouseBias(clampProb(p1 + pDraw), bias),
      overround,
      maxOdds: Math.min(maxOdds, margins.maxYesOdds || 2.1),
    }),
    priceSelection({
      selectionId: 'DC:12',
      name: `${team1Name} or ${team2Name}`,
      probability: applySideHouseBias(clampProb(p1 + p2), bias),
      overround,
      maxOdds: Math.min(maxOdds, margins.maxYesOdds || 2.1),
    }),
    priceSelection({
      selectionId: 'DC:X2',
      name: `Draw or ${team2Name}`,
      probability: applySideHouseBias(clampProb(pDraw + p2), bias),
      overround,
      maxOdds: Math.min(maxOdds, margins.maxYesOdds || 2.1),
    }),
  ];
  const capped = capSelections(sels, Math.min(maxOdds, margins.maxYesOdds || 2.1));
  return createMarketDefinition({
    marketId: 'double_chance',
    marketType: 'DOUBLE_CHANCE',
    name: 'Double Chance',
    status: 'OPEN',
    category: 'chance',
    selections: capped.selections,
    overround,
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

export function applyBookIntegrity(markets = [], { maxOdds = OSV4_MARGIN_CONFIG.maxSelectionOdds } = {}) {
  return (markets || [])
    .filter(Boolean)
    .map((m) => {
      if (m.status !== 'OPEN' || !m.selections?.length) return m;
      const isMulti = /correct_score|winning_margin|first_to_score|ht_result|first_half_winner|double_chance/i.test(m.marketId);
      const effectiveMax = isMulti ? 51.0 : maxOdds;
      const capped = capSelections(m.selections, effectiveMax);
      if (capped.softLongshot && !isMulti) {
        return {
          ...m,
          status: 'SUSPENDED',
          selections: [],
          suspensionReason: 'soft_longshot_cap',
        };
      }
      return {
        ...m,
        selections: capped.selections,
      };
    });
}
