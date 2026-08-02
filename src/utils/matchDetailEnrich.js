import { normalizeCricbuzzOvers } from './oversUtils';
import { mergeCricketLiveDetails } from './cricketScoreMerge';

function enrichCricketDetails(match, ld, base) {
  let runs = base.runs ?? 0;
  let wickets = base.wickets ?? 0;
  let overs = base.overs || '0.0';
  let score2 = base.score2 ?? 0;
  let wickets2 = base.wickets2 ?? 0;
  let overs2 = base.overs2 || '0.0';

  if (ld.runs != null && ld.chaseRuns == null && ld.firstRuns == null) {
    runs = ld.runs;
    wickets = ld.wickets ?? wickets;
    overs = ld.overs || overs;
    score2 = ld.score2 ?? score2;
    wickets2 = ld.wickets2 ?? wickets2;
    overs2 = ld.overs2 || overs2;
  }

  if (ld.firstRuns != null) {
    runs = ld.firstRuns;
    wickets = ld.firstWickets ?? wickets;
    overs = ld.firstOvers || overs;
  }

  if (ld.chaseRuns != null) {
    score2 = ld.chaseRuns;
    wickets2 = ld.chaseWickets ?? wickets2;
    overs2 = ld.chaseOvers || overs2;
  }

  return {
    ...base,
    runs,
    wickets,
    overs: normalizeCricbuzzOvers(overs),
    score2,
    wickets2,
    overs2: normalizeCricbuzzOvers(overs2),
    chaseBallNbr: ld.chaseBallNbr ?? base.chaseBallNbr,
    batter1: ld.batter1 || base.batter1,
    batter2: ld.batter2 || base.batter2,
    bowler: ld.bowler || base.bowler,
    commentary: ld.commentary || base.commentary,
  };
}

export function enrichMatchWithDetail(match, detail) {
  if (!match || !detail?.liveDetails) return match;

  const ld = detail.liveDetails;
  const sport = match.sport;
  const baseLd = match.liveDetails || {};

  let liveDetails;
  if (sport === 'cricket' || sport === 'virtual-cricket') {
    const fromDetail = enrichCricketDetails(match, ld, {});
    liveDetails = mergeCricketLiveDetails(baseLd, fromDetail);
  } else {
    liveDetails = { ...baseLd, ...ld };
  }

  return {
    ...match,
    isLive: detail.isLive ?? match.isLive,
    matchState: detail.matchState ?? match.matchState,
    time: detail.time ?? match.time,
    squads: detail.squads ?? match.squads,
    scorecardInnings: detail.scorecardInnings ?? match.scorecardInnings,
    liveDetails,
  };
}
