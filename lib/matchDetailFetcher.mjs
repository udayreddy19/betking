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
import { fetchCricbuzzMatches } from './cricbuzzLiveScores.mjs';
import { getCanonicalMatchPairKey, normalizeTeamNameForPair } from './matchPairKey.mjs';
import { fetch10CricMatchById } from './providers/tencricProvider.mjs';
import { fetchFanCodeLiveScores } from './fancodeLiveScores.mjs';
import { fetchCrexCricketMatches } from './crexCricketProvider.mjs';
import {
  isPlaceholderPlayerName,
  parseLivePlayersFromCommentary,
} from '../src/utils/cricketPlayers.js';

function isSimulatedRealityMatch(match) {
  const blob = [
    match?.league,
    match?.seriesName,
    match?.team1?.name,
    match?.team2?.name,
    match?.id,
  ].filter(Boolean).join(' ').toLowerCase();
  return /\bsrl\b/.test(blob)
    || String(match?.id || '').startsWith('srl_')
    || match?.sport === 'virtual-cricket';
}

function srlLane(match) {
  return isSimulatedRealityMatch(match) ? 'srl' : 'real';
}

function teamNameForMatch(name = '') {
  return normalizeTeamNameForPair(name).replace(/\bsrl\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasPlayerName(player) {
  return !!(player?.name && !isPlaceholderPlayerName(player.name));
}

function hasRosterPlayers(detail) {
  const ld = detail?.liveDetails || {};
  if (hasPlayerName(ld.batter1) || hasPlayerName(ld.batter2) || hasPlayerName(ld.bowler)) return true;
  if ((detail?.scorecardInnings || []).some((inn) => inn?.batters?.some((b) => hasPlayerName(b)))) return true;
  if ((detail?.squads || []).some((team) => team?.players?.some((p) => hasPlayerName(p) || p?.name))) return true;
  return false;
}

function overlayLivePlayers(baseLd = {}, otherLd = {}) {
  const fromText = parseLivePlayersFromCommentary(otherLd.commentary || baseLd.commentary || '');
  return {
    ...baseLd,
    batter1: hasPlayerName(baseLd.batter1) ? baseLd.batter1 : (hasPlayerName(otherLd.batter1) ? otherLd.batter1 : fromText.batter1 || baseLd.batter1),
    batter2: hasPlayerName(baseLd.batter2) ? baseLd.batter2 : (hasPlayerName(otherLd.batter2) ? otherLd.batter2 : fromText.batter2 || baseLd.batter2),
    bowler: hasPlayerName(baseLd.bowler) ? baseLd.bowler : (hasPlayerName(otherLd.bowler) ? otherLd.bowler : baseLd.bowler),
    extras: otherLd.extras ?? baseLd.extras,
    partnership: otherLd.partnership || baseLd.partnership,
    fours: otherLd.fours ?? baseLd.fours,
    sixes: otherLd.sixes ?? baseLd.sixes,
    currentOverBalls: otherLd.currentOverBalls?.length ? otherLd.currentOverBalls : baseLd.currentOverBalls,
    commentary: baseLd.commentary || otherLd.commentary,
  };
}

function mergeRosterDetail(base, extra, match) {
  if (!extra) return base;
  if (!base) {
    return {
      ...extra,
      sport: match?.sport || extra.sport,
      matchId: match?.id || extra.matchId,
    };
  }
  const extraLd = extra.liveDetails || {};
  const baseLd = base.liveDetails || {};
  return {
    ...base,
    ...extra,
    id: match?.id || base.id || extra.id,
    matchId: match?.id || base.matchId || extra.matchId,
    source: match?.source || base.source || extra.source,
    sport: match?.sport || base.sport || extra.sport,
    team1: match?.team1?.name ? { ...(extra.team1 || {}), ...match.team1 } : (base.team1 || extra.team1),
    team2: match?.team2?.name ? { ...(extra.team2 || {}), ...match.team2 } : (base.team2 || extra.team2),
    league: match?.league || base.league || extra.league,
    isLive: base.isLive || extra.isLive || match?.isLive,
    matchState: (base.matchState === 'in' || extra.matchState === 'in' || match?.matchState === 'in' || base.isLive || extra.isLive)
      ? 'in'
      : (base.matchState || extra.matchState),
    liveDetails: overlayLivePlayers(baseLd, extraLd),
    squads: (extra.squads || []).some((t) => t?.players?.length)
      ? extra.squads
      : (base.squads || extra.squads),
    scorecardInnings: extra.scorecardInnings?.length ? extra.scorecardInnings : base.scorecardInnings,
    overHistory: extra.overHistory?.length ? extra.overHistory : base.overHistory,
    matchHeader: extra.matchHeader || base.matchHeader,
    toss: extra.toss || base.toss,
    fetchedAt: extra.fetchedAt || base.fetchedAt,
  };
}

function resolveCricbuzzId(match) {
  return match.cricbuzzMatchId
    || (match.id?.startsWith('cb_') ? match.id.replace('cb_', '') : null);
}

let cricbuzzIdIndex = { at: 0, byKey: new Map(), byTeams: new Map(), matches: [] };

function teamPairKey(match) {
  const t1 = normalizeTeamNameForPair(match?.team1?.name);
  const t2 = normalizeTeamNameForPair(match?.team2?.name);
  if (!t1 || !t2) return '';
  return [t1, t2].sort().join('|');
}

function namesOverlap(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a))) return true;
  const aw = a.split(' ').filter((w) => w.length >= 4);
  const bw = new Set(b.split(' ').filter((w) => w.length >= 4));
  return aw.some((w) => bw.has(w));
}

