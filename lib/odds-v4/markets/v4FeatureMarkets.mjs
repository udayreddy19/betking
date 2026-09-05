/**
 * OddsEngineV4 — additional settleable feature markets.
 * Patterns must match marketSettlementContract. Avoids V3 marketId collisions.
 */

import { getFormatRules, nextBallSlot } from '../../odds-v3/format/CricketFormatRules.mjs';
import { priceSelection, priceExclusiveSelections } from '../../odds-v3/pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../../odds-v3/models/MarketDefinition.mjs';
import { calculateOverUnderProbability } from '../../odds-v3/models/distributionModel.mjs';
import { lineScopedSelectionId } from '../../odds-v3/lineIdentity.mjs';
import { applySideHouseBias } from '../v4HouseProtect.mjs';
import { expectedRemainingRuns } from '../models/resourceTables.mjs';
import { applyMomentumToExpected } from '../models/MomentumEngine.mjs';

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function ordinal(n) {
  const v = Number(n) || 0;
  const m = v % 100;
  if (m >= 11 && m <= 13) return `${v}th`;
  switch (v % 10) {
    case 1: return `${v}st`;
    case 2: return `${v}nd`;
    case 3: return `${v}rd`;
    default: return `${v}th`;
  }
}

function ou({ marketId, marketType, name, line, pOver, overround, maxOverOdds, category }) {
  const p = clamp(applySideHouseBias(pOver), 0.03, 0.95);
  return createMarketDefinition({
    marketId,
    marketType,
    category,
    name,
    status: 'OPEN',
    line,
    overround,
    selections: [
      priceSelection({
        selectionId: lineScopedSelectionId('over', line),
        name: 'Over',
        probability: p,
        overround,
        maxOdds: p < 0.42 ? undefined : maxOverOdds,
      }),
      priceSelection({
        selectionId: lineScopedSelectionId('under', line),
        name: 'Under',
        probability: 1 - p,
        overround,
      }),
    ],
  });
}

/**
 * @param {object} state
 * @param {object} marginConfig
 * @param {object|null} momentum
 * @param {Set<string>} [existingIds]
 */
