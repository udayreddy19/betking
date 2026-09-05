/**
 * OddsEngineV4 — team_total + match_total (P0).
 */

import {
  projectInningsTotal,
  projectMatchTotal,
  pickBalancedLine,
  normalOuFair,
} from '../models/ScoreDistributionEngine.mjs';
import { priceExclusive, DEFAULT_V4_MARGIN } from '../pricing/MarginPolicy.mjs';
import { ouMarket } from './helpers.mjs';

export function generateTotalMarkets(state, margins = DEFAULT_V4_MARGIN) {
  const overround = margins.totalsOverround ?? DEFAULT_V4_MARGIN.totalsOverround;
  const markets = [];

  if (state.status === 'COMPLETED' || state.phase === 'PREMATCH') {
    return markets;
  }

  const battingName = String(state.battingTeamId) === String(state.team1.id)
    ? state.team1.name
    : state.team2.name;

  const inn = projectInningsTotal(state);
  const innLine = pickBalancedLine(inn.mean);
  const innFair = normalOuFair(inn.mean, inn.sd, innLine);
  const teamTotal = ouMarket({
    marketId: 'team_total',
    marketType: 'TEAM_TOTAL',
    name: `${battingName} Total Runs`,
    line: innLine,
    pOver: innFair.pOver,
    pUnder: innFair.pUnder,
    overround,
    priceExclusive,
  });
  if (teamTotal) markets.push(teamTotal);

  const match = projectMatchTotal(state);
  const matchLine = pickBalancedLine(match.mean, 1);
  const matchFair = normalOuFair(match.mean, match.sd, matchLine);
  const matchTotal = ouMarket({
    marketId: 'match_total',
    marketType: 'MATCH_TOTAL',
    name: 'Total Match Runs',
    line: matchLine,
    pOver: matchFair.pOver,
    pUnder: matchFair.pUnder,
    overround,
    priceExclusive,
  });
  if (matchTotal) markets.push(matchTotal);

  return markets;
}
