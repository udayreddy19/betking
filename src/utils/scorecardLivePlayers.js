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
