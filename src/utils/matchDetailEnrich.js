import { normalizeCricbuzzOvers } from './oversUtils';
import { mergeCricketLiveDetails } from './cricketScoreMerge';
import { flattenCricketTeamScores, resolveCricketTeamScores } from './cricketScores';

function enrichCricketDetails(match, ld, base) {
  const merged = { ...base, ...ld };
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
