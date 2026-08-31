/**
 * Cricbuzz mcenter scorecard API — full batting/bowling squads per match.
 */

const CRICBUZZ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://www.cricbuzz.com/',
};

function mapBatsmanRow(b) {
  const name = b?.batName || b?.batsmanName || b?.name;
  if (!name) return null;
  const balls = b.balls ?? 0;
  const runs = b.runs ?? 0;
  const outDesc = (b.outDesc || '').trim();
  const isAtCrease = !outDesc
    || b.wicketCode === 'NOT_OUT'
    || /^batting$/i.test(outDesc)
    || /^not out$/i.test(outDesc);
  return {
    id: b.batId,
    name,
    role: b.isKeeper ? 'Wicket-keeper' : 'Batter',
    runs,
    balls,
    fours: b.fours ?? 0,
    sixes: b.sixes ?? 0,
    sr: balls > 0 ? ((runs / balls) * 100).toFixed(2) : '0.00',
    dismissal: outDesc || (isAtCrease ? 'batting' : 'out'),
    notOut: isAtCrease,
    isCaptain: !!b.isCaptain,
    isKeeper: !!b.isKeeper,
  };
}

function mapBowlerRow(b) {
  const name = b?.bowlName || b?.bowlerName || b?.name;
  if (!name) return null;
  return {
    id: b.bowlerId ?? b.bowlId,
    name,
    role: 'Bowler',
    overs: b.overs ?? 0,
    maidens: b.maidens ?? 0,
    runs: b.runs ?? 0,
    wickets: b.wickets ?? 0,
    economy: b.economy ?? 0,
    isCaptain: !!b.isCaptain,
  };
}

function extrasFromInnings(inn) {
  const raw = inn.extrasData || inn.extras;
  if (raw == null) return { total: null, breakdown: null };
  if (typeof raw === 'number') return { total: raw, breakdown: null };
  const total = raw.total
    ?? ((Number(raw.byes) || 0) + (Number(raw.legByes) || 0) + (Number(raw.wides) || 0)
      + (Number(raw.noBalls) || 0) + (Number(raw.penalty) || 0));
  return { total, breakdown: raw };
}

function mapTossResults(tossResults) {
  if (!tossResults?.tossWinnerName && !tossResults?.winnerName) return null;
  const raw = String(tossResults.decision || '').toLowerCase();
  const decision = raw.includes('bowl') ? 'bowl' : raw.includes('bat') ? 'bat' : (tossResults.decision || null);
  return {
    winner: tossResults.tossWinnerName || tossResults.winnerName,
    decision,
  };
}

function isNotOutBatter(b) {
  if (!b?.name) return false;
  return !!(b.notOut || !b.dismissal || /^(batting|not out)$/i.test(String(b.dismissal || '')));
}

function isAtCreaseBatter(b) {
  if (!isNotOutBatter(b)) return false;
  return (b.balls ?? 0) > 0 || (b.runs ?? 0) > 0;
}

function isWaitingBatter(b) {
  return isNotOutBatter(b);
}

export function pickCurrentBattingInnings(scorecardInnings = [], liveDetails = {}) {
  if (!scorecardInnings.length) return null;

  // 1. If explicit liveDetails.inningsId matches an innings, check if that innings is usable
  if (liveDetails.inningsId != null) {
    const found = scorecardInnings.find((inn) => (inn.inningsId ?? 1) === Number(liveDetails.inningsId));
    if (found) return found;
  }

  // 2. An in-progress innings has batters at the crease and is not all-out (10 wkts) or declared
  const inProgress = scorecardInnings.filter((inn) => {
    const sd = inn.scoreDetails || {};
    const wkts = sd.wickets ?? (inn.batters || []).filter((b) => !b.notOut && b.dismissal && !/^(batting|not out)$/i.test(b.dismissal)).length;
    if (wkts >= 10 || inn.isDeclared) return false;
    return (inn.batters || []).some(isAtCreaseBatter);
  });
  if (inProgress.length) return inProgress[inProgress.length - 1];

  // 3. Check for any innings that is not all-out and not declared
  const uncompleted = scorecardInnings.filter((inn) => {
    const sd = inn.scoreDetails || {};
    const wkts = sd.wickets ?? (inn.batters || []).filter((b) => !b.notOut && b.dismissal && !/^(batting|not out)$/i.test(b.dismissal)).length;
    return wkts < 10 && !inn.isDeclared;
  });
  if (uncompleted.length) return uncompleted[uncompleted.length - 1];

  return null;
}

