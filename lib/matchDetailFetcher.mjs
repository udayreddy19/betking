/**
 * Unified match detail fetcher — routes to Cricbuzz, ESPN, or FanCode by source.
 */
import {
  fetchCricbuzzMatchDetailCached,
  fetchCricbuzzMatchDetailFast,
} from './cricbuzzMatchDetail.mjs';
import { fetchCricbuzzScorecard, enrichLivePlayersFromScorecard } from './cricbuzzScorecard.mjs';
import { fetchCricbuzzComm } from './cricbuzzComm.mjs';
import { fetchEspnMatchDetail } from './espnMatchDetail.mjs';
import { getIplSrlMatches, getIplSrlMatchById } from './iplSrlSimulator.mjs';

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

function mergeLiveDetails(_base = {}, comm = {}, html = {}) {
  const commLd = comm.liveDetails || {};
  const htmlLd = html.liveDetails || {};

  // Comm API is the live source of truth; HTML is fallback only.
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
    runs: commLd.runs ?? htmlLd.runs,
    wickets: commLd.wickets ?? htmlLd.wickets,
    overs: commLd.overs || htmlLd.overs || htmlLd.firstOvers,
    score2: commLd.score2 ?? htmlLd.score2,
    wickets2: commLd.wickets2 ?? htmlLd.wickets2,
    overs2: commLd.overs2 || htmlLd.overs2,
    firstRuns: commLd.firstRuns ?? htmlLd.firstRuns,
    firstWickets: commLd.firstWickets ?? htmlLd.firstWickets,
    firstOvers: commLd.firstOvers || htmlLd.firstOvers,
    firstTeamName: commLd.firstTeamName || htmlLd.firstTeamName,
    chaseRuns: commLd.chaseRuns ?? htmlLd.chaseRuns,
    chaseWickets: commLd.chaseWickets ?? htmlLd.chaseWickets,
    chaseOvers: commLd.chaseOvers || htmlLd.chaseOvers,
    chaseTeamName: commLd.chaseTeamName || htmlLd.chaseTeamName,
    chaseBallNbr: commLd.chaseBallNbr ?? htmlLd.chaseBallNbr,
    inningsId: commLd.inningsId ?? htmlLd.inningsId,
  };
}

function isLiveFromSources(comm, htmlDetail, liveDetails) {
  if (comm?.isLive === true) return true;
  if (htmlDetail?.isLive === true) return true;
  const state = String(
    comm?.matchHeader?.state
    || htmlDetail?.matchHeader?.state
    || liveDetails?.commentary
    || '',
  ).toLowerCase();
  if (state.includes('progress') || state.includes('innings break') || state === 'live') {
    return true;
  }
  return comm?.isLive ?? htmlDetail?.isLive;
}

/** Hundred APIs often send misleading overs; ballNbr (0–100) is authoritative. */
function applyHundredBallNbrOvers(liveDetails, matchHeader, match) {
  const format = matchHeader?.matchFormat || match?.matchType || '';
  const series = matchHeader?.seriesName || match?.seriesName || match?.league || '';
  if (!/hun/i.test(String(format)) && !/hundred/i.test(String(series))) {
    return liveDetails;
  }

  const next = { ...liveDetails };

  // Only rewrite the *current* innings overs from chaseBallNbr.
  // First-innings overs must come from scorecard inningsId=1, not the chase ball count.
  if (next.chaseRuns != null && next.chaseBallNbr != null && next.chaseBallNbr > 0) {
    const oversFromBalls = `${Math.floor(next.chaseBallNbr / 5)}.${next.chaseBallNbr % 5}`;
    next.chaseOvers = oversFromBalls;
    next.overs2 = oversFromBalls;
  } else if (next.chaseRuns == null && next.chaseBallNbr != null && next.chaseBallNbr > 0) {
    const oversFromBalls = `${Math.floor(next.chaseBallNbr / 5)}.${next.chaseBallNbr % 5}`;
    next.firstOvers = oversFromBalls;
    next.overs = oversFromBalls;
  }

  return next;
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
  const matchHeader = commData.matchHeader || base.matchHeader;

  let liveDetails = mergeLiveDetails(base, commData, htmlDetail || {});

  // Prefer scorecard scoreDetails for scores/ballNbr — especially Hundred overs.
  const isHundred = /hun/i.test(String(matchHeader?.matchFormat || ''))
    || /hundred/i.test(String(matchHeader?.seriesName || ''));

  for (const inn of scorecard?.innings || []) {
    const sd = inn.scoreDetails;
    if (!sd) continue;
    const isChase = (inn.inningsId ?? 1) > 1;
    const oversFromBalls = sd.ballNbr != null && isHundred
      ? `${Math.floor(sd.ballNbr / 5)}.${sd.ballNbr % 5}`
      : null;

    if (isChase) {
      if (sd.runs != null) liveDetails.chaseRuns = sd.runs;
      if (sd.wickets != null) liveDetails.chaseWickets = sd.wickets;
      liveDetails.chaseTeamName = liveDetails.chaseTeamName
        || inn.batTeamShortName
        || inn.batTeamName;
      if (oversFromBalls) {
        liveDetails.chaseOvers = oversFromBalls;
        liveDetails.overs2 = oversFromBalls;
      }
      if (sd.ballNbr != null) liveDetails.chaseBallNbr = sd.ballNbr;
    } else {
      if (sd.runs != null) liveDetails.firstRuns = sd.runs;
      if (sd.wickets != null) liveDetails.firstWickets = sd.wickets;
      liveDetails.firstTeamName = liveDetails.firstTeamName
        || inn.batTeamShortName
        || inn.batTeamName;
      if (oversFromBalls) {
        liveDetails.firstOvers = oversFromBalls;
        if (liveDetails.chaseRuns == null) liveDetails.overs = oversFromBalls;
      }
      if (sd.ballNbr != null && liveDetails.chaseRuns == null) {
        liveDetails.chaseBallNbr = sd.ballNbr;
      }
    }
  }

  liveDetails = applyHundredBallNbrOvers(liveDetails, matchHeader, null);
  liveDetails = enrichLivePlayersFromScorecard(liveDetails, scorecard?.innings || []);

  const detail = {
    ...base,
    matchId,
    fetchedAt: new Date().toISOString(),
    liveDetails,
    overHistory: commData.overHistory || [],
    isLive: isLiveFromSources(commData, htmlDetail, liveDetails),
    matchHeader,
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
    detail.liveDetails = applyHundredBallNbrOvers(
      detail.liveDetails || {},
      detail.matchHeader,
      match,
    );
    return {
      ...detail,
      sport,
      source: 'cricbuzz',
      matchState: detail.isLive ? 'in' : detail.matchState,
    };
  }

  if (match.source === 'espn' || match.id?.startsWith('api_')) {
    const detail = await fetchEspnMatchDetail(match);
    if (detail) return detail;
  }

  if (match.fancodeMatchId) {
    return null;
  }

  if (match.source === 'srl' || String(match.id || '').startsWith('srl_ipl_')) {
    // First try to find in visible matches, then fall back to direct lookup by ID
    const srlMatch = getIplSrlMatches().find((item) => item.id === match.id)
      || getIplSrlMatchById(match.id);
    if (!srlMatch) return null;
    return {
      ...srlMatch,
      fetchedAt: new Date().toISOString(),
      matchId: match.id,
    };
  }

  return null;
}
