/** Fill live batter/bowler slots from scorecard when comm API omits them. */
export function enrichLivePlayersFromScorecard(liveDetails = {}, scorecardInnings = []) {
  if (!scorecardInnings.length) return liveDetails;

  const next = { ...liveDetails };
  const inningsId = next.inningsId
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
