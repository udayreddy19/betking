/**
 * Cricbuzz mcenter scorecard API — full batting/bowling squads per match.
 */

const CRICBUZZ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; BetKing/1.0)',
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

export async function fetchCricbuzzScorecard(matchId) {
  if (!matchId) return null;

  const url = `https://www.cricbuzz.com/api/mcenter/scorecard/${matchId}`;
  const response = await fetch(url, { headers: CRICBUZZ_HEADERS });
  if (!response.ok) return null;

  const data = await response.json();
  return parseCricbuzzScorecard(data);
}
