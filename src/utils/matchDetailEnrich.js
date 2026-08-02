import { normalizeCricbuzzOvers } from './oversUtils';

export function enrichMatchWithDetail(match, detail) {
  if (!match || !detail?.liveDetails) return match;

  const ld = detail.liveDetails;

  let runs = match.liveDetails?.runs ?? 0;
  let wickets = match.liveDetails?.wickets ?? 0;
  let overs = match.liveDetails?.overs || '0.0';
  let score2 = match.liveDetails?.score2 ?? 0;
  let wickets2 = match.liveDetails?.wickets2 ?? 0;
  let overs2 = match.liveDetails?.overs2 || '0.0';

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

  if (ld.firstRuns != null && ld.chaseRuns != null) {
    const team1Name = (match.team1?.name || '').toLowerCase();
    const chaseName = (ld.chaseTeamName || '').toLowerCase();
    const firstName = (ld.firstTeamName || '').toLowerCase();

    const team1IsChasing = chaseName && (
      team1Name.includes(chaseName.replace(/w$/, '').trim())
      || chaseName.includes(team1Name.replace(/ women$/, '').trim())
    );

    if (team1IsChasing) {
      score2 = ld.chaseRuns;
      wickets2 = ld.chaseWickets ?? 0;
      overs2 = ld.chaseOvers || overs2;
      runs = ld.firstRuns;
      wickets = ld.firstWickets ?? 0;
      overs = ld.firstOvers || overs;
    } else if (firstName && (
      team1Name.includes(firstName.replace(/w$/, '').trim())
      || firstName.includes(team1Name.replace(/ women$/, '').trim())
    )) {
      runs = ld.firstRuns;
      wickets = ld.firstWickets ?? 0;
      overs = ld.firstOvers || overs;
      score2 = ld.chaseRuns;
      wickets2 = ld.chaseWickets ?? 0;
      overs2 = ld.chaseOvers || overs2;
    } else {
      runs = ld.firstRuns;
      wickets = ld.firstWickets ?? 0;
      overs = ld.firstOvers || overs;
      score2 = ld.chaseRuns;
      wickets2 = ld.chaseWickets ?? 0;
      overs2 = ld.chaseOvers || overs2;
    }
  }

  return {
    ...match,
    liveDetails: {
      ...match.liveDetails,
      runs,
      wickets,
      overs: normalizeCricbuzzOvers(overs),
      score2,
      wickets2,
      overs2: normalizeCricbuzzOvers(overs2),
      chaseBallNbr: ld.chaseBallNbr,
      commentary: ld.commentary || match.liveDetails?.commentary,
      batter1: ld.batter1 || match.liveDetails?.batter1,
      batter2: ld.batter2 || match.liveDetails?.batter2,
      bowler: ld.bowler || match.liveDetails?.bowler,
    },
  };
}
