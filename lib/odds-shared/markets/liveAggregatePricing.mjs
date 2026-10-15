/**
 * Live-aware Over/Under aggregate helpers (boundaries, etc.).
 * Never price from a hardcoded mean that ignores the live count.
 */

import { calculateOverUnderProbability } from '../models/distributionModel.mjs';
import { priceSelection } from '../pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../models/MarketDefinition.mjs';

/** Format-aware boundary rates per ball. */
export function boundaryRatesPerBall(format = 'T20') {
  const f = String(format || '').toUpperCase();
  if (/T10|TEN10/.test(f)) return { four: 0.16, six: 0.12 };
  if (/100|HUNDRED/.test(f)) return { four: 0.13, six: 0.07 };
  if (/ODI|LIST|ONE.?DAY|50/.test(f)) return { four: 0.08, six: 0.025 };
  if (/TEST|FC|FIRST.?CLASS|4.?DAY/.test(f)) return { four: 0.05, six: 0.008 };
  return { four: 0.11, six: 0.06 };
}

/**
 * Read fours/sixes from team object or liveDetails (same sources settlement uses).
 * @returns {number|null} null when unknown
 */
export function readBoundaryCount(team, liveDetails, kind /* 'fours'|'sixes' */) {
  const key = kind === 'sixes' ? 'sixes' : 'fours';
  const altKey = kind === 'sixes' ? 'totalSixes' : 'totalFours';
  const ld = liveDetails || {};
  const teamId = team?.id;
  const ldTeam = (teamId && ld[teamId]) || {};
  // Prefer explicit team slot when caller also passes side hint via team._slot
  const slot = team?._slot; // 'team1' | 'team2'
  const ldSlot = slot ? (ld[slot] || {}) : {};

  const candidates = [
    team?.[key],
    team?.[altKey],
    ldSlot[key],
    ldTeam[key],
    ld[key], // only safe when single-team / batting context
  ];
  for (const c of candidates) {
    if (c != null && Number.isFinite(Number(c)) && Number(c) >= 0) return Number(c);
  }
  return null;
}

export function matchBoundaryCount(state, kind) {
  const ld = state?.liveDetails || {};
  const t1 = { ...(state?.team1 || {}), _slot: 'team1' };
  const t2 = { ...(state?.team2 || {}), _slot: 'team2' };
  const a = readBoundaryCount(t1, ld, kind);
  const b = readBoundaryCount(t2, ld, kind);
  if (a == null && b == null) return null;
  return (a || 0) + (b || 0);
}

/**
 * Expected final aggregate = live + remaining balls * rate (+ optional future innings).
 */
export function estimateExpectedBoundaries({
  liveCount,
  currentScore,
  ballsRemaining,
  format,
  kind, // 'fours' | 'sixes'
  futureInningsBalls = 0,
}) {
  const rates = boundaryRatesPerBall(format);
  const rate = kind === 'sixes' ? rates.six : rates.four;
  const live = liveCount != null && Number.isFinite(liveCount)
    ? Math.max(0, Number(liveCount))
    // Fallback only when feed has no boundary tally — soft estimate from runs.
    : Math.floor(Math.max(0, Number(currentScore) || 0) * (kind === 'sixes' ? 0.06 : 0.12));

  const remBalls = Math.max(0, Number(ballsRemaining) || 0);
  const futureBalls = Math.max(0, Number(futureInningsBalls) || 0);
  const expectedMore = (remBalls + futureBalls) * rate;
  return {
    live,
    expected: Math.max(live + 0.05, live + expectedMore),
    knownLive: liveCount != null && Number.isFinite(liveCount),
  };
}

/**
 * Build an OPEN or SETTLED O/U market for a live aggregate count.
 */
export function buildLiveAggregateOuMarket({
  marketId,
  marketType,
  name,
  liveCount,
  expected,
  overround,
  selectionPrefix,
  minStdDev = 1.5,
  varianceRatio = 1.2,
}) {
  const live = Math.max(0, Number(liveCount) || 0);
  const mean = Math.max(live + 0.05, Number(expected) || live + 0.05);
  // Line sits near projection but never below live (keeps market meaningful mid-match).
  let line = Math.floor(mean) + 0.5;
  if (line <= live) line = live + 0.5;

  if (live > line) {
    return createMarketDefinition({
      marketId,
      marketType,
      category: 'totals',
      name,
      status: 'SETTLED',
      line,
      selections: [
        { selectionId: `${selectionPrefix}_over`, name: `Over ${line}`, status: 'WON', bettable: false, odds: null, won: true },
        { selectionId: `${selectionPrefix}_under`, name: `Under ${line}`, status: 'LOST', bettable: false, odds: null, won: false },
      ],
    });
  }

  const { pOver, pUnder } = calculateOverUnderProbability(mean, line, varianceRatio, live, minStdDev);
  return createMarketDefinition({
    marketId,
    marketType,
    category: 'totals',
    name,
    status: 'OPEN',
    line,
    selections: [
      priceSelection({ selectionId: `${selectionPrefix}_over`, name: `Over ${line}`, probability: pOver, overround }),
      priceSelection({ selectionId: `${selectionPrefix}_under`, name: `Under ${line}`, probability: pUnder, overround }),
    ],
  });
}
