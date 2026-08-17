import { isPlaceholderPlayerName } from './cricketPlayers';

function isUsablePlayer(player) {
  const name = player?.name || (typeof player === 'string' ? player : '');
  return !!(name && !isPlaceholderPlayerName(name));
}

function batterFromScorecard(b) {
  return {
    name: b.name,
    runs: b.runs ?? 0,
    balls: b.balls ?? 0,
    fours: b.fours ?? 0,
    sixes: b.sixes ?? 0,
  };
}

function mergeLiveWithScorecardBatter(live, card) {
  if (!card) return live;
  if (!isUsablePlayer(live)) return batterFromScorecard(card);
  if (String(live.name).toLowerCase() === String(card.name).toLowerCase()) {
    return {
      ...live,
      runs: Math.max(live.runs ?? 0, card.runs ?? 0),
      balls: Math.max(live.balls ?? 0, card.balls ?? 0),
      fours: Math.max(live.fours ?? 0, card.fours ?? 0),
      sixes: Math.max(live.sixes ?? 0, card.sixes ?? 0),
    };
  }
  if ((live.runs ?? 0) === 0 && (live.balls ?? 0) === 0 && ((card.runs ?? 0) > 0 || (card.balls ?? 0) > 0)) {
    return batterFromScorecard(card);
  }
  return live;
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

function pickCurrentBattingInnings(scorecardInnings = [], liveDetails = {}) {
  const battingNow = scorecardInnings.filter((inn) =>
    (inn.batters || []).some(isAtCreaseBatter),
  );
  if (battingNow.length) return battingNow[battingNow.length - 1];
  const started = scorecardInnings.filter((inn) =>
    (inn.batters || []).some(isWaitingBatter),
  );
  if (started.length) return started[started.length - 1];
  if (liveDetails.inningsId != null) {
    const found = scorecardInnings.find((inn) => (inn.inningsId ?? 1) === liveDetails.inningsId);
    if (found) return found;
  }
  return scorecardInnings[scorecardInnings.length - 1] || null;
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

  let atCrease = (currentInnings.batters || []).filter(isAtCreaseBatter);
  if (atCrease.length < 2) {
    const waiting = (currentInnings.batters || []).filter(
      (b) => isWaitingBatter(b) && !atCrease.some((a) => a.name === b.name),
    );
    atCrease = [...atCrease, ...waiting].slice(0, 2);
  }
  if (atCrease.length < 2) {
    const withStats = (currentInnings.batters || [])
      .filter((b) => isUsablePlayer(b) && ((b.balls ?? 0) > 0 || (b.runs ?? 0) > 0))
      .filter((b) => !atCrease.some((a) => a.name === b.name))
      .slice(-2);
    atCrease = [...atCrease, ...withStats].slice(0, 2);
  }

  next.batter1 = mergeLiveWithScorecardBatter(next.batter1, atCrease[0]);
  next.batter2 = mergeLiveWithScorecardBatter(next.batter2, atCrease[1]);

  if (!isUsablePlayer(next.bowler) && currentInnings.bowlers?.length) {
    const activeBowler = currentInnings.bowlers.find((b) => {
      const ovs = String(b.overs ?? '');
      return /\.\d*[1-9]/.test(ovs);
    }) || currentInnings.bowlers[currentInnings.bowlers.length - 1];
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
  }

  return next;
}
