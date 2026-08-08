/**
 * Cricbuzz mcenter scorecard API — full batting/bowling squads per match.
 */

const CRICBUZZ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://www.cricbuzz.com/',
};

function mapBatsmanRow(b) {
  if (!b?.batName) return null;
  const balls = b.balls ?? 0;
  const runs = b.runs ?? 0;
  const outDesc = (b.outDesc || '').trim();
  const isAtCrease = !outDesc
    || b.wicketCode === 'NOT_OUT'
    || /^batting$/i.test(outDesc)
    || /^not out$/i.test(outDesc);
  return {
    id: b.batId,
    name: b.batName,
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
  if (!b?.bowlName) return null;
  return {
    id: b.bowlerId ?? b.bowlId,
    name: b.bowlName,
    role: 'Bowler',
    overs: b.overs ?? 0,
    runs: b.runs ?? 0,
    wickets: b.wickets ?? 0,
    economy: b.economy ?? 0,
    isCaptain: !!b.isCaptain,
  };
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

    return {
      inningsId: inn.inningsId,
      batTeamId: bat.batTeamId,
      batTeamName: bat.batTeamName,
      batTeamShortName: bat.batTeamShortName,
      scoreDetails,
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
  };
}

/** Fill live batter/bowler slots from scorecard when comm API omits them. */
export function enrichLivePlayersFromScorecard(liveDetails = {}, scorecardInnings = []) {
  if (!scorecardInnings.length) return liveDetails;

  const next = { ...liveDetails };
  // For Test matches, use explicit inningsId (1-4); for limited-overs, infer from chase
  const inningsId = next.inningsId
    ?? ((next.testInnings?.length > 0) ? next.testInnings[next.testInnings.length - 1].inningsId : null)
    ?? ((next.chaseRuns != null && next.firstRuns != null) ? 2 : 1);
  const currentInnings = scorecardInnings.find((inn) => (inn.inningsId ?? 1) === inningsId)
    || scorecardInnings[scorecardInnings.length - 1];
  if (!currentInnings) return next;

  const atCrease = (currentInnings.batters || []).filter(
    (b) => b.notOut && /^(batting|not out)$/i.test(b.dismissal || ''),
  );

  if (!next.batter1?.name && atCrease[0]) {
    next.batter1 = {
      name: atCrease[0].name,
      runs: atCrease[0].runs ?? 0,
      balls: atCrease[0].balls ?? 0,
      fours: atCrease[0].fours ?? 0,
      sixes: atCrease[0].sixes ?? 0,
    };
  }
  if (!next.batter2?.name && atCrease[1]) {
    next.batter2 = {
      name: atCrease[1].name,
      runs: atCrease[1].runs ?? 0,
      balls: atCrease[1].balls ?? 0,
      fours: atCrease[1].fours ?? 0,
      sixes: atCrease[1].sixes ?? 0,
    };
  }

  if (!next.bowler?.name && currentInnings.bowlers?.length) {
    const activeBowler = currentInnings.bowlers.find((b) => {
      const ovs = String(b.overs ?? '');
      return /\.\d*[1-9]/.test(ovs);
    }) || currentInnings.bowlers[currentInnings.bowlers.length - 1];
    if (activeBowler) {
      next.bowler = {
        name: activeBowler.name,
        overs: activeBowler.overs ?? 0,
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