function fuzzyCricbuzzId(match, items = []) {
  const t1 = teamNameForMatch(match?.team1?.name);
  const t2 = teamNameForMatch(match?.team2?.name);
  if (!t1 || !t2) return null;
  const lane = srlLane(match);
  for (const item of items) {
    if (srlLane(item) !== lane) continue;
    const i1 = teamNameForMatch(item.team1?.name);
    const i2 = teamNameForMatch(item.team2?.name);
    const hit = (namesOverlap(t1, i1) && namesOverlap(t2, i2))
      || (namesOverlap(t1, i2) && namesOverlap(t2, i1));
    if (hit) return item.cricbuzzMatchId || String(item.id || '').replace(/^cb_/, '');
  }
  return null;
}

/** Resolve Cricbuzz numeric id for any cricket match (cb_*, oy_*, T20/ODI/Test/…). */
export async function lookupCricbuzzId(match) {
  const direct = resolveCricbuzzId(match);
  if (direct) return direct;
  const sport = match.sport;
  if (sport && sport !== 'cricket' && sport !== 'virtual-cricket') return null;

  if (Date.now() - cricbuzzIdIndex.at > 12_000) {
    try {
      const result = await fetchCricbuzzMatches();
      const byKey = new Map();
      const byTeams = new Map();
      for (const item of result.matches || []) {
        const id = item.cricbuzzMatchId || String(item.id || '').replace(/^cb_/, '');
        const key = getCanonicalMatchPairKey(item);
        if (key) byKey.set(key, id);
        const teams = teamPairKey(item);
        if (teams) byTeams.set(`${srlLane(item)}|${teams}`, id);
      }
      cricbuzzIdIndex = { at: Date.now(), byKey, byTeams, matches: result.matches || [] };
    } catch {
      cricbuzzIdIndex.at = Date.now();
    }
  }

  const key = getCanonicalMatchPairKey(match);
  if (key && cricbuzzIdIndex.byKey.get(key)) return cricbuzzIdIndex.byKey.get(key);
  const teams = teamPairKey(match);
  const laneTeams = teams ? `${srlLane(match)}|${teams}` : '';
  if (laneTeams && cricbuzzIdIndex.byTeams.get(laneTeams)) return cricbuzzIdIndex.byTeams.get(laneTeams);
  return fuzzyCricbuzzId(match, cricbuzzIdIndex.matches);
}

export function canFetchMatchDetail(match) {
  if (!match) return false;
  if (resolveCricbuzzId(match)) return true;
  if (match.source === 'espn' || match.id?.startsWith('api_')) return true;
  if (match.fancodeMatchId) return true;
  if (
    match.source === '10cric2026' || match.source === '10cric' || match.source === 'live'
    || match.id?.startsWith('10cric_') || match.id?.startsWith('oy_')
    || match.tencricEventId
  ) return true;
  if (match.source === 'fancode' || match.source === 'crex' || match.id?.startsWith('crex_') || match.id?.startsWith('fc_')) return true;
  return true;
}

