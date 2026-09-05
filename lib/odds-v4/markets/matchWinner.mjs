/**
 * OddsEngineV4 — match winner (+ super over mirror).
 */

import { matchWinnerFairProbs } from '../models/WinExpectancyEngine.mjs';
import { priceTwoWay, DEFAULT_V4_MARGIN } from '../pricing/MarginPolicy.mjs';
import { createMarketDefinition, emitMarket } from './helpers.mjs';

export function generateMatchWinnerMarkets(state, margins = DEFAULT_V4_MARGIN) {
  const fair = matchWinnerFairProbs(state);
  const overround = margins.matchWinnerOverround ?? DEFAULT_V4_MARGIN.matchWinnerOverround;

  if (state.status === 'COMPLETED') {
    const t1Won = fair.pTeam1 > fair.pTeam2;
    return [
      emitMarket(createMarketDefinition({
        marketId: 'match_winner',
        marketType: 'MATCH_WINNER',
        name: 'Match Winner',
        status: 'SETTLED',
        selections: [
          {
            selectionId: `sel_${state.team1.id}`,
            name: state.team1.name,
            odds: t1Won ? 1.01 : 101,
            probability: fair.pTeam1,
            status: t1Won ? 'WON' : 'LOST',
          },
          {
            selectionId: `sel_${state.team2.id}`,
            name: state.team2.name,
            odds: t1Won ? 101 : 1.01,
            probability: fair.pTeam2,
            status: t1Won ? 'LOST' : 'WON',
          },
        ],
        overround,
      })),
    ].filter(Boolean);
  }

  const priced = priceTwoWay(
    state.team1.name,
    `sel_${state.team1.id}`,
    fair.pTeam1,
    state.team2.name,
    `sel_${state.team2.id}`,
    fair.pTeam2,
    overround,
  );

  if (priced.suspended || !priced.selections?.length) {
    return [
      emitMarket(createMarketDefinition({
        marketId: 'match_winner',
        marketType: 'MATCH_WINNER',
        name: 'Match Winner',
        status: 'SUSPENDED',
        selections: [],
        overround,
      })),
    ].filter(Boolean);
  }

  const winner = emitMarket(createMarketDefinition({
    marketId: 'match_winner',
    marketType: 'MATCH_WINNER',
    name: 'Match Winner',
    status: 'OPEN',
    selections: priced.selections,
    overround,
  }));

  const superOver = emitMarket(createMarketDefinition({
    marketId: 'match_winner_super_over',
    marketType: 'MATCH_WINNER',
    name: 'Winner (incl. Super Over)',
    status: 'OPEN',
    selections: priced.selections.map((s) => ({
      ...s,
      selectionId: s.selectionId.replace(/^sel_/, 'sel_so_'),
    })),
    overround,
  }));

  return [winner, superOver].filter(Boolean);
}
