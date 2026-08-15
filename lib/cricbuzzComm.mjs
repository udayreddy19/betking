/**
 * Cricbuzz mcenter comm API — live miniscore, batters, bowler, ball-by-ball overs.
 */

const CRICBUZZ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://www.cricbuzz.com/',
};

export function mapTossResults(tossResults) {
  if (!tossResults?.tossWinnerName && !tossResults?.winnerName) return null;
  const raw = String(tossResults.decision || tossResults.decisionChoice || '').toLowerCase();
  const decision = raw.includes('bowl') ? 'bowl' : raw.includes('bat') ? 'bat' : (tossResults.decision || null);
  return {
    winner: tossResults.tossWinnerName || tossResults.winnerName,
    decision,
  };
}

/** Parse "Name 12(10)" pairs from live commentary — never invents names. */
export function parseLivePlayersFromText(text) {
  if (!text) return {};
  const found = [];
  const re = /([A-Z][a-zA-Z'.-]+(?:\s+[A-Z][a-zA-Z'.-]+){0,2})\s+(\d+)\s*\(\s*(\d+)\s*\)/g;
  let m;
  while ((m = re.exec(String(text))) !== null) {
    const name = m[1].trim();
    if (name.split(/\s+/).length < 2) continue;
    if (/^(Follow|Need|Require|Target|Overs?)$/i.test(name)) continue;
    found.push({
      name,
      runs: Number(m[2]),
      balls: Number(m[3]),
      fours: 0,
      sixes: 0,
    });
  }
  const out = {};
  if (found[0]) out.batter1 = found[0];
  if (found[1]) out.batter2 = found[1];
  return out;
}

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
  const name = obj?.name || obj?.batName || obj?.batsmanName || obj?.playerName || obj?.nickName;
  if (!name) return null;
  const balls = obj.balls ?? obj.ballsFaced ?? 0;
  const runs = obj.runs ?? 0;
  const srRaw = obj.strkRate ?? obj.strikeRate ?? obj.sr;
  return {
    name,
    runs,
    balls,
    fours: obj.fours ?? obj.foursHit ?? 0,
    sixes: obj.sixes ?? obj.sixesHit ?? 0,
    sr: srRaw != null ? String(srRaw) : (balls > 0 ? ((runs / balls) * 100).toFixed(2) : '0.00'),
  };
}

function mapBowler(obj) {
  const name = obj?.name || obj?.bowlName || obj?.bowlerName || obj?.playerName || obj?.nickName;
  if (!name) return null;
  return {
    name,
    overs: obj.overs ?? 0,
    maidens: obj.maidens ?? obj.maidenOvers ?? 0,
    runs: obj.runs ?? 0,
    wickets: obj.wickets ?? 0,
    economy: obj.economy ?? obj.economyRate ?? 0,
  };
}

function extrasTotal(extras) {
  if (extras == null) return null;
  if (typeof extras === 'number') return extras;
  if (typeof extras.total === 'number') return extras.total;
  const parts = [extras.byes, extras.legByes, extras.wides, extras.noBalls, extras.penalty]
    .map((n) => Number(n) || 0);
  const sum = parts.reduce((a, b) => a + b, 0);
  return sum || null;
}

function parseCommentaryFeed(data) {
  const commFeed = [];
  if (!data?.matchCommentary || typeof data.matchCommentary !== 'object') return commFeed;
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
  return commFeed;
}

export function parseCricbuzzComm(data) {
  const mini = data?.miniscore;
  const commFeed = parseCommentaryFeed(data);
  const headerStatus = data?.matchHeader?.status || data?.status || '';
  const fromText = parseLivePlayersFromText(
    [headerStatus, mini?.status, ...commFeed.slice(0, 8).map((c) => c.text)].filter(Boolean).join(' '),
  );
  const feedBatter = commFeed.find((c) => c.batsman)?.batsman;
  const feedBowler = commFeed.find((c) => c.bowler)?.bowler;

  if (!mini) {
    const liveDetails = {
      commentary: headerStatus,
      commentaryFeed: commFeed,
      batter1: fromText.batter1 || (feedBatter ? { name: feedBatter, runs: 0, balls: 0, fours: 0, sixes: 0 } : null),
      batter2: fromText.batter2 || null,
      bowler: feedBowler ? { name: feedBowler, overs: 0, runs: 0, wickets: 0, economy: 0 } : null,
      toss: mapTossResults(data?.matchHeader?.tossResults),
      fours: null,
      sixes: null,
      extras: null,
    };
    const state = data?.matchHeader?.state || '';
    return {
      liveDetails,
      overHistory: [],
      matchHeader: data?.matchHeader,
      isLive: /in progress|innings break|^live$/i.test(`${state} ${headerStatus}`),
    };
  }

  const inningsList = mini.matchScoreDetails?.inningsScoreList || [];
  const currentInnings = inningsList[inningsList.length - 1]
    || mini.batTeamScoreObj?.teamInningsArray?.slice(-1)[0]
    || mini.batTeam?.teamInningsArray?.slice(-1)[0];
  const firstInnings = inningsList.find((inn) => inn.inningsId === 1)
    || mini.batTeamScoreObj?.teamInningsArray?.find((inn) => inn.inningsId === 1);

  const oversRaw = currentInnings?.overs ?? mini.overs ?? 0;
  const oversStr = String(oversRaw).includes('.') ? String(oversRaw) : `${oversRaw}.0`;

  const partnership = mini.partnerShip || mini.partnership;
  const liveDetails = {
    commentary: mini.status || mini.matchScoreDetails?.customStatus || headerStatus,
    commentaryFeed: commFeed,
    batter1: mapBatter(mini.batsmanStriker) || fromText.batter1,
    batter2: mapBatter(mini.batsmanNonStriker) || fromText.batter2,
    bowler: mapBowler(mini.bowlerStriker) || (feedBowler ? { name: feedBowler, overs: 0, runs: 0, wickets: 0, economy: 0 } : null),
    currentOverBalls: parseOverSummary(mini.recentOvsStats || ''),
    fours: null,
    sixes: null,
    extras: extrasTotal(mini.extras || mini.extrasData),
    extrasBreakdown: mini.extras || mini.extrasData || null,
    partnership: partnership && (partnership.runs != null || partnership.balls != null)
      ? { runs: partnership.runs ?? 0, balls: partnership.balls ?? 0 }
      : null,
    toss: mapTossResults(data?.matchHeader?.tossResults),
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
