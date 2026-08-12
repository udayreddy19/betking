/**
 * OddsEngineV3 — Extended Delivery Markets (Group 5)
 * 
 * Generates:
 * 1. Next Delivery Runs (0, 1, 2, 3, 4, 6, Wicket)
 * 2. Next Delivery Over/Under (0.5 / 1.5)
 * 3. Next Delivery Odd/Even
 * 4. Next Delivery Boundary (Yes/No)
 * 5. Next Delivery Wicket (Yes/No)
 * 6. Next Delivery Extra (Yes/No)
 */

import { priceSelection } from '../pricing/OddsCalculator.mjs';
import { createMarketDefinition } from '../models/MarketDefinition.mjs';

export function generateExtendedDeliveryMarkets(state, validation = {}, marginConfig = {}) {
  const overround = marginConfig.liveTeamTotalOverround || 0.06;
  const currentBalls = state.ballsCompleted || 0;
  const nextBallNum = (currentBalls % 6) + 1;
  const currentOverNum = Math.floor(currentBalls / 6) + 1;

  const markets = [];

  // 1. Next Delivery Runs
  markets.push(createMarketDefinition({
    marketId: `next_delivery_runs_${currentOverNum}_${nextBallNum}`,
    marketType: 'NEXT_DELIVERY_RUNS',
    category: 'deliveries',
    name: `Over ${currentOverNum} Ball ${nextBallNum} - Delivery Result`,
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_del_0', name: '0 Runs (Dot)', probability: 0.35, overround }),
      priceSelection({ selectionId: 'sel_del_1', name: '1 Run', probability: 0.38, overround }),
      priceSelection({ selectionId: 'sel_del_2', name: '2 Runs', probability: 0.08, overround }),
      priceSelection({ selectionId: 'sel_del_4', name: '4 Runs (Four)', probability: 0.11, overround }),
      priceSelection({ selectionId: 'sel_del_6', name: '6 Runs (Six)', probability: 0.05, overround }),
      priceSelection({ selectionId: 'sel_del_w', name: 'Wicket', probability: 0.03, overround }),
    ],
  }));

  // 2. Next Delivery Over / Under 0.5
  markets.push(createMarketDefinition({
    marketId: `next_delivery_ou_${currentOverNum}_${nextBallNum}`,
    marketType: 'NEXT_DELIVERY_OU',
    category: 'deliveries',
    name: `Over ${currentOverNum} Ball ${nextBallNum} - Total Runs`,
    status: 'OPEN',
    line: 0.5,
    selections: [
      priceSelection({ selectionId: 'sel_del_over_05', name: 'Over 0.5', probability: 0.65, overround }),
      priceSelection({ selectionId: 'sel_del_under_05', name: 'Under 0.5', probability: 0.35, overround }),
    ],
  }));

  // 3. Next Delivery Boundary (Yes/No)
  markets.push(createMarketDefinition({
    marketId: `next_delivery_boundary_${currentOverNum}_${nextBallNum}`,
    marketType: 'NEXT_DELIVERY_BOUNDARY',
    category: 'deliveries',
    name: `Over ${currentOverNum} Ball ${nextBallNum} - Boundary Scored`,
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_bnd_yes', name: 'Yes', probability: 0.16, overround }),
      priceSelection({ selectionId: 'sel_bnd_no', name: 'No', probability: 0.84, overround }),
    ],
  }));

  // 4. Next Delivery Wicket (Yes/No)
  markets.push(createMarketDefinition({
    marketId: `next_delivery_wicket_${currentOverNum}_${nextBallNum}`,
    marketType: 'NEXT_DELIVERY_WICKET',
    category: 'deliveries',
    name: `Over ${currentOverNum} Ball ${nextBallNum} - Wicket Fallen`,
    status: 'OPEN',
    selections: [
      priceSelection({ selectionId: 'sel_wkt_yes', name: 'Yes', probability: 0.04, overround }),
      priceSelection({ selectionId: 'sel_wkt_no', name: 'No', probability: 0.96, overround }),
    ],
  }));

  return markets;
}