let altRosterIndex = { at: 0, fancode: [], crex: [] };

function findAltMatch(match, items = []) {
  const lane = srlLane(match);
  const t1 = teamNameForMatch(match?.team1?.name);
  const t2 = teamNameForMatch(match?.team2?.name);
  if (!t1 || !t2) return null;
  for (const item of items) {
    if (srlLane(item) !== lane) continue;
    const i1 = teamNameForMatch(item.team1?.name);
    const i2 = teamNameForMatch(item.team2?.name);
    const hit = (namesOverlap(t1, i1) && namesOverlap(t2, i2))
      || (namesOverlap(t1, i2) && namesOverlap(t2, i1));
    if (hit) return item;
  }
  return null;
}

function playersFromLooseLiveDetails(ld = {}) {
  const next = { ...ld };
  const fromText = parseLivePlayersFromCommentary(ld.commentary || '');
  if (!hasPlayerName(next.batter1) && fromText.batter1) next.batter1 = fromText.batter1;
  if (!hasPlayerName(next.batter2) && fromText.batter2) next.batter2 = fromText.batter2;
  const striker = ld.striker || ld.batsmanStriker || ld.onStrike || ld.batter;
  const nonStriker = ld.nonStriker || ld.batsmanNonStriker;
  const bowler = ld.currentBowler || ld.bowlerStriker;
  if (!hasPlayerName(next.batter1) && striker?.name) next.batter1 = striker;
  if (!hasPlayerName(next.batter2) && nonStriker?.name) next.batter2 = nonStriker;
  if (!hasPlayerName(next.bowler) && bowler?.name) next.bowler = bowler;
  return next;
}

async function refreshAltRosterIndex() {
  if (Date.now() - altRosterIndex.at < 12_000) return;
  altRosterIndex.at = Date.now();
  const [fancode, crex] = await Promise.allSettled([
    fetchFanCodeLiveScores(),
    fetchCrexCricketMatches('live'),
  ]);
  altRosterIndex = {
    at: Date.now(),
    fancode: fancode.status === 'fulfilled' ? (fancode.value?.matches || fancode.value || []) : [],
    crex: crex.status === 'fulfilled' ? (crex.value?.matches || []) : [],
  };
}

