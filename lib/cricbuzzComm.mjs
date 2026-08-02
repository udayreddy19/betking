/**
 * Cricbuzz mcenter comm API — live miniscore, batters, bowler, ball-by-ball overs.
 */

const CRICBUZZ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; BetKing/1.0)',
  Accept: 'application/json',
  Referer: 'https://www.cricbuzz.com/',
};

function parseOverSummary(summary = '') {
  return String(summary)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const t = token.toUpperCase();
      if (t === 'W') return 'W';
      if (t === '0') return '•';
      if (/^\d+$/.test(t)) return t;
      if (t.includes('WD')) return token;
      if (t.includes('NB')) return token;
      if (t.includes('LB')) return token;
      return token;
    });
}

function mapBatter(obj) {
  if (!obj?.name) return null;
  return {
    name: obj.name,
    runs: obj.runs ?? 0,
    balls: obj.balls ?? 0,
    fours: obj.fours ?? 0,
    sixes: obj.sixes ?? 0,
  };
}

function mapBowler(obj) {
  if (!obj?.name) return null;
  return {
    name: obj.name,
    overs: obj.overs ?? 0,
    runs: obj.runs ?? 0,
    wickets: obj.wickets ?? 0,
    economy: obj.economy ?? 0,
  };
}

export function parseCricbuzzComm(data) {
  const mini = data?.miniscore;
  if (!mini) {
    return { liveDetails: {}, overHistory: [] };
  }

  const innings = mini.matchScoreDetails?.inningsScoreList?.[0]
    || mini.batTeamScoreObj?.teamInningsArray?.[0];
  const oversRaw = innings?.overs ?? mini.overs ?? 0;
  const oversStr = String(oversRaw).includes('.') ? String(oversRaw) : `${oversRaw}.0`;

  const liveDetails = {
    commentary: mini.status || mini.matchScoreDetails?.customStatus || data?.matchHeader?.status || '',
    runs: mini.batTeam?.teamScore ?? innings?.score ?? 0,
    wickets: mini.batTeam?.teamWkts ?? innings?.wickets ?? 0,
    overs: oversStr,
    firstRuns: mini.batTeam?.teamScore ?? innings?.score,
    firstWickets: mini.batTeam?.teamWkts ?? innings?.wickets,
    firstOvers: oversStr,
    firstTeamName: mini.batTeamScoreObj?.teamName || innings?.batTeamName,
    ballNbr: innings?.ballNbr,
    batter1: mapBatter(mini.batsmanStriker),
    batter2: mapBatter(mini.batsmanNonStriker),
    bowler: mapBowler(mini.bowlerStriker),
    currentOverBalls: parseOverSummary(mini.recentOvsStats || ''),
    fours: null,
    sixes: null,
    extras: null,
  };

  const overHistory = [];
  const seen = new Set();
  const commentary = data?.matchCommentary || {};

  for (const entry of Object.values(commentary)) {
    const sep = entry?.overSeparator;
    if (!sep?.overNumber || seen.has(sep.overNumber)) continue;
    seen.add(sep.overNumber);
    overHistory.push({
      overNum: sep.overNumber,
      balls: parseOverSummary(sep.overSummary || ''),
      runs: sep.overRuns ?? 0,
      isCurrent: false,
    });
  }

  overHistory.sort((a, b) => a.overNum - b.overNum);

  if (liveDetails.currentOverBalls?.length) {
    const currentOverNum = Math.ceil((innings?.ballNbr || 0) / 6) || overHistory.length + 1;
    const existing = overHistory.find((o) => o.overNum === currentOverNum);
    if (existing) {
      existing.balls = liveDetails.currentOverBalls;
      existing.isCurrent = true;
    } else {
      overHistory.push({
        overNum: currentOverNum,
        balls: liveDetails.currentOverBalls,
        isCurrent: true,
      });
    }
  }

  return {
    liveDetails,
    overHistory,
    matchHeader: data?.matchHeader,
    isLive: mini.matchScoreDetails?.state === 'In Progress',
  };
}

export async function fetchCricbuzzComm(matchId) {
  if (!matchId) return null;

  const url = `https://www.cricbuzz.com/api/mcenter/comm/${matchId}`;
  const response = await fetch(url, { headers: CRICBUZZ_HEADERS });
  if (!response.ok) return null;

  const data = await response.json();
  return parseCricbuzzComm(data);
}
