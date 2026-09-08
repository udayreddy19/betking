/**
 * OtherSportsEngineV4 — book guardian (v4.2 hard mode).
 * Suspend anything that still looks soft after tighten.
 */

import { OSV4_MARGIN_CONFIG, minBookMassForKind } from '../pricing/MarginPolicy.mjs';
import { bookPoints } from './helpers.mjs';
import { isOverishName } from './houseProtect.mjs';

function openSels(market) {
  return (market?.selections || []).filter((s) => {
    const odds = Number(s?.odds);
    return Number.isFinite(odds) && odds >= (OSV4_MARGIN_CONFIG.minDecimalOdds || 1.01);
  });
}

function impliedSum(sels) {
  return sels.reduce((acc, s) => acc + 1 / Number(s.odds), 0);
}

function kindForMarket(market) {
  const id = String(market?.marketId || '');
  const type = String(market?.marketType || '');
  if (/total|spread|goals_line|total_pts|total_games/i.test(id) || /TOTAL|SPREAD/i.test(type)) {
    return 'totals';
  }
  if (/btts|double_chance|dnb/i.test(id) || /BTTS|DOUBLE_CHANCE|DRAW_NO_BET/i.test(type)) {
    return 'props';
  }
  return 'winner';
}

/**
 * Scale exclusive N-way book up to min mass (shorten all sides proportionally).
 */
function enforceMinMass(market, minMass) {
  const sels = openSels(market);
  if (sels.length < 2) return market;
  const mass = impliedSum(sels);
  if (mass + 1e-6 >= minMass) return market;
  if (!(mass > 0)) return market;
  const scale = minMass / mass;
  return {
    ...market,
    selections: (market.selections || []).map((s) => {
      const odds = Number(s.odds);
      if (!Number.isFinite(odds) || odds < 1.01) return s;
      const implied = Math.min(0.985, (1 / odds) * scale);
      const nextOdds = Number(Math.max(1.01, 1 / implied).toFixed(4));
      return {
        ...s,
        odds: nextOdds,
        finalProbability: Number(implied.toFixed(8)),
      };
    }),
    bookGuardian: 'min_mass_enforced',
  };
}

function suspend(market, reason, issues) {
  issues.push(`${reason}:${market.marketId}`);
  return {
    ...market,
    status: 'SUSPENDED',
    selections: [],
    suspensionReason: reason,
  };
}

/**
 * @returns {{ markets: object[], issues: string[] }}
 */
export function guardOsV4Book(markets = [], margins = OSV4_MARGIN_CONFIG) {
  const issues = [];
  const out = [];
  const maxOver = Number(margins.maxOverOdds) || 1.25;
  const maxYes = Number(margins.maxYesOdds) || 1.62;
  const maxFav = Number(margins.maxFavoriteOdds) || 1.40;
  const maxSel = Number(margins.maxSelectionOdds) || 2.75;

  for (const market of markets || []) {
    if (!market?.marketId) continue;
    if (market.status && market.status !== 'OPEN') {
      out.push(market);
      continue;
    }

    let sels = openSels(market);
    if (sels.length < 2) {
      out.push(suspend(market, 'thin_market', issues));
      continue;
    }

    const ids = new Set();
    let dup = false;
    for (const s of sels) {
      const sid = String(s.selectionId || s.name || '');
      if (ids.has(sid)) { dup = true; break; }
      ids.add(sid);
    }
    if (dup) {
      out.push(suspend(market, 'duplicate_selection', issues));
      continue;
    }

    const kind = kindForMarket(market);
    const minMass = minBookMassForKind(kind, margins);

    // Overlapping DC Yes-only — cap Yes hard, don't exclusive-mass check
    if (market.bookKind === 'overlapping' || market.marketId === 'double_chance') {
      const capped = {
        ...market,
        selections: (market.selections || []).map((s) => {
          const odds = Number(s.odds);
          if (!(odds > maxYes)) return s;
          return {
            ...s,
            odds: maxYes,
            finalProbability: Number((1 / maxYes).toFixed(8)),
          };
        }),
      };
      const soft = openSels(capped).some((s) => Number(s.odds) < 1.05);
      if (soft) {
        out.push(suspend(capped, 'soft_dc_lock', issues));
        continue;
      }
      out.push({ ...capped, bookPoints: bookPoints(openSels(capped)) });
      continue;
    }

    let next = { ...market };

    const isMultiOutcome = /correct_score|winning_margin|first_to_score|ht_result|first_half_winner/i.test(market.marketId);
    const effectiveMaxSel = isMultiOutcome ? 51.0 : maxSel;

    // Cap Overs / longshots again (belt + suspenders)
    next = {
      ...next,
      selections: (next.selections || []).map((s) => {
        let odds = Number(s.odds);
        if (!Number.isFinite(odds)) return s;
        if (isOverishName(s.name) && odds > maxOver) odds = maxOver;
        if (odds > effectiveMaxSel) odds = effectiveMaxSel;
        const fairP = Number(s.probability);
        if (fairP >= 0.48 && odds > maxFav) odds = maxFav;
        if (odds === Number(s.odds)) return s;
        return {
          ...s,
          odds: Number(odds.toFixed(2)),
          finalProbability: Number((1 / odds).toFixed(8)),
        };
      }),
    };

    next = enforceMinMass(next, minMass);
    sels = openSels(next);
    let mass = impliedSum(sels);

    if (mass <= 1.001) {
      out.push(suspend(next, 'arb_or_zero_margin', issues));
      continue;
    }

    // Still soft Over after enforce → suspend market (don't give juice)
    const overSel = sels.find((s) => isOverishName(s.name));
    if (overSel && Number(overSel.odds) > maxOver + 0.001) {
      out.push(suspend(next, 'soft_over', issues));
      continue;
    }

    // Soft favorite still printing → suspend
    const softFav = sels.find((s) => Number(s.probability) >= 0.48 && Number(s.odds) > maxFav + 0.001);
    if (softFav) {
      out.push(suspend(next, 'soft_favorite', issues));
      continue;
    }

    if (mass + 1e-6 < minMass * 0.99) {
      out.push(suspend(next, 'insufficient_margin', issues));
      continue;
    }

    // Final longshot sweep
    const longLeak = sels.some((s) => Number(s.odds) > effectiveMaxSel + 0.001);
    if (longLeak) {
      out.push(suspend(next, 'longshot_leak', issues));
      continue;
    }

    out.push({
      ...next,
      bookPoints: bookPoints(sels),
    });
  }

  return { markets: out, issues };
}

/**
 * If guardian issues are heavy, keep only core moneyline (v4.7 stability).
 */
export function applyOsV4StabilityFallback(markets = [], issues = []) {
  if (!Array.isArray(issues) || issues.length < 3) return markets;
  const keep = new Set(['match_winner']);
  return (markets || []).map((m) => {
    if (!m || m.status !== 'OPEN') return m;
    if (keep.has(m.marketId)) return m;
    return {
      ...m,
      status: 'SUSPENDED',
      selections: [],
      suspensionReason: 'stability_fallback',
    };
  });
}

