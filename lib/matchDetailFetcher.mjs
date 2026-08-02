/**
 * Unified match detail fetcher — routes to Cricbuzz, ESPN, or FanCode by source.
 */
import {
  fetchCricbuzzMatchDetailCached,
  fetchCricbuzzMatchDetailFast,
} from './cricbuzzMatchDetail.mjs';
import { fetchCricbuzzScorecard } from './cricbuzzScorecard.mjs';
import { fetchEspnMatchDetail } from './espnMatchDetail.mjs';

function resolveCricbuzzId(match) {
  return match.cricbuzzMatchId
    || (match.id?.startsWith('cb_') ? match.id.replace('cb_', '') : null);
}

export function canFetchMatchDetail(match) {
  if (!match) return false;
  if (resolveCricbuzzId(match)) return true;
  if (match.source === 'espn' || match.id?.startsWith('api_')) return true;
  if (match.fancodeMatchId) return true;
  return false;
}

export async function fetchMatchDetail(match, { fast = false } = {}) {
  if (!match) throw new Error('match required');

  const sport = match.sport;
  const cricbuzzId = resolveCricbuzzId(match);

  if (cricbuzzId && (sport === 'cricket' || sport === 'virtual-cricket' || match.source === 'cricbuzz')) {
    const detail = fast
      ? await fetchCricbuzzMatchDetailFast(cricbuzzId)
      : await fetchCricbuzzMatchDetailCached(cricbuzzId, { fast: false });

    if (!fast && detail) {
      const scorecard = await fetchCricbuzzScorecard(cricbuzzId).catch(() => null);
      if (scorecard?.teams?.length) {
        detail.squads = scorecard.teams;
        detail.scorecardInnings = scorecard.innings;
      }
    }

    return { ...detail, sport, source: 'cricbuzz' };
  }

  if (match.source === 'espn' || match.id?.startsWith('api_')) {
    const detail = await fetchEspnMatchDetail(match);
    if (detail) return detail;
  }

  if (match.fancodeMatchId) {
    // FanCode live scores come from list API; return null to use aggregator refresh
    return null;
  }

  return null;
}
