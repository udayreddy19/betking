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

  const inningsList = mini.matchScoreDetails?.inningsScoreList || [];
  const currentInnings = inningsList[inningsList.length - 1]
    || mini.batTeamScoreObj?.teamInningsArray?.slice(-1)[0]
    || mini.batTeam?.teamInningsArray?.slice(-1)[0];
  const firstInnings = inningsList.find((inn) => inn.inningsId === 1)
    || mini.batTeamScoreObj?.teamInningsArray?.find((inn) => inn.inningsId === 1);

  const oversRaw = currentInnings?.overs ?? mini.overs ?? 0;
  const oversStr = String(oversRaw).includes('.') ? String(oversRaw) : `${oversRaw}.0`;

  const commFeed = [];
  if (data?.matchCommentary && typeof data.matchCommentary === 'object') {
    const rawItems = Object.values(data.matchCommentary).filter(
      (item) => item && typeof item === 'object' && (item.commText || item.commType)
    );
    rawItems.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    for (const item of rawItems) {
      if (!item.commText) continue;
      const cleanText = String(item.commText).replace(/<[^>]*>/g, '').trim();
      const ballOver = item.ballMetric ? String(item.ballMetric) : (item.overNumber ? String(item.overNumber) : '');

      let tag = '•';
      if (item.event?.includes('wicket') || /out|wicket|bowled|caught|lbw|run out/i.test(cleanText)) {
        tag = 'W';
      } else if (item.event?.includes('six') || /six|6 runs/i.test(cleanText)) {
        tag = '6';
      } else if (item.event?.includes('four') || /four|4 runs/i.test(cleanText)) {
        tag = '4';
      } else if (item.event?.includes('wide') || /wide/i.test(cleanText)) {
        tag = 'WD';
      } else if (item.event?.includes('no-ball') || /no ball/i.test(cleanText)) {
        tag = 'NB';
      } else if (/1 run/i.test(cleanText)) {
        tag = '1';
      } else if (/2 runs/i.test(cleanText)) {
        tag = '2';
      } else if (/3 runs/i.test(cleanText)) {
        tag = '3';
      }

      commFeed.push({
        over: ballOver,
        text: cleanText,
        tag,
        timestamp: item.timestamp || Date.now(),
        batsman: item.batsmanDetails?.playerName,
        bowler: item.bowlerDetails?.playerName,
      });
    }
  }

  const liveDetails = {
    commentary: mini.status || mini.matchScoreDetails?.customStatus || data?.matchHeader?.status || '',
    commentaryFeed: commFeed,
    batter1: mapBatter(mini.batsmanStriker),
    batter2: mapBatter(mini.batsmanNonStriker),
    bowler: mapBowler(mini.bowlerStriker),
    currentOverBalls: parseOverSummary(mini.recentOvsStats || ''),
    fours: null,
    sixes: null,
    extras: null,
  };

  if (currentInnings) {
    const isChase = (currentInnings.inningsId ?? 1) > 1;
    const score = mini.batTeam?.teamScore ?? currentInnings.score ?? 0;
    const wickets = mini.batTeam?.teamWkts ?? currentInnings.wickets ?? 0;
    const teamName = mini.batTeamScoreObj?.teamName || currentInnings.batTeamName;
    const ballNbr = currentInnings.ballNbr;

    liveDetails.inningsId = currentInnings.inningsId ?? 1;

    if (isChase) {
      liveDetails.chaseRuns = score;
      liveDetails.chaseWickets = wickets;
      liveDetails.chaseOvers = oversStr;
      liveDetails.chaseTeamName = teamName;
      liveDetails.chaseBallNbr = ballNbr;
      if (firstInnings) {
        liveDetails.firstRuns = firstInnings.score ?? firstInnings.runs;
        liveDetails.firstWickets = firstInnings.wickets;
        liveDetails.firstOvers = String(firstInnings.overs ?? 0).includes('.')
          ? String(firstInnings.overs)
          : `${firstInnings.overs ?? 0}.0`;
        liveDetails.firstTeamName = firstInnings.batTeamName;
      }
    } else {
      liveDetails.firstRuns = score;
      liveDetails.firstWickets = wickets;
      liveDetails.firstOvers = oversStr;
      liveDetails.firstTeamName = teamName;
      liveDetails.chaseBallNbr = ballNbr;
    }

    liveDetails.runs = score;
    liveDetails.wickets = wickets;
    liveDetails.overs = oversStr;
  }

  // Test match multi-innings from full inningsScoreList
  if (inningsList.length > 2 || /test/i.test(String(data?.matchHeader?.matchFormat || ''))) {
    const testInnings = inningsList.map((inn) => ({
      inningsId: inn.inningsId ?? 0,
      batTeam: inn.batTeamName || inn.batTeamShortName || '',
      runs: inn.score ?? inn.runs ?? 0,
      wickets: inn.wickets ?? 0,
      overs: String(inn.overs ?? 0).includes('.') ? String(inn.overs) : `${inn.overs ?? 0}.0`,
      declared: inn.isDeclared || false,
      allOut: (inn.wickets ?? 0) >= 10,
    }));
    testInnings.sort((a, b) => a.inningsId - b.inningsId);

    if (testInnings.length > 0) {
      liveDetails.testInnings = testInnings;
      liveDetails.matchFormat = 'Test';

      // Compute Test lead/trail across all innings
      const teamTotals = new Map();
      for (const inn of testInnings) {
        if (inn.batTeam) teamTotals.set(inn.batTeam, (teamTotals.get(inn.batTeam) || 0) + inn.runs);
      }
      const teams = [...teamTotals.entries()];
      if (teams.length === 2) {
        liveDetails.testLead = teams[0][1] - teams[1][1];
        liveDetails.testLeadingTeam = teams[0][1] >= teams[1][1] ? teams[0][0] : teams[1][0];
      }

      // Test target only in innings 4
      const currentInn = testInnings[testInnings.length - 1];
      if (currentInn.inningsId === 4) {
        const batTeamTotal = testInnings.filter((i) => i.batTeam === currentInn.batTeam).reduce((s, i) => s + i.runs, 0);
        const oppTotal = testInnings.filter((i) => i.batTeam !== currentInn.batTeam).reduce((s, i) => s + i.runs, 0);
        liveDetails.testTarget = oppTotal - (batTeamTotal - currentInn.runs) + 1;
      }
    }
  }

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
    const ballNbr = currentInnings?.ballNbr || 0;
    const currentOverNum = Math.ceil(ballNbr / 6) || overHistory.length + 1;
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

  const state = mini.matchScoreDetails?.state || data?.matchHeader?.state || '';
  const status = mini.status || data?.matchHeader?.status || '';
  const isLive = /in progress|innings break|^live$/i.test(`${state} ${status}`);

  return {
    liveDetails,
    overHistory,
    matchHeader: data?.matchHeader,
    isLive,
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
