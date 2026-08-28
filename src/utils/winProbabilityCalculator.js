/**
 * Cricket Live Win Probability Calculator
 * Computes dynamic win probability % between Team 1 and Team 2 based on:
 * - Current innings & target
 * - Current Run Rate (CRR) vs Required Run Rate (RRR)
 * - Wickets in hand
 * - Balls remaining
 */

export function calculateWinProbability(match = {}) {
  const t1 = match.team1 || match.homeTeam || { name: 'Team 1' };
  const t2 = match.team2 || match.awayTeam || { name: 'Team 2' };
  const ld = match.liveDetails || {};

  const status = String(match.status || '').toUpperCase();
  if (status === 'COMPLETED' || status === 'FINAL') {
    const winnerId = match.winnerId || ld.winnerId;
    if (winnerId === '1' || winnerId === t1.id) return { team1Prob: 100, team2Prob: 0, leader: t1.name };
    if (winnerId === '2' || winnerId === t2.id) return { team1Prob: 0, team2Prob: 100, leader: t2.name };
    return { team1Prob: 50, team2Prob: 50, leader: 'Tied' };
  }

  const innings = ld.innings || (ld.chaseRuns != null && ld.chaseRuns > 0 ? 2 : 1);
  const totalOvers = 20.0;

  if (innings === 1) {
    const runs = Number(ld.firstRuns ?? t1.runs ?? 0);
    const wkts = Number(ld.firstWickets ?? t1.wickets ?? 0);
    const crr = runs / Math.max(1, (ld.overs ? parseFloat(ld.overs) : 5));
    
    // Innings 1 baseline: projected score vs 170 par T20 score
    let baseProb = 50 + (crr - 8.5) * 5 - (wkts * 3.5);
    baseProb = Math.max(15, Math.min(85, Math.round(baseProb)));
    return {
      team1Prob: baseProb,
      team2Prob: 100 - baseProb,
      leader: baseProb >= 50 ? t1.name : t2.name,
    };
  }

  // Innings 2: Chase calculations
  const target = Number(ld.target ?? (Number(ld.firstRuns ?? t1.runs ?? 160) + 1));
  const chaseRuns = Number(ld.chaseRuns ?? t2.runs ?? 0);
  const chaseWkts = Number(ld.chaseWickets ?? t2.wickets ?? 0);
  const oversStr = String(ld.overs || '10.0');
  const [ov, b] = oversStr.split('.').map(Number);
  const ballsBowled = (ov || 0) * 6 + (b || 0);
  const ballsRemaining = Math.max(1, 120 - ballsBowled);
  const runsNeeded = Math.max(0, target - chaseRuns);
  const wktsRemaining = Math.max(0, 10 - chaseWkts);

  if (runsNeeded <= 0) {
    return { team1Prob: 0, team2Prob: 100, leader: t2.name };
  }
  if (wktsRemaining <= 0) {
    return { team1Prob: 100, team2Prob: 0, leader: t1.name };
  }

  const rrr = (runsNeeded / ballsRemaining) * 6;
  const crr = ballsBowled > 0 ? (chaseRuns / ballsBowled) * 6 : 8.0;

  // Chase probability model
  let chaseProb = 50 + (crr - rrr) * 8 + (wktsRemaining - 5) * 6;
  chaseProb = Math.max(2, Math.min(98, Math.round(chaseProb)));

  return {
    team1Prob: 100 - chaseProb,
    team2Prob: chaseProb,
    leader: chaseProb >= 50 ? (t2.shortName || t2.name) : (t1.shortName || t1.name),
    runsNeeded,
    ballsRemaining,
    rrr: Number(rrr.toFixed(2)),
  };
}
