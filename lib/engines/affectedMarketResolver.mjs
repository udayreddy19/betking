/**
 * Affected Market Resolver (lib/engines/affectedMarketResolver.mjs)
 * Dependency graph for event-driven selective repricing.
 * Identifies affected markets on ball/wicket/run events so system does NOT reprice everything unnecessarily.
 */

export class AffectedMarketResolver {
  getAffectedMarketKeys(eventType = 'BALL_COMPLETED') {
    switch (eventType) {
      case 'WICKET':
        return ['winner', 'team1_runs', 'team2_runs', 'match_total_runs', 'next_wicket'];
      case 'SIX':
        return ['winner', 'team1_runs', 'team2_runs', 'match_total_runs', 'match_sixes'];
      case 'FOUR':
        return ['winner', 'team1_runs', 'team2_runs', 'match_total_runs', 'match_fours'];
      case 'RUN_SCORED':
      case 'BALL_COMPLETED':
        return ['winner', 'team1_runs', 'team2_runs', 'match_total_runs', 'next_delivery'];
      case 'INNINGS_COMPLETED':
        return ['winner', 'team1_runs', 'team2_runs', 'match_total_runs', 'powerplay_total', 'first_over_runs'];
      default:
        return null; // All markets
    }
  }
}

export const affectedMarketResolver = new AffectedMarketResolver();
