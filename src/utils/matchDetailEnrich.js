import { normalizeMatchOvers } from './cricketFormat';
import { mergeCricketLiveDetails } from './cricketScoreMerge';
import { flattenCricketTeamScores, resolveCricketTeamScores } from './cricketScores';
import { isHundredMatch, hundredBallsToOvers } from './cricketFormat';
import { enrichLivePlayersFromScorecard } from './scorecardLivePlayers';
import { isPlaceholderPlayerName } from './cricketPlayers';

function hasPlayerName(player) {
  return !!(player?.name && !isPlaceholderPlayerName(player.name));
}

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
    overs: normalizeMatchOvers(flat.overs, match),
    score2: flat.score2,
    wickets2: flat.wickets2,
    overs2: normalizeMatchOvers(flat.overs2, match),
    chaseBallNbr: merged.chaseBallNbr ?? ld.chaseBallNbr ?? base.chaseBallNbr,
    batter1: hasPlayerName(ld.batter1) ? ld.batter1 : (hasPlayerName(base.batter1) ? base.batter1 : ld.batter1 || base.batter1),
    batter2: hasPlayerName(ld.batter2) ? ld.batter2 : (hasPlayerName(base.batter2) ? base.batter2 : ld.batter2 || base.batter2),
    bowler: hasPlayerName(ld.bowler) ? ld.bowler : (hasPlayerName(base.bowler) ? base.bowler : ld.bowler || base.bowler),
    commentary: ld.commentary || base.commentary,
    currentOverBalls: ld.currentOverBalls?.length ? ld.currentOverBalls : base.currentOverBalls,
    firstRuns: merged.firstRuns,
    firstWickets: merged.firstWickets,
    firstOvers: merged.firstOvers,
    firstTeamName: merged.firstTeamName,
    chaseRuns: merged.chaseRuns,
    chaseWickets: merged.chaseWickets,
    chaseOvers: merged.chaseOvers,
    chaseTeamName: merged.chaseTeamName,
    inningsId: merged.inningsId ?? ld.inningsId,
  };
}

function isSparseCricketDetail(detail, match) {
  const ld = detail?.liveDetails || {};
  const hasPlayers = !!(ld.batter1?.name || ld.batter2?.name || ld.bowler?.name);
  const hasScore = Number(ld.runs) > 0
    || Number(ld.score2) > 0
    || Number(ld.chaseRuns) > 0
    || Number(ld.firstRuns) > 0;
  const hasOvers = ld.overs && ld.overs !== '0' && ld.overs !== '0.0';
  const hasChaseOvers = ld.chaseOvers && ld.chaseOvers !== '0' && ld.chaseOvers !== '0.0';
  const hasSquads = (detail?.squads || []).some((team) => team?.players?.length);
  const hasScorecard = !!detail?.scorecardInnings?.length;
  const baseHasLive = Number(match?.liveDetails?.runs) > 0
    || Number(match?.liveDetails?.chaseRuns) > 0
    || Number(match?.liveDetails?.score2) > 0;
  return !hasPlayers && !hasScore && !hasOvers && !hasChaseOvers && !hasSquads && !hasScorecard && baseHasLive;
}

export function enrichMatchWithDetail(match, detail) {
  if (!match || !detail) return match;
  if (isSparseCricketDetail(detail, match)) return match;
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
      const scorecardInnings = detail.scorecardInnings?.length
        ? detail.scorecardInnings
        : match.scorecardInnings;
      const ldWithPlayers = enrichLivePlayersFromScorecard(ld, scorecardInnings || []);
      const fromDetail = enrichCricketDetails(matchForScores, ldWithPlayers, baseLd);
      liveDetails = mergeCricketLiveDetails(baseLd, fromDetail, matchForScores);
    } else {
      liveDetails = { ...baseLd, ...ld };
    }
  } else if (hasMeta && (sport === 'cricket' || sport === 'virtual-cricket')) {
    const scorecardInnings = detail.scorecardInnings?.length
      ? detail.scorecardInnings
      : match.scorecardInnings;
    liveDetails = enrichLivePlayersFromScorecard(baseLd, scorecardInnings || []);
  }

  return {
    ...match,
    isLive: match.isLive === true || detail.isLive === true,
    matchState: (match.matchState === 'in' || match.isLive || detail.matchState === 'in' || detail.isLive)
      ? 'in'
      : (detail.matchState || match.matchState),
    time: detail.time ?? match.time,
    seriesName: matchForScores.seriesName,
    matchFormat: detail.matchHeader?.matchFormat || match.matchFormat,
    matchHeader: detail.matchHeader || match.matchHeader,
    squads: detail.squads?.length ? detail.squads : match.squads,
    scorecardInnings: detail.scorecardInnings?.length ? detail.scorecardInnings : match.scorecardInnings,
    overHistory: detail.overHistory?.length ? detail.overHistory : match.overHistory,
    venue: detail.venue || match.venue || null,
    officials: detail.officials || match.officials || null,
    toss: detail.toss || match.toss || null,
    events: detail.events || match.events || null,
    commentary: detail.commentary || match.commentary || null,
    lineups: detail.lineups || match.lineups || null,
    odds: detail.odds || match.odds || null,
    headToHead: detail.headToHead || match.headToHead || null,
    awards: detail.awards || match.awards || null,
    season: detail.season || match.season || null,
    tournament: detail.tournament || match.tournament || null,
    liveDetails,
  };
}