async function lookupAltSourceDetail(match) {
  const run = (async () => {
    await refreshAltRosterIndex();
    const fancode = findAltMatch(match, altRosterIndex.fancode);
    const crex = findAltMatch(match, altRosterIndex.crex);
    const picked = fancode || crex;
    if (!picked) return null;
    return {
      source: picked.source || (fancode ? 'fancode' : 'crex'),
      liveDetails: playersFromLooseLiveDetails(picked.liveDetails || {}),
      squads: picked.squads || [],
      scorecardInnings: picked.scorecardInnings || [],
      fetchedAt: new Date().toISOString(),
    };
  })();
  return Promise.race([
    run,
    new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
  ]);
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
    extras: commLd.extras ?? htmlLd.extras,
    extrasBreakdown: commLd.extrasBreakdown || htmlLd.extrasBreakdown,
    partnership: commLd.partnership || htmlLd.partnership,
    toss: commLd.toss || htmlLd.toss,
    commentaryFeed: commLd.commentaryFeed?.length ? commLd.commentaryFeed : htmlLd.commentaryFeed,
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
  const matchHeader = commData.matchHeader || scorecard?.matchHeader || base.matchHeader;

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
      } else if (sd.overs != null) {
        liveDetails.chaseOvers = String(sd.overs);
        liveDetails.overs2 = String(sd.overs);
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
      } else if (sd.overs != null) {
        liveDetails.firstOvers = String(sd.overs);
        if (liveDetails.chaseRuns == null) liveDetails.overs = String(sd.overs);
      }
      if (sd.ballNbr != null && liveDetails.chaseRuns == null) {
        liveDetails.chaseBallNbr = sd.ballNbr;
      }
    }
  }

  // Construct testInnings from scorecard if not already parsed
  const isTestMatch = /test/i.test(String(matchHeader?.matchFormat || '')) || (scorecard?.innings || []).length > 2;
  if (isTestMatch && !liveDetails.testInnings?.length && (scorecard?.innings || []).length > 0) {
    liveDetails.testInnings = (scorecard.innings || []).map((inn) => ({
      inningsId: inn.inningsId ?? 1,
      batTeam: inn.batTeamShortName || inn.batTeamName || '',
      runs: inn.scoreDetails?.runs ?? inn.runs ?? 0,
      wickets: inn.scoreDetails?.wickets ?? inn.wickets ?? 0,
      overs: String(inn.scoreDetails?.overs ?? inn.overs ?? '0.0'),
      declared: Boolean(inn.isDeclared),
      allOut: (inn.scoreDetails?.wickets ?? inn.wickets ?? 0) >= 10,
    }));
    liveDetails.matchFormat = 'Test';
    liveDetails.inningsId = scorecard.innings[scorecard.innings.length - 1].inningsId;
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
  if (!liveDetails.toss && scorecard?.toss) liveDetails.toss = scorecard.toss;
  if (!liveDetails.commentary && scorecard?.status) liveDetails.commentary = scorecard.status;

  if ((liveDetails.runs == null || liveDetails.runs === 0) && liveDetails.commentary) {
    const scored = String(liveDetails.commentary).match(/(\d+)\s*\/\s*(\d+)\s*\((\d+)\)/);
    if (scored) {
      liveDetails.runs = Number(scored[1]);
      liveDetails.wickets = liveDetails.wickets || Number(scored[2]);
      const balls = Number(scored[3]);
      if (balls > 0 && balls <= 100 && (!liveDetails.overs || liveDetails.overs === '0.0')) {
        liveDetails.chaseBallNbr = liveDetails.chaseBallNbr || balls;
      }
    }
  }

  const detail = {
    ...base,
    matchId,
    fetchedAt: new Date().toISOString(),
    liveDetails,
    overHistory: commData.overHistory || [],
    isLive: isLiveFromSources(commData, htmlDetail, liveDetails),
    matchHeader,
    toss: liveDetails.toss || scorecard?.toss || null,
    team1: matchHeader?.team1?.name ? { id: matchHeader.team1.id || 'team1', name: matchHeader.team1.name, shortName: matchHeader.team1.shortName } : base.team1,
    team2: matchHeader?.team2?.name ? { id: matchHeader.team2.id || 'team2', name: matchHeader.team2.name, shortName: matchHeader.team2.shortName } : base.team2,
  };

  if (scorecard?.teams?.length) {
    detail.squads = scorecard.teams;
    detail.scorecardInnings = scorecard.innings;
  }

  return detail;
}

