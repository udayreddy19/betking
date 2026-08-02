import { normalizeCricbuzzOvers } from './oversUtils';
import { mergeCricketLiveDetails } from './cricketScoreMerge';
import { flattenCricketTeamScores, resolveCricketTeamScores } from './cricketScores';
import { isHundredMatch, hundredBallsToOvers } from './cricketFormat';

function applyHundredBallNbr(match, ld) {
  const isHundred = isHundredMatch(match)
    || /hun/i.test(match?.matchHeader?.matchFormat || '');
  if (!isHundred) return ld;

  const next = { ...ld };
  if (next.chaseRuns != null && next.chaseBallNbr != null && next.chaseBallNbr > 0) {
    const overs = hundredBallsToOvers(next.chaseBallNbr);
    next.chaseOvers = overs;
    next.overs2 = overs;
  } else if (next.chaseRuns == null && next.chaseBallNbr != null && next.chaseBallNbr > 0) {
    const overs = hundredBallsToOvers(next.chaseBallNbr);
    next.firstOvers = overs;
    next.overs = overs;
  }
  return next;
}

function enrichCricketDetails(match, ld, base) {
  const merged = applyHundredBallNbr(match, { ...base, ...ld });
  const scores = resolveCricketTeamScores(match, merged);
  const flat = flattenCricketTeamScores(scores);

  return {
    ...base,
    ...merged,
    runs: flat.runs,
    wickets: flat.wickets,
    overs: normalizeCricbuzzOvers(flat.overs),
    score2: flat.score2,
    wickets2: flat.wickets2,
    overs2: normalizeCricbuzzOvers(flat.overs2),
    chaseBallNbr: ld.chaseBallNbr ?? base.chaseBallNbr,
    batter1: ld.batter1 || base.batter1,
    batter2: ld.batter2 || base.batter2,
    bowler: ld.bowler || base.bowler,
    commentary: ld.commentary || base.commentary,
    currentOverBalls: ld.currentOverBalls?.length ? ld.currentOverBalls : base.currentOverBalls,
  };
}

export function enrichMatchWithDetail(match, detail) {
  if (!match || !detail) return match;
  const hasLive = detail.liveDetails && Object.keys(detail.liveDetails).length > 0;
  const hasMeta = detail.squads?.length || detail.scorecardInnings?.length || detail.overHistory?.length;
  if (!hasLive && !hasMeta) return match;

  const ld = detail.liveDetails || {};
  const sport = match.sport;
  const baseLd = match.liveDetails || {};
  const matchForScores = {
    ...match,
    seriesName: match.seriesName || detail.matchHeader?.seriesName,
    league: match.league || detail.matchHeader?.seriesName,
    matchHeader: detail.matchHeader || match.matchHeader,
  };

  let liveDetails = baseLd;
  if (hasLive) {
    if (sport === 'cricket' || sport === 'virtual-cricket') {
      const fromDetail = enrichCricketDetails(matchForScores, ld, {});
      liveDetails = mergeCricketLiveDetails(baseLd, fromDetail, matchForScores);
    } else {
      liveDetails = { ...baseLd, ...ld };
    }
  }

  return {
    ...match,
    isLive: detail.isLive ?? match.isLive,
    matchState: detail.matchState
      ?? (detail.isLive ? 'in' : undefined)
      ?? match.matchState,
    time: detail.time ?? match.time,
    seriesName: matchForScores.seriesName,
    squads: detail.squads?.length ? detail.squads : match.squads,
    scorecardInnings: detail.scorecardInnings?.length ? detail.scorecardInnings : match.scorecardInnings,
    overHistory: detail.overHistory?.length ? detail.overHistory : match.overHistory,
    liveDetails,
  };
}