function mergePlayer(list, player) {
  if (!player) return;
  const idx = list.findIndex((p) => {
    if (player.id != null && p.id != null) return p.id === player.id;
    return p.name && player.name && p.name.toLowerCase() === player.name.toLowerCase();
  });
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...player };
  } else {
    list.push(player);
  }
}

export function parseCricbuzzScorecard(data) {
  const scoreCard = Array.isArray(data?.scoreCard) ? data.scoreCard : [];
  const teamsMap = new Map();

  const innings = scoreCard.map((inn) => {
    const bat = inn.batTeamDetails || {};
    const bowl = inn.bowlTeamDetails || {};

    if (bat.batTeamId) {
      if (!teamsMap.has(bat.batTeamId)) {
        teamsMap.set(bat.batTeamId, {
          id: bat.batTeamId,
          name: bat.batTeamName,
          shortName: bat.batTeamShortName,
          players: [],
        });
      }
      const team = teamsMap.get(bat.batTeamId);
      for (const raw of Object.values(bat.batsmenData || {})) {
        mergePlayer(team.players, mapBatsmanRow(raw));
      }
    }

    if (bowl.bowlTeamId) {
      if (!teamsMap.has(bowl.bowlTeamId)) {
        teamsMap.set(bowl.bowlTeamId, {
          id: bowl.bowlTeamId,
          name: bowl.bowlTeamName,
          shortName: bowl.bowlTeamShortName,
          players: [],
        });
      }
      const team = teamsMap.get(bowl.bowlTeamId);
      for (const raw of Object.values(bowl.bowlersData || {})) {
        mergePlayer(team.players, mapBowlerRow(raw));
      }
    }

    const scoreDetails = inn.scoreDetails
      ? {
        ballNbr: inn.scoreDetails.ballNbr,
        overs: inn.scoreDetails.overs,
        runs: inn.scoreDetails.runs,
        wickets: inn.scoreDetails.wickets,
        runRate: inn.scoreDetails.runRate,
      }
      : null;

    const extras = extrasFromInnings(inn);

    return {
      inningsId: inn.inningsId,
      batTeamId: bat.batTeamId,
      batTeamName: bat.batTeamName,
      batTeamShortName: bat.batTeamShortName,
      scoreDetails,
      extras: extras.total,
      extrasBreakdown: extras.breakdown,
      batters: Object.values(bat.batsmenData || {})
        .map(mapBatsmanRow)
        .filter(Boolean),
      bowlers: Object.values(bowl.bowlersData || {})
        .map(mapBowlerRow)
        .filter(Boolean),
    };
  });

  return {
    teams: [...teamsMap.values()],
    innings,
    toss: mapTossResults(data?.matchHeader?.tossResults),
    matchHeader: data?.matchHeader || null,
    status: data?.status || data?.matchHeader?.status || '',
  };
}

