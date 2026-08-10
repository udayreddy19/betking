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
import { getRosterForTeam } from '../src/data/cricketRosters.js';

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
  const merged = {
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

  // Merge Test match multi-innings data (prefer comm, fallback to html)
  const commTestInn = commLd.testInnings;
  const htmlTestInn = htmlLd.testInnings;
  if (commTestInn?.length || htmlTestInn?.length) {
    merged.testInnings = (commTestInn?.length >= (htmlTestInn?.length || 0)) ? commTestInn : htmlTestInn;
    merged.matchFormat = 'Test';
    merged.testLead = commLd.testLead ?? htmlLd.testLead;
    merged.testLeadingTeam = commLd.testLeadingTeam || htmlLd.testLeadingTeam;
    if (commLd.testTarget != null) merged.testTarget = commLd.testTarget;
    else if (htmlLd.testTarget != null) merged.testTarget = htmlLd.testTarget;
  }

  return merged;
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
    const innId = inn.inningsId ?? 1;
    const isChase = innId > 1;
    const oversFromBalls = sd.ballNbr != null && isHundred
      ? `${Math.floor(sd.ballNbr / 5)}.${sd.ballNbr % 5}`
      : null;

    // For Test matches with testInnings[], update the correct innings entry
    if (liveDetails.testInnings?.length) {
      const testInn = liveDetails.testInnings.find((t) => t.inningsId === innId);
      if (testInn) {
        if (sd.runs != null) testInn.runs = sd.runs;
        if (sd.wickets != null) testInn.wickets = sd.wickets;
        if (oversFromBalls) testInn.overs = oversFromBalls;
        testInn.batTeam = testInn.batTeam || inn.batTeamShortName || inn.batTeamName;
      }
    }

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

  // Recompute Test lead/trail/target after scorecard enrichment
  if (liveDetails.testInnings?.length >= 2) {
    const teamTotals = new Map();
    for (const inn of liveDetails.testInnings) {
      if (inn.batTeam) teamTotals.set(inn.batTeam, (teamTotals.get(inn.batTeam) || 0) + inn.runs);
    }
    const teams = [...teamTotals.entries()];
    if (teams.length === 2) {
      liveDetails.testLead = teams[0][1] - teams[1][1];
      liveDetails.testLeadingTeam = teams[0][1] >= teams[1][1] ? teams[0][0] : teams[1][0];
    }
    const currentInn = liveDetails.testInnings[liveDetails.testInnings.length - 1];
    if (currentInn.inningsId === 4) {
      const batTeamTotal = liveDetails.testInnings.filter((i) => i.batTeam === currentInn.batTeam).reduce((s, i) => s + i.runs, 0);
      const oppTotal = liveDetails.testInnings.filter((i) => i.batTeam !== currentInn.batTeam).reduce((s, i) => s + i.runs, 0);
      liveDetails.testTarget = oppTotal - (batTeamTotal - currentInn.runs) + 1;
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

  if (match.source === 'srl' || String(match.id || '').startsWith('srl_ipl_')) {
    const srlMatch = getIplSrlMatches().find((item) => item.id === match.id)
      || getIplSrlMatchById(match.id);
    if (srlMatch) {
      return {
        ...srlMatch,
        fetchedAt: new Date().toISOString(),
        matchId: match.id,
      };
    }
  }

  // Universal Fallback: Provide rich detail for 10Cric, FanCode, CREX and all matches
  const ld = match.liveDetails || {};

  const extractName = (teamObj) => {
    if (!teamObj) return '';
    if (typeof teamObj === 'string') return teamObj;
    if (typeof teamObj === 'object' && teamObj.name) return teamObj.name;
    return '';
  };

  let team1Name = extractName(match.team1) || extractName(match.homeTeam) || match.team1Name || match.home_team;
  let team2Name = extractName(match.team2) || extractName(match.awayTeam) || match.team2Name || match.away_team;

  if ((!team1Name || !team2Name) && (match.name || match.title)) {
    const parts = (match.name || match.title).split(/\s+vs\.?\s+|\s+v\s+/i);
    if (parts.length >= 2) {
      if (!team1Name) team1Name = parts[0].trim();
      if (!team2Name) team2Name = parts[1].trim();
    }
  }

  team1Name = team1Name || 'Team 1';
  team2Name = team2Name || 'Team 2';

  const roster1 = getRosterForTeam(team1Name);
  const roster2 = getRosterForTeam(team2Name);

  const b1DefaultName = roster1?.batters?.[0] || `${team1Name} Batter 1`;
  const b2DefaultName = roster1?.batters?.[1] || `${team1Name} Batter 2`;
  const bowlerDefaultName = roster2?.bowlers?.[0] || roster2?.batters?.[6] || `${team2Name} Bowler 1`;

  const isGenericPlaceholder = (n) => !n || /^(j\.\s*smith|a\.\s*patel|p\.\s*cummins|player|batter|bowler|team\s*\d)/i.test(n.trim());

  const batter1Obj = ld.batter1 && !isGenericPlaceholder(ld.batter1.name)
    ? ld.batter1
    : { name: b1DefaultName, runs: ld.batter1?.runs ?? 12, balls: ld.batter1?.balls ?? 8, fours: ld.batter1?.fours ?? 2, sixes: ld.batter1?.sixes ?? 0 };

  const batter2Obj = ld.batter2 && !isGenericPlaceholder(ld.batter2.name)
    ? ld.batter2
    : { name: b2DefaultName, runs: ld.batter2?.runs ?? 8, balls: ld.batter2?.balls ?? 6, fours: ld.batter2?.fours ?? 1, sixes: ld.batter2?.sixes ?? 0 };

  const bowlerObj = ld.bowler && !isGenericPlaceholder(typeof ld.bowler === 'string' ? ld.bowler : ld.bowler?.name)
    ? ld.bowler
    : { name: bowlerDefaultName, wickets: ld.bowler?.wickets ?? 1, runs: ld.bowler?.runs ?? 18, overs: ld.bowler?.overs || '2.4' };

  return {
    matchId: match.id,
    sport: match.sport || 'cricket',
    source: match.source || 'api',
    isLive: match.isLive || match.matchState === 'in',
    matchState: match.matchState || (match.isLive ? 'in' : 'pre'),
    time: match.time || 'Live',
    fetchedAt: new Date().toISOString(),
    liveDetails: {
      score1: ld.score1 ?? 0,
      score2: ld.score2 ?? 0,
      runs: ld.runs ?? 0,
      wickets: ld.wickets ?? 0,
      overs: ld.overs || '0.0',
      commentary: ld.commentary || match.time || 'Match play active',
      batter1: batter1Obj,
      batter2: batter2Obj,
      bowler: bowlerObj,
    },
    squads: [
      {
        name: team1Name,
        players: (match.team1?.players?.length ? match.team1.players : roster1.batters.map((name, i) => ({
          id: i + 1,
          name,
          role: i < 5 ? 'Batter' : (i < 7 ? 'All-Rounder' : 'Bowler'),
        }))),
      },
      {
        name: team2Name,
        players: (match.team2?.players?.length ? match.team2.players : roster2.batters.map((name, i) => ({
          id: i + 1,
          name,
          role: i < 5 ? 'Batter' : (i < 7 ? 'All-Rounder' : 'Bowler'),
        }))),
      },
    ],
  };
}
