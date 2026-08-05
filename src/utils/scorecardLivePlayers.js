/** Fill live batter/bowler slots from scorecard when comm API omits them. */
export function enrichLivePlayersFromScorecard(liveDetails = {}, scorecardInnings = []) {
  if (!scorecardInnings.length) return liveDetails;

  const next = { ...liveDetails };
  const inningsId = next.inningsId
    ?? ((next.chaseRuns != null && next.firstRuns != null) ? 2 : 1);
  const currentInnings = scorecardInnings.find((inn) => (inn.inningsId ?? 1) === inningsId)
    || scorecardInnings[scorecardInnings.length - 1];
  if (!currentInnings) return next;

  const battersList = currentInnings.batters || [];
  const atCrease = battersList.filter(
    (b) => b.notOut || !b.dismissal || /^(batting|not out)$/i.test(b.dismissal || ''),
  );
  const activeBatters = atCrease.length ? atCrease : battersList.slice(0, 2);

  if (!next.batter1?.name && activeBatters[0]) {
    next.batter1 = {
      name: activeBatters[0].name,
      runs: activeBatters[0].runs ?? 0,
      balls: activeBatters[0].balls ?? 0,
      fours: activeBatters[0].fours ?? 0,
      sixes: activeBatters[0].sixes ?? 0,
    };
  }
  if (!next.batter2?.name && activeBatters[1]) {
    next.batter2 = {
      name: activeBatters[1].name,
      runs: activeBatters[1].runs ?? 0,
      balls: activeBatters[1].balls ?? 0,
      fours: activeBatters[1].fours ?? 0,
      sixes: activeBatters[1].sixes ?? 0,
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