export async function fetchMatchDetail(rawMatch, { fast = false } = {}) {
  if (!rawMatch) throw new Error('match required');

  const match = typeof rawMatch === 'string'
    ? { id: rawMatch, matchId: rawMatch, cricbuzzMatchId: String(rawMatch).replace(/^cb_/, '') }
    : rawMatch;

  const sport = match.sport;
  const isCricket = !sport || sport === 'cricket' || sport === 'virtual-cricket';
  const is10Cric = match.source === '10cric2026'
    || match.source === '10cric'
    || match.source === 'live'
    || String(match.id || '').startsWith('10cric_')
    || String(match.id || '').startsWith('oy_')
    || !!match.tencricEventId;

  let detail = null;

  if (is10Cric) {
    const tencric = await fetch10CricMatchById(match.id || match.tencricEventId);
    if (tencric?.id && tencric.id !== '10cric_' && tencric.id !== 'oy_') {
      const team1Name = match.team1?.name;
      const team2Name = match.team2?.name;
      detail = {
        ...match,
        ...tencric,
        team1: team1Name ? { ...tencric.team1, ...match.team1 } : tencric.team1,
        team2: team2Name ? { ...tencric.team2, ...match.team2 } : tencric.team2,
        league: match.league || tencric.league,
        fetchedAt: new Date().toISOString(),
        matchId: match.id || tencric.id,
        liveDetails: {
          ...(match.liveDetails || {}),
          ...(tencric.liveDetails || {}),
        },
      };
    }
  }

  if (isCricket) {
    const cricbuzzId = await lookupCricbuzzId(match);
    if (cricbuzzId) {
      try {
        const cbDetail = await fetchCricbuzzCricketDetail(cricbuzzId, { fast });
        if (cbDetail?.liveDetails || cbDetail?.squads) {
          const cbLaneMatch = {
            league: cbDetail.matchHeader?.seriesName || cbDetail.league,
            seriesName: cbDetail.matchHeader?.seriesName,
            team1: cbDetail.team1,
            team2: cbDetail.team2,
            id: cbDetail.id,
          };
          if (isSimulatedRealityMatch(match) && !isSimulatedRealityMatch(cbLaneMatch)) {
            // Keep 10Cric / list scores; do not overlay a real-cricket scorecard onto SRL.
          } else {
            cbDetail.liveDetails = applyHundredBallNbrOvers(
              cbDetail.liveDetails || {},
              cbDetail.matchHeader,
              match,
            );
            detail = mergeRosterDetail(detail, {
              ...cbDetail,
              sport,
              matchState: cbDetail.isLive ? 'in' : cbDetail.matchState,
            }, match);
            if (detail) {
              detail.cricbuzzMatchId = Number(cricbuzzId) || cricbuzzId;
            }
          }
        }
      } catch {
        // Keep scores from 10Cric / list APIs if Cricbuzz detail fails.
      }
    }

    // Full-commentary ball feed for every cricket format (comm is often scorecard-only).
    if (detail || match) {
      try {
        const { enrichMatchWithBallFeed, matchHasBallFeed } = await import('./cricbuzzBallFeed.mjs');
        const base = detail || match;
        if (!matchHasBallFeed(base)) {
          detail = await enrichMatchWithBallFeed({
            ...(detail || match),
            cricbuzzMatchId: Number(cricbuzzId) || (detail || match).cricbuzzMatchId || cricbuzzId,
          }, cricbuzzId);
        }
      } catch {
        // Ball feed optional — settlement falls back to VOID when unavailable.
      }
    }
  }

  if (isCricket && !hasRosterPlayers(detail)) {
    const alt = await lookupAltSourceDetail(match).catch(() => null);
    if (alt) detail = mergeRosterDetail(detail, alt, match);
  }

  if (!hasRosterPlayers(detail) && (match.source === 'espn' || match.id?.startsWith('api_'))) {
    const espn = await fetchEspnMatchDetail(match).catch(() => null);
    if (espn) {
      espn.liveDetails = playersFromLooseLiveDetails(espn.liveDetails || {});
      detail = mergeRosterDetail(detail, espn, match);
    }
  }

  if (match.source === 'srl' || String(match.id || '').startsWith('srl_ipl_')) {
    const srlMatch = getIplSrlMatches().find((item) => item.id === match.id)
      || getIplSrlMatchById(match.id);
    if (srlMatch) {
      detail = mergeRosterDetail(detail, {
        ...srlMatch,
        fetchedAt: new Date().toISOString(),
        matchId: match.id,
      }, match);
    }
  }

  if (detail) {
    if (detail.liveDetails) {
      const fromText = parseLivePlayersFromCommentary(detail.liveDetails.commentary || '');
      detail.liveDetails = overlayLivePlayers(detail.liveDetails, fromText);
      if (detail.scorecardInnings?.length) {
        detail.liveDetails = enrichLivePlayersFromScorecard(
          detail.liveDetails,
          detail.scorecardInnings,
        );
      }
    }
    return {
      ...detail,
      matchId: match.id || detail.matchId,
      sport: sport || detail.sport,
      source: match.source || detail.source,
      fetchedAt: new Date().toISOString(),
    };
  }

  const ld = match.liveDetails || {};
  const fromText = parseLivePlayersFromCommentary(ld.commentary || '');

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

  const inferredLive = match.isLive === true || match.matchState === 'in'
    || Number(ld.runs) > 0 || Number(ld.chaseRuns) > 0 || Number(ld.score2) > 0;

  return {
    matchId: match.id,
    sport: match.sport || 'cricket',
    source: match.source || 'api',
    isLive: inferredLive,
    matchState: inferredLive ? 'in' : (match.matchState || 'pre'),
    time: match.time || (inferredLive ? 'Live' : ''),
    fetchedAt: new Date().toISOString(),
    liveDetails: overlayLivePlayers(ld, fromText),
    squads: [
      {
        name: team1Name,
        players: match.team1?.players?.length ? match.team1.players : [],
      },
      {
        name: team2Name,
        players: match.team2?.players?.length ? match.team2.players : [],
      },
    ],
  };
}
