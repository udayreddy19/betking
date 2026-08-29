import { fetchFootballMatches } from '../../providers/footballProvider.mjs';
import { fetchBasketballMatches } from '../../providers/basketballProvider.mjs';
import { fetchTennisMatches } from '../../providers/tennisProvider.mjs';
import { fetchHockeyMatches } from '../../providers/hockeyProvider.mjs';
import { fetchAmericanFootballMatches } from '../../providers/americanFootballProvider.mjs';
import { fetchFormula1Matches } from '../../providers/formula1Provider.mjs';
import { fetchMultiSportMatches } from '../../providers/multisportProvider.mjs';
import { normalizeTestResult } from '../result.mjs';
import { timed } from '../timeout.mjs';
import { summarizeSportsMatches } from '../summarize.mjs';

const FETCHERS = {
  football: fetchFootballMatches,
  basketball: fetchBasketballMatches,
  tennis: fetchTennisMatches,
  hockey: fetchHockeyMatches,
  'american-football': fetchAmericanFootballMatches,
  formula1: fetchFormula1Matches,
  multisport: fetchMultiSportMatches,
};

export async function testMockSportProvider(sportId) {
  const fetchFn = FETCHERS[sportId] || fetchFootballMatches;
  const { value, responseTimeMs } = await timed(() => fetchFn('live'));
  const summary = summarizeSportsMatches(value, sportId);
  return normalizeTestResult({
    success: true,
    statusCode: 200,
    responseTimeMs,
    mock: true,
    implementation: 'MOCK',
    healthStatus: 'HEALTHY',
    summary: {
      ...summary,
      mock: true,
      note: 'Hardcoded sample fixtures. This is not a live third-party sports API.',
    },
    data: summary,
  });
}
