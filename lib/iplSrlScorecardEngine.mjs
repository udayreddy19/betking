/**
 * Module I: Scorecard Engine (IPLSRL)
 * Formats detailed team scorecards, batting cards, bowling cards, partnerships, and fall of wickets.
 */

export function buildIPLSRLScorecard(matchState) {
  if (!matchState) return null;

  const formatInnings = (inn) => {
    if (!inn || inn.runs === undefined) return null;

    const oversFloat = inn.overs + (inn.balls || 0) / 6;
    const crr = oversFloat > 0 ? (inn.runs / oversFloat).toFixed(2) : '0.00';

    return {
      runs: inn.runs || 0,
      wickets: inn.wickets || 0,
      overs: `${inn.overs || 0}.${inn.balls || 0}`,
      crr,
      battingCard: (inn.battingCard || []).map(b => ({
        playerId: b.playerId,
        name: b.name || 'Batter',
        runs: b.runs || 0,
        balls: b.balls || 0,
        fours: b.fours || 0,
        sixes: b.sixes || 0,
        strikeRate: b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(1) : '0.0',
        outStatus: b.outStatus || 'not out',
      })),
      bowlingCard: (inn.bowlingCard || []).map(bw => ({
        playerId: bw.playerId,
        name: bw.name || 'Bowler',
        overs: `${bw.overs || 0}.${bw.balls || 0}`,
        maidens: bw.maidens || 0,
        runs: bw.runs || 0,
        wickets: bw.wickets || 0,
        economy: bw.overs > 0 ? (bw.runs / (bw.overs + (bw.balls || 0) / 6)).toFixed(2) : '0.00',
      })),
      fallOfWickets: inn.fallOfWickets || [],
      partnerships: inn.partnerships || [],
    };
  };

  return {
    matchId: matchState.matchId,
    status: matchState.status,
    toss: matchState.toss,
    homeTeam: matchState.homeTeam,
    awayTeam: matchState.awayTeam,
    currentInnings: matchState.currentInnings,
    targetScore: matchState.targetScore,
    innings1: formatInnings(matchState.innings1),
    innings2: formatInnings(matchState.innings2),
    resultSummary: matchState.resultSummary || null,
  };
}
