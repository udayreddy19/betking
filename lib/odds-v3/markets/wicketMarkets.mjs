/**
 * OddsEngineV3 — Extended Wicket Markets (Group 6)
 * 
 * Generates:
 * 1. Next Wicket (Fallen Team / Over / Batter)
 * 2. Method of Next Wicket (Caught, Bowled, LBW, Run Out, Other)
 * 3. Wicket In Current Over (Yes/No)
 * 4. Wicket In Next Over (Yes/No)
 * 5. Team Total at Next Dismissal (e.g. 1st Innings 2nd Dismissal Total)
 */

import { DISMISSAL_METHOD_PROBABILITIES, calculateWicketInOverProbability } from '../models/wicketModel.mjs';
import { calculateOverUnderProbability } from '../models/distributionModel.mjs';
import { priceSelection } from '../pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../models/MarketDefinition.mjs';
import { getFormatRules, nextBallSlot } from '../format/CricketFormatRules.mjs';
import { lineScopedSelectionId } from '../lineIdentity.mjs';

export function generateExtendedWicketMarkets(state, validation = {}, marginConfig = {}) {
  const overround = marginConfig.liveTeamTotalOverround || 0.055;
  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const fieldingTeam = state.battingTeamId === state.team1.id ? state.team2 : state.team1;
  const rules = getFormatRules(state.format) || getFormatRules('T20');
  const maxWkts = rules.maxWickets || 10;
  const inningsNum = (Number(state.currentInnings) || 1) >= 2 ? 2 : 1;

  // Prefer chase-slot wickets in innings 2 — card/first-innings wickets (e.g. 9) must not
  // invent "10th dismissal" while the chase is 4 down.
  let currentWkts = Number(battingTeam.wickets) || 0;
  if (inningsNum >= 2) {
    const chaseW = Number(
      state.liveDetails?.chaseWickets
      ?? state.liveDetails?.wickets2
      ?? state.liveDetails?.wickets,
    );
    const firstW = Number(state.liveDetails?.firstWickets ?? state.liveDetails?.wickets1);
    if (Number.isFinite(chaseW) && chaseW >= 0 && chaseW < maxWkts) {
      if (!Number.isFinite(firstW) || currentWkts === firstW || currentWkts > chaseW) {
        currentWkts = chaseW;
      }
    }
    // Never treat the bowling side's completed-innings wickets as the chase tally.
    if (Number(fieldingTeam?.wickets) === currentWkts && Number(battingTeam?.runs) < Number(fieldingTeam?.runs)) {
      const alt = Number(state.liveDetails?.chaseWickets);
      if (Number.isFinite(alt) && alt >= 0) currentWkts = alt;
    }
  }
  currentWkts = Math.max(0, Math.min(maxWkts, currentWkts));
  const nextWktNum = currentWkts + 1;
  const ballsPerOver = rules.ballsPerOver || 6;
  const slot = nextBallSlot(state.ballsCompleted || 0, ballsPerOver);
  const ballsLeftInCurrentOver = slot.currentOverComplete
    ? 0
    : ballsPerOver - ((state.ballsCompleted || 0) % ballsPerOver);

  const markets = [];

  if (currentWkts >= maxWkts) return markets;

  // 1. Method of Next Wicket — only the immediate next wicket number
  markets.push(createMarketDefinition({
    marketId: `i${inningsNum}_method_of_next_wicket_${nextWktNum}`,
    marketType: 'METHOD_OF_NEXT_WICKET',
    category: 'wickets',
    name: `${battingTeam.name} ${nextWktNum}${nextWktNum === 1 ? 'st' : (nextWktNum === 2 ? 'nd' : (nextWktNum === 3 ? 'rd' : 'th'))} Dismissal Method`,
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_dis_caught', name: 'Caught', probability: DISMISSAL_METHOD_PROBABILITIES.CAUGHT, overround }),
      priceSelection({ selectionId: 'sel_dis_bowled', name: 'Bowled', probability: DISMISSAL_METHOD_PROBABILITIES.BOWLED, overround }),
      priceSelection({ selectionId: 'sel_dis_lbw', name: 'LBW', probability: DISMISSAL_METHOD_PROBABILITIES.LBW, overround }),
      priceSelection({ selectionId: 'sel_dis_runout', name: 'Run Out', probability: DISMISSAL_METHOD_PROBABILITIES.RUN_OUT, overround }),
      priceSelection({ selectionId: 'sel_dis_other', name: 'Stumped / Other', probability: DISMISSAL_METHOD_PROBABILITIES.STUMPED_OTHER, overround }),
    ],
  }));

  // 2. Wicket In Current Over — skip when the over just finished (0 balls left)
  // or a wicket already fell this over (market is decided)
  const currentOverBalls = state.currentOverBalls || state.liveDetails?.currentOverBalls || [];
  const wicketAlreadyThisOver = Array.isArray(currentOverBalls)
    && currentOverBalls.some((b) => /^W$/i.test(String(b)) || String(b).toLowerCase() === 'w');
  if (ballsLeftInCurrentOver > 0 && !wicketAlreadyThisOver) {
    const pCurrWkt = calculateWicketInOverProbability(ballsLeftInCurrentOver, currentWkts);
    markets.push(createMarketDefinition({
      marketId: `i${inningsNum}_wicket_in_over_${slot.overNum}`,
      marketType: 'WICKET_IN_CURRENT_OVER',
      category: 'wickets',
      name: 'Wicket In Current Over',
      status: 'OPEN',
      selections: [
        priceSelection({ selectionId: 'sel_cwkt_yes', name: 'Yes', probability: pCurrWkt, overround }),
        priceSelection({ selectionId: 'sel_cwkt_no', name: 'No', probability: 1.0 - pCurrWkt, overround }),
      ],
    }));
  } else if (wicketAlreadyThisOver && ballsLeftInCurrentOver > 0) {
    markets.push(createMarketDefinition({
      marketId: `i${inningsNum}_wicket_in_over_${slot.overNum}`,
      marketType: 'WICKET_IN_CURRENT_OVER',
      category: 'wickets',
      name: 'Wicket In Current Over',
      status: 'SETTLED',
      determined: true,
      result: 'Yes',
      selections: [
        { selectionId: 'sel_cwkt_yes', name: 'Yes', status: 'WON', bettable: false, odds: null, won: true },
        { selectionId: 'sel_cwkt_no', name: 'No', status: 'LOST', bettable: false, odds: null, won: false },
      ],
    }));
  }

  // 3. Wicket In Next Over — only while that over still exists in the innings
  if (slot.nextOverNum <= (rules.ballsPerInnings / ballsPerOver)
    && (state.ballsCompleted || 0) < rules.ballsPerInnings) {
    const pNextWkt = calculateWicketInOverProbability(ballsPerOver, currentWkts);
    markets.push(createMarketDefinition({
      marketId: `i${inningsNum}_wicket_in_next_over_${slot.nextOverNum}`,
      marketType: 'WICKET_IN_NEXT_OVER',
      category: 'wickets',
      name: 'Wicket In Next Over',
      status: 'OPEN',
      selections: [
        priceSelection({ selectionId: 'sel_nwkt_yes', name: 'Yes', probability: pNextWkt, overround }),
        priceSelection({ selectionId: 'sel_nwkt_no', name: 'No', probability: 1.0 - pNextWkt, overround }),
      ],
    }));
  }
  // 4. Team Score at Next Dismissal — innings-scoped; only while that wicket has not fallen
  if (currentWkts < maxWkts) {
    const currentRuns = battingTeam.runs || 0;
    const expectedRunsAtDismissal = currentRuns + Math.max(15, 25 - (currentWkts * 2));
    const lineAtDismissal = Math.floor(expectedRunsAtDismissal) + 0.5;
    const { pOver: pDisOver, pUnder: pDisUnder } = calculateOverUnderProbability(expectedRunsAtDismissal, lineAtDismissal);

    markets.push(createMarketDefinition({
      marketId: `i${inningsNum}_team_score_at_${nextWktNum}_dismissal`,
      marketType: 'TEAM_SCORE_AT_DISMISSAL',
      category: 'wickets',
      name: `${battingTeam.name} Total at ${nextWktNum}${nextWktNum === 1 ? 'st' : (nextWktNum === 2 ? 'nd' : (nextWktNum === 3 ? 'rd' : 'th'))} Dismissal`,
      status: 'OPEN',
      line: lineAtDismissal,
      selections: [
        priceSelection({ selectionId: lineScopedSelectionId('over', lineAtDismissal), name: `Over ${lineAtDismissal}`, probability: pDisOver, overround }),
        priceSelection({ selectionId: lineScopedSelectionId('under', lineAtDismissal), name: `Under ${lineAtDismissal}`, probability: pDisUnder, overround }),
      ],
    }));
  }

  return markets;
}
