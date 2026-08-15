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

export function generateExtendedWicketMarkets(state, validation = {}, marginConfig = {}) {
  const overround = marginConfig.liveTeamTotalOverround || 0.055;
  const battingTeam = state.battingTeamId === state.team1.id ? state.team1 : state.team2;
  const currentWkts = battingTeam.wickets || 0;
  const nextWktNum = currentWkts + 1;

  const markets = [];

  // 1. Method of Next Wicket
  markets.push(createMarketDefinition({
    marketId: `method_of_next_wicket_${nextWktNum}`,
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

  // 2. Wicket In Current Over
  const pCurrWkt = calculateWicketInOverProbability(6 - ((state.ballsCompleted || 0) % 6), currentWkts);
  markets.push(createMarketDefinition({
    marketId: 'wicket_in_current_over',
    marketType: 'WICKET_IN_CURRENT_OVER',
    category: 'wickets',
    name: 'Wicket In Current Over',
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_cwkt_yes', name: 'Yes', probability: pCurrWkt, overround }),
      priceSelection({ selectionId: 'sel_cwkt_no', name: 'No', probability: 1.0 - pCurrWkt, overround }),
    ],
  }));

  // 3. Wicket In Next Over
  const pNextWkt = calculateWicketInOverProbability(6, currentWkts);
  markets.push(createMarketDefinition({
    marketId: 'wicket_in_next_over',
    marketType: 'WICKET_IN_NEXT_OVER',
    category: 'wickets',
    name: 'Wicket In Next Over',
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_nwkt_yes', name: 'Yes', probability: pNextWkt, overround }),
      priceSelection({ selectionId: 'sel_nwkt_no', name: 'No', probability: 1.0 - pNextWkt, overround }),
    ],
  }));

  // 4. Team Score at Next Dismissal — dynamically calculated from current runs and average partnership expectation
  const currentRuns = battingTeam.runs || 0;
  const expectedRunsAtDismissal = currentRuns + Math.max(15, 25 - (currentWkts * 2));
  const lineAtDismissal = Math.floor(expectedRunsAtDismissal) + 0.5;
  const { pOver: pDisOver, pUnder: pDisUnder } = calculateOverUnderProbability(expectedRunsAtDismissal, lineAtDismissal);

  markets.push(createMarketDefinition({
    marketId: `team_score_at_${nextWktNum}_dismissal`,
    marketType: 'TEAM_SCORE_AT_DISMISSAL',
    category: 'wickets',
    name: `${battingTeam.name} Total at ${nextWktNum}${nextWktNum === 1 ? 'st' : (nextWktNum === 2 ? 'nd' : (nextWktNum === 3 ? 'rd' : 'th'))} Dismissal`,
    status: 'OPEN',
    line: lineAtDismissal,
    selections: [
      priceSelection({ selectionId: 'sel_dis_over', name: `Over ${lineAtDismissal}`, probability: pDisOver, overround }),
      priceSelection({ selectionId: 'sel_dis_under', name: `Under ${lineAtDismissal}`, probability: pDisUnder, overround }),
    ],
  }));

  return markets;
}
