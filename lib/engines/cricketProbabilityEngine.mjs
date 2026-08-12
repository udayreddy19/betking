/**
 * Cricket Probability Engine (lib/engines/cricketProbabilityEngine.mjs)
 * Calculates win probabilities and score distributions based on current score, wickets, remaining balls, target, and run rates.
 */

export class CricketProbabilityEngine {
  /**
   * Calculates Match Winner probabilities for Cricket (Team 1 vs Team 2)
   */
  calculateMatchWinnerProbabilities(matchState) {
    const isLive = matchState.isLive();

    if (!isLive) {
      // Pre-Match baseline (default 52% home / 48% away)
      return {
        team1: 0.52,
        team2: 0.48,
        draw: null,
      };
    }

    const currentInnings = matchState.currentInnings || 1;
    const team1Runs = matchState.teams?.team1?.runs || 0;
    const team2Runs = matchState.teams?.team2?.runs || 0;

    if (currentInnings === 1) {
      // 1st Innings: Estimate based on projected total
      const oversNum = parseFloat(String(matchState.teams?.team1?.overs || '0.0'));
      const ballsBowled = Math.floor(oversNum) * 6 + Math.round((oversNum - Math.floor(oversNum)) * 10);
      const wicketsLost = matchState.teams?.team1?.wickets || 0;

      const currentRunRate = ballsBowled > 0 ? (team1Runs / (ballsBowled / 6)) : 8.0;
      const wicketsFactor = Math.max(0.2, (10 - wicketsLost) / 10);
      const projectedScore = Math.round(team1Runs + (120 - ballsBowled) / 6 * currentRunRate * wicketsFactor);

      // Higher projected score -> higher Team 1 win probability
      const team1Prob = Math.max(0.15, Math.min(0.85, 0.50 + (projectedScore - 165) * 0.005));
      return {
        team1: Number(team1Prob.toFixed(3)),
        team2: Number((1 - team1Prob).toFixed(3)),
        draw: null,
      };
    }

    // 2nd Innings: Chasing Team (Team 2) vs Team 1
    const target = matchState.target || (team1Runs + 1);
    const runsNeeded = Math.max(0, target - team2Runs);
    const ballsRemaining = matchState.ballsRemaining != null ? matchState.ballsRemaining : 120;
    const wicketsLost = matchState.teams?.team2?.wickets || 0;
    const wicketsRemaining = 10 - wicketsLost;

    if (team2Runs >= target) {
      return { team1: 0.0, team2: 1.0, draw: null };
    }
    if (wicketsRemaining <= 0 || ballsRemaining <= 0) {
      return { team1: 1.0, team2: 0.0, draw: null };
    }

    const rrr = ballsRemaining > 0 ? (runsNeeded / (ballsRemaining / 6)) : 99;
    const crr = (120 - ballsRemaining) > 0 ? (team2Runs / ((120 - ballsRemaining) / 6)) : 8.0;

    // Logistic probability function based on RRR vs CRR and wickets remaining
    const rrrDiff = crr - rrr;
    const wicketWeight = (wicketsRemaining / 10) * 1.5;
    const logit = rrrDiff * 0.25 + (wicketWeight - 0.75);

    const team2Prob = Math.max(0.01, Math.min(0.99, 1 / (1 + Math.exp(-logit))));
    const team1Prob = 1 - team2Prob;

    return {
      team1: Number(team1Prob.toFixed(3)),
      team2: Number(team2Prob.toFixed(3)),
      draw: null,
    };
  }

  /**
   * Calculates Over/Under Probability for Team Total Runs line L
   */
  calculateTeamTotalOverUnderProbability(teamRuns = 0, line = 165.5, remainingBalls = 120, wicketsLost = 0, isSecondInnings = false, target = null) {
    if (teamRuns > line) return { over: 1.0, under: 0.0 };
    if (isSecondInnings && target != null && line >= target) return { over: 0.0, under: 1.0 };
    if (remainingBalls <= 0) return { over: 0.0, under: 1.0 };

    const wicketsRemaining = 10 - wicketsLost;
    const expectedAdditionalRuns = (remainingBalls / 6) * 7.5 * (wicketsRemaining / 10);
    const expectedFinalScore = teamRuns + expectedAdditionalRuns;

    const diff = expectedFinalScore - line;
    const overProb = Math.max(0.05, Math.min(0.95, 0.50 + diff * 0.02));

    return {
      over: Number(overProb.toFixed(3)),
      under: Number((1 - overProb).toFixed(3)),
    };
  }

  /**
   * Calculates Over/Under Probability for Total Match Runs line L
   */
  calculateMatchTotalOverUnderProbability(currentTotalRuns = 0, line = 315.5, remainingBalls = 120, isSecondInnings = false) {
    if (currentTotalRuns > line) return { over: 1.0, under: 0.0 };
    if (remainingBalls <= 0 && isSecondInnings) return { over: 0.0, under: 1.0 };

    const expectedAdditionalRuns = (remainingBalls / 6) * 7.5;
    const expectedFinalTotal = currentTotalRuns + expectedAdditionalRuns;

    const diff = expectedFinalTotal - line;
    const overProb = Math.max(0.05, Math.min(0.95, 0.50 + diff * 0.015));

    return {
      over: Number(overProb.toFixed(3)),
      under: Number((1 - overProb).toFixed(3)),
    };
  }
}

export const cricketProbabilityEngine = new CricketProbabilityEngine();