export function generateV4FeatureMarkets(state, marginConfig = {}, momentum = null, existingIds = null) {
  if (!state || state.status !== 'LIVE') return [];
  const taken = existingIds instanceof Set ? existingIds : new Set();
  const markets = [];
  const push = (m) => {
    if (!m?.marketId || taken.has(m.marketId)) return;
    taken.add(m.marketId);
    markets.push(m);
  };

  const rules = getFormatRules(state.format) || getFormatRules('T20');
  const ballsPerOver = rules.ballsPerOver || 6;
  const overround = (marginConfig.liveTeamTotalOverround ?? 0.16) + (momentum?.marginBump || 0);
  const maxOverOdds = marginConfig.maxLiveTotalOverOdds ?? 1.48;
  const batting = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const inn = (Number(state.currentInnings) || 1) >= 2 ? 2 : 1;
  const currentBalls = Number(state.ballsCompleted) || 0;
  if (currentBalls >= Number(state.ballsPerInnings || rules.ballsPerInnings)) return markets;

  const slot = nextBallSlot(currentBalls, ballsPerOver);
  const wickets = Number(batting.wickets) || 0;
  const wicketsRemaining = Math.max(1, (rules.maxWickets || 10) - wickets);
  const score = Number(batting.runs) || 0;

  let rpb = expectedRemainingRuns({
    format: state.format,
    wicketsInHand: wicketsRemaining,
    ballsRemaining: Math.max(6, Number(state.ballsRemaining) || 6),
    ballsPerInnings: state.ballsPerInnings,
  }) / Math.max(6, Number(state.ballsRemaining) || 6);
  rpb = applyMomentumToExpected(rpb, momentum) * (marginConfig.resourceRunsHaircut ?? 0.93);

  // Next+1 dismissal total (V3 already emits next dismissal)
  if (wickets + 1 < (rules.maxWickets || 10) && Number(state.ballsRemaining) >= 12) {
    const wicketNum = wickets + 2;
    const meanAtWicket = score + rpb * clamp(22 + wickets * 2, 14, 40);
    const line = Math.floor(meanAtWicket) + 0.5;
    if (line > score + 1) {
      const fair = calculateOverUnderProbability(meanAtWicket, Math.max(10, meanAtWicket * 0.1), line);
      push(ou({
        marketId: `i${inn}_team_score_at_${wicketNum}_dismissal`,
        marketType: 'TEAM_SCORE_AT_DISMISSAL',
        category: 'wickets',
        name: `${batting.name} Score At ${ordinal(wicketNum)} Wicket`,
        line,
        pOver: fair.pOver,
        overround,
        maxOverOdds,
      }));
    }
  }

  // Forward overs milestones (+2 / +3 / +5 from current over)
  if (Number(state.ballsRemaining) >= 18) {
    const curOver = slot.overNum;
    const inningsOvers = Math.floor(Number(state.ballsPerInnings || rules.ballsPerInnings) / ballsPerOver);
    for (const add of [2, 3, 5]) {
      const targetOvers = curOver + add;
      if (targetOvers >= inningsOvers) continue;
      const remBalls = targetOvers * ballsPerOver - currentBalls;
      if (remBalls < 6) continue;
      const mean = score + rpb * remBalls;
      const line = Math.floor(mean) + 0.5;
      const fair = calculateOverUnderProbability(mean, Math.max(6, Math.sqrt(remBalls) * 1.3), line);
      push(ou({
        marketId: `i${inn}_overs_0_${targetOvers}_total`,
        marketType: 'OVER_TOTAL',
        category: 'overs',
        name: `Innings Overs 0-${targetOvers} Total`,
        line,
        pOver: fair.pOver,
        overround,
        maxOverOdds,
      }));
    }
  }

  // Next over odd/even
  if (state.hasBallFeed !== false && Number(state.ballsRemaining) >= 6) {
    const nextOver = slot.currentOverComplete
      ? slot.overNum + 1
      : (slot.nextOverNum || slot.overNum + 1);
    const pOdd = clamp(0.48 + (momentum?.phase === 'death' ? 0.02 : 0), 0.4, 0.58);
    const priced = priceExclusiveSelections([
      { selectionId: 'sel_nov_odd', name: 'Odd', probability: pOdd },
      { selectionId: 'sel_nov_even', name: 'Even', probability: 1 - pOdd },
    ], overround);
    if (!priced.suspended) {
      push(createMarketDefinition({
        marketId: `i${inn}_next_over_${nextOver}_odd_even`,
        marketType: 'NEXT_OVER_OE',
        category: 'overs',
        name: `Next Over (${nextOver}) Odd/Even`,
        status: 'OPEN',
        overround,
        selections: priced.selections,
      }));
    }
  }

  // Death: wicket in over+2
  if (momentum?.phase === 'death' && wicketsRemaining > 0 && Number(state.ballsRemaining) >= 12) {
    const overAhead = slot.overNum + 2;
    const pWicket = clamp(0.18 + (10 - wicketsRemaining) * 0.03, 0.12, 0.5);
    const pYes = applySideHouseBias(pWicket);
    const priced = priceExclusiveSelections([
      { selectionId: 'sel_wkt_yes', name: 'Yes', probability: pYes },
      { selectionId: 'sel_wkt_no', name: 'No', probability: 1 - pYes },
    ], overround);
    if (!priced.suspended) {
      push(createMarketDefinition({
        marketId: `i${inn}_wicket_in_next_over_${overAhead}`,
        marketType: 'WICKET',
        category: 'wickets',
        name: `Wicket In Over ${overAhead}`,
        status: 'OPEN',
        overround,
        selections: priced.selections,
      }));
    }
  }

  return markets;
}