/** Fill live batter/bowler slots from scorecard when comm API omits them. */
export function enrichLivePlayersFromScorecard(liveDetails = {}, scorecardInnings = []) {
  if (!scorecardInnings.length) return liveDetails;

  const next = { ...liveDetails };
  const currentInnings = pickCurrentBattingInnings(scorecardInnings, next);
  if (!currentInnings) return next;

  if (next.inningsId == null && currentInnings.inningsId != null) {
    next.inningsId = currentInnings.inningsId;
  }

  const battersList = currentInnings.batters || [];
  let atCrease = battersList.filter(isAtCreaseBatter);
  if (atCrease.length < 2) {
    const notOut = battersList.filter(isNotOutBatter);
    const batted = battersList.filter((b) => (b.balls ?? 0) > 0 || (b.runs ?? 0) > 0);
    // Take not-out batters first, then latest batters who batted
    const candidates = [...notOut, ...batted.slice(-2).reverse()];
    atCrease = candidates.filter((b, idx, arr) => arr.findIndex((x) => x.name === b.name) === idx).slice(0, 2);
  }

  // Check if liveDetails.batter1 belongs to this innings; if not, discard stale other-innings player
  const batter1Belongs = battersList.some(
    (b) => next.batter1?.name && (b.name === next.batter1.name || b.name.includes(next.batter1.name) || next.batter1.name.includes(b.name)),
  );
  const matchBatter1 = batter1Belongs
    ? battersList.find((b) => b.name === next.batter1.name || b.name.includes(next.batter1.name) || next.batter1.name.includes(b.name))
    : atCrease[0];

  if (matchBatter1) {
    next.batter1 = {
      name: matchBatter1.name,
      runs: matchBatter1.runs ?? next.batter1?.runs ?? 0,
      balls: matchBatter1.balls ?? next.batter1?.balls ?? 0,
      fours: matchBatter1.fours ?? next.batter1?.fours ?? 0,
      sixes: matchBatter1.sixes ?? next.batter1?.sixes ?? 0,
    };
  }

  const batter2Belongs = battersList.some(
    (b) => next.batter2?.name && (b.name === next.batter2.name || b.name.includes(next.batter2.name) || next.batter2.name.includes(b.name)),
  );
  const matchBatter2 = batter2Belongs
    ? battersList.find((b) => b.name === next.batter2.name || b.name.includes(next.batter2.name) || next.batter2.name.includes(b.name))
    : atCrease.find((b) => b.name !== next.batter1?.name) || atCrease[1];

  if (matchBatter2) {
    next.batter2 = {
      name: matchBatter2.name,
      runs: matchBatter2.runs ?? next.batter2?.runs ?? 0,
      balls: matchBatter2.balls ?? next.batter2?.balls ?? 0,
      fours: matchBatter2.fours ?? next.batter2?.fours ?? 0,
      sixes: matchBatter2.sixes ?? next.batter2?.sixes ?? 0,
    };
  }

  const bowlersList = currentInnings.bowlers || [];
  const bowlerBelongs = bowlersList.some(
    (b) => next.bowler?.name && (b.name === next.bowler.name || b.name.includes(next.bowler.name) || next.bowler.name.includes(b.name)),
  );

  if (!bowlerBelongs && bowlersList.length) {
    const activeBowler = bowlersList.find((b) => {
      const ovs = String(b.overs ?? '');
      return /\.\d*[1-9]/.test(ovs);
    }) || bowlersList[bowlersList.length - 1];
    if (activeBowler) {
      next.bowler = {
        name: activeBowler.name,
        overs: activeBowler.overs ?? 0,
        maidens: activeBowler.maidens ?? 0,
        runs: activeBowler.runs ?? 0,
        wickets: activeBowler.wickets ?? 0,
        economy: activeBowler.economy ?? 0,
      };
    }
  }

  if (next.fours == null || next.sixes == null) {
    const totals = (currentInnings.batters || []).reduce(
      (acc, b) => ({
        fours: acc.fours + (b.fours ?? 0),
        sixes: acc.sixes + (b.sixes ?? 0),
      }),
      { fours: 0, sixes: 0 },
    );
    if (next.fours == null) next.fours = totals.fours;
    if (next.sixes == null) next.sixes = totals.sixes;
  }

  if (next.extras == null && currentInnings.extras != null) {
    next.extras = currentInnings.extras;
    next.extrasBreakdown = currentInnings.extrasBreakdown || next.extrasBreakdown;
  }

  return next;
}

export async function fetchCricbuzzScorecard(matchId) {
  if (!matchId) return null;

  const url = `https://www.cricbuzz.com/api/mcenter/scorecard/${matchId}`;
  const response = await fetch(url, { headers: CRICBUZZ_HEADERS });
  if (!response.ok) return null;

  const data = await response.json();
  return parseCricbuzzScorecard(data);
}
