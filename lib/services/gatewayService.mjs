/**
 * Master Gateway Service — Orchestrates sport-specific provider chains.
 */

import { fetchCricketMatches } from '../providers/cricketProvider.mjs';
import { fetchFootballMatches } from '../providers/footballProvider.mjs';
import { fetchBasketballMatches } from '../providers/basketballProvider.mjs';
import { fetchTennisMatches } from '../providers/tennisProvider.mjs';
import { fetchFormula1Matches } from '../providers/formula1Provider.mjs';
import { fetchHockeyMatches } from '../providers/hockeyProvider.mjs';
import { fetchAmericanFootballMatches } from '../providers/americanFootballProvider.mjs';
import { fetchMultiSportMatches } from '../providers/multisportProvider.mjs';

export async function fetchGatewaySportMatches(sport = 'cricket', type = 'live') {
  const sportKey = String(sport).toLowerCase().trim();

  if (sportKey === 'cricket') {
    return fetchCricketMatches(type);
  }
  if (sportKey === 'football' || sportKey === 'soccer') {
    return fetchFootballMatches(type);
  }
  if (sportKey === 'basketball') {
    return fetchBasketballMatches(type);
  }
  if (sportKey === 'tennis') {
    return fetchTennisMatches(type);
  }
  if (sportKey === 'formula1' || sportKey === 'f1') {
    return fetchFormula1Matches(type);
  }
  if (sportKey === 'hockey' || sportKey === 'nhl') {
    return fetchHockeyMatches(type);
  }
  if (sportKey === 'american-football' || sportKey === 'nfl' || sportKey === 'cfb') {
    return fetchAmericanFootballMatches(type);
  }
  if (sportKey === 'multi-sport' || sportKey === 'all') {
    return fetchMultiSportMatches(type);
  }

  // Fallback to Multi-Sport Gateway
  return fetchMultiSportMatches(type);
}
