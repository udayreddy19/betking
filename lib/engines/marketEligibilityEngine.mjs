/**
 * Market Eligibility Engine (lib/engines/marketEligibilityEngine.mjs)
 * Evaluates whether a market definition is ELIGIBLE, INELIGIBLE, SUSPENDED, or COMPLETED
 * based on canonical match state, current innings, overs, balls completed, and format rules.
 */

export const ELIGIBILITY_STATUS = {
  ELIGIBLE: 'ELIGIBLE',
  INELIGIBLE: 'INELIGIBLE',
  SUSPENDED: 'SUSPENDED',
  COMPLETED: 'COMPLETED',
};

export class MarketEligibilityEngine {
  /**
   * Evaluates eligibility of a market definition against current NormalizedMatchState
   */
  evaluateEligibility(marketDef = {}, matchState = {}) {
    if (matchState.isMatchFinished()) {
      return {
        status: ELIGIBILITY_STATUS.COMPLETED,
        reason: 'Match is completed',
      };
    }

    const currentInnings = matchState.currentInnings || 1;
    const key = marketDef.key || '';
    const ballsCompleted = matchState.ballsCompleted || 0;
    const ballsPerOver = matchState.formatRules?.ballsPerOver || 6;
    const powerplayBalls = matchState.formatRules?.powerplayBalls || 36;

    // 1. 1st Over Markets (Completed after 1st over)
    if (key.includes('first_over')) {
      if (currentInnings > 1 || ballsCompleted >= ballsPerOver) {
        return {
          status: ELIGIBILITY_STATUS.COMPLETED,
          reason: '1st Over has already completed',
        };
      }
    }

    // 2. Powerplay Markets (Completed after Powerplay window)
    if (key.includes('powerplay_total') || key.includes('powerplay_wickets')) {
      if (currentInnings > 1 || ballsCompleted >= powerplayBalls) {
        return {
          status: ELIGIBILITY_STATUS.COMPLETED,
          reason: 'Powerplay window has already completed',
        };
      }
    }

    // 3. General 1st Innings Historical Markets
    if (marketDef.innings === 1) {
      if (currentInnings > 1) {
        return {
          status: ELIGIBILITY_STATUS.COMPLETED,
          reason: '1st Innings has completed',
        };
      }
    }

    // 4. Team 1 Total Runs (if Team 1 innings has finished)
    if (key === 'team1_runs' || marketDef.teamRef === 'team1') {
      if (currentInnings > 1) {
        return {
          status: ELIGIBILITY_STATUS.COMPLETED,
          reason: 'Team 1 innings is finished',
        };
      }
    }

    // 5. Team 2 Total Runs (if Team 2 is not batting or has completed innings)
    if (key === 'team2_runs' || marketDef.teamRef === 'team2') {
      if (currentInnings < 2) {
        return {
          status: ELIGIBILITY_STATUS.INELIGIBLE,
          reason: 'Team 2 has not started batting',
        };
      }
      if (currentInnings > 2) {
        return {
          status: ELIGIBILITY_STATUS.COMPLETED,
          reason: 'Team 2 innings is finished',
        };
      }
    }

    // 6. Live Ball / Next Delivery
    if (key === 'next_delivery' || key === 'next_over') {
      if (!matchState.isLive()) {
        return {
          status: ELIGIBILITY_STATUS.INELIGIBLE,
          reason: 'Match is not live',
        };
      }
    }

    return {
      status: ELIGIBILITY_STATUS.ELIGIBLE,
      reason: 'Market is eligible for live betting',
    };
  }
}

export const marketEligibilityEngine = new MarketEligibilityEngine();
