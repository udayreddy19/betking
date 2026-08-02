/**
 * Unified match detail fetcher — routes to Cricbuzz, ESPN, or FanCode by source.
 */
import {
  fetchCricbuzzMatchDetailCached,
  fetchCricbuzzMatchDetailFast,
} from './cricbuzzMatchDetail.mjs';
import { fetchCricbuzzScorecard } from './cricbuzzScorecard.mjs';
import { fetchCricbuzzComm } from './cricbuzzComm.mjs';
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

function mergeLiveDetails(base = {}, comm = {}, html = {}) {
  const commLd = comm.liveDetails || {};
  const htmlLd = html.liveDetails || {};

  return {
    ...htmlLd,
    ...commLd,
    batter1: commLd.batter1 || htmlLd.batter1,
    batter2: commLd.batter2 || htmlLd.batter2,
    bowler: commLd.bowler || htmlLd.bowler,
    commentary: commLd.commentary || htmlLd.commentary,
    currentOverBalls: commLd.currentOverBalls?.length
      ? commLd.currentOverBalls
      : htmlLd.currentOverBalls,
    runs: commLd.runs ?? htmlLd.runs ?? htmlLd.firstRuns,
    wickets: commLd.wickets ?? htmlLd.wickets ?? htmlLd.firstWickets,
    overs: commLd.overs || htmlLd.overs || htmlLd.firstOvers,
    firstRuns: commLd.firstRuns ?? htmlLd.firstRuns,
    firstWickets: commLd.firstWickets ?? htmlLd.firstWickets,
    firstOvers: commLd.firstOvers || htmlLd.firstOvers,
    chaseRuns: htmlLd.chaseRuns,
    chaseWickets: htmlLd.chaseWickets,
    chaseOvers: htmlLd.chaseOvers,
    chaseBallNbr: commLd.ballNbr ?? htmlLd.chaseBallNbr,
  };
}

async function fetchCricbuzzCricketDetail(matchId, { fast = false } = {}) {
  const commP = fetchCricbuzzComm(matchId);
  const scorecardP = fetchCricbuzzScorecard(matchId).catch(() => null);
  const htmlP = fast
    ? fetchCricbuzzMatchDetailFast(matchId).catch(() => null)
    : fetchCricbuzzMatchDetailCached(matchId, { fast: false }).catch(() => null);

  const [comm, scorecard, htmlDetail] = await Promise.all([commP, scorecardP, htmlP]);

  const base = htmlDetail || { matchId, liveDetails: {}, fetchedAt: new Date().toISOString() };
  const commData = comm || { liveDetails: {}, overHistory: [] };

  const detail = {
    ...base,
    matchId,
    fetchedAt: new Date().toISOString(),
    liveDetails: mergeLiveDetails(base, commData, htmlDetail || {}),
    overHistory: commData.overHistory || [],
    isLive: commData.isLive ?? base.isLive,
    matchHeader: commData.matchHeader || base.matchHeader,
  };

  if (scorecard?.teams?.length) {
    detail.squads = scorecard.teams;
    detail.scorecardInnings = scorecard.innings;
  }

  return detail;
}

export async function fetchMatchDetail(match, { fast = false } = {}) {
  if (!match) throw new Error('match required');

  const sport = match.sport;
  const cricbuzzId = resolveCricbuzzId(match);

  if (cricbuzzId && (sport === 'cricket' || sport === 'virtual-cricket' || match.source === 'cricbuzz')) {
    const detail = await fetchCricbuzzCricketDetail(cricbuzzId, { fast });
    if (!detail?.liveDetails && !detail?.squads) return null;
    return { ...detail, sport, source: 'cricbuzz' };
  }

  if (match.source === 'espn' || match.id?.startsWith('api_')) {
    const detail = await fetchEspnMatchDetail(match);
    if (detail) return detail;
  }

  if (match.fancodeMatchId) {
    return null;
  }

  return null;
}
