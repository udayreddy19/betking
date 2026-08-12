/**
 * OddsEngineV3 — Master Market Registry
 * 
 * Authoritative central registry of all 30+ dynamic live cricket market templates.
 * Defines market types, categories, generator functions, eligibility conditions, and settlement rules.
 */

import { generateMatchWinnerMarket } from '../markets/MatchWinnerMarket.mjs';
import { generateTeamTotalMarket } from '../markets/TeamTotalMarket.mjs';
import { generateMatchTotalMarket } from '../markets/MatchTotalMarket.mjs';
import { generateOverTotalMarket } from '../markets/OverTotalMarket.mjs';
import { generateSegmentTotalMarket } from '../markets/SegmentTotalMarket.mjs';
import { generatePlayerPropsMarket } from '../markets/PlayerPropsMarket.mjs';
import { generateExtendedMatchMarkets } from '../markets/matchWinner.mjs';
import { generateExtendedMatchTotals } from '../markets/matchTotals.mjs';
import { generateExtendedInningsTotals } from '../markets/inningsTotal.mjs';
import { generateExtendedOverMarkets } from '../markets/overTotal.mjs';
import { generateExtendedDeliveryMarkets } from '../markets/deliveryTotal.mjs';
import { generateExtendedWicketMarkets } from '../markets/wicketMarkets.mjs';
import { generateExtendedPlayerMarkets } from '../markets/playerRuns.mjs';
import { generateExtendedH2HMarkets } from '../markets/headToHead.mjs';

export const MARKET_CATEGORIES = {
  MAIN: 'main',
  TOTALS: 'totals',
  OVERS: 'overs',
  DELIVERIES: 'deliveries',
  WICKETS: 'wickets',
  PLAYER_PROPS: 'player_props',
  H2H: 'h2h',
};

export const MARKET_REGISTRY = [
  // Group 1 — Match Markets
  { key: 'MATCH_WINNER', category: MARKET_CATEGORIES.MAIN, name: 'Match Winner', generator: generateMatchWinnerMarket },
  { key: 'EXTENDED_MATCH_MARKETS', category: MARKET_CATEGORIES.MAIN, name: 'Extended Match Markets', generator: generateExtendedMatchMarkets },

  // Group 2 — Match Totals
  { key: 'MATCH_TOTAL', category: MARKET_CATEGORIES.TOTALS, name: 'Total Match Runs', generator: generateMatchTotalMarket },
  { key: 'EXTENDED_MATCH_TOTALS', category: MARKET_CATEGORIES.TOTALS, name: 'Extended Match Totals', generator: generateExtendedMatchTotals },

  // Group 3 — Innings Totals
  { key: 'TEAM_TOTAL', category: MARKET_CATEGORIES.TOTALS, name: 'Team Total Runs', generator: generateTeamTotalMarket },
  { key: 'EXTENDED_INNINGS_TOTALS', category: MARKET_CATEGORIES.TOTALS, name: 'Extended Innings Totals', generator: generateExtendedInningsTotals },

  // Group 4 — Over Markets
  { key: 'OVER_TOTAL', category: MARKET_CATEGORIES.OVERS, name: 'Over Total Runs', generator: generateOverTotalMarket },
  { key: 'SEGMENT_TOTAL', category: MARKET_CATEGORIES.OVERS, name: 'Segment Total Runs', generator: generateSegmentTotalMarket },
  { key: 'EXTENDED_OVER_MARKETS', category: MARKET_CATEGORIES.OVERS, name: 'Extended Over Markets', generator: generateExtendedOverMarkets },

  // Group 5 — Delivery Markets
  { key: 'EXTENDED_DELIVERY_MARKETS', category: MARKET_CATEGORIES.DELIVERIES, name: 'Extended Delivery Markets', generator: generateExtendedDeliveryMarkets },

  // Group 6 — Wicket Markets
  { key: 'EXTENDED_WICKET_MARKETS', category: MARKET_CATEGORIES.WICKETS, name: 'Extended Wicket Markets', generator: generateExtendedWicketMarkets },

  // Group 7 — Player Markets
  { key: 'PLAYER_PROPS', category: MARKET_CATEGORIES.PLAYER_PROPS, name: 'Player Total Runs', generator: generatePlayerPropsMarket },
  { key: 'EXTENDED_PLAYER_MARKETS', category: MARKET_CATEGORIES.PLAYER_PROPS, name: 'Extended Player Markets', generator: generateExtendedPlayerMarkets },

  // Group 8 — Head-To-Head Markets
  { key: 'EXTENDED_H2H_MARKETS', category: MARKET_CATEGORIES.H2H, name: 'Batter Head-To-Head', generator: generateExtendedH2HMarkets },
];
