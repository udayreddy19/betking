/**
 * OddsEngineV3 — MarketEligibilityEngine
 * 
 * Dynamically filters markets based on match phase, innings, balls remaining, wickets, and data stream availability.
 */

export function isMarketEligible(marketKey, state) {
  if (!state || state.status === 'COMPLETED' || state.status === 'DETERMINED') {
    return false;
  }

  // Pre-match vs Live
  const isLive = state.status === 'LIVE' || state.isLive;
  const currentBalls = state.ballsCompleted || 0;
  const currentInnings = state.currentInnings || 1;

  const keyUpper = (marketKey || '').toUpperCase();

  // Delivery markets require live ball-by-ball stream
  if (keyUpper.includes('DELIVERY') && (!isLive || currentBalls <= 0)) {
    return false;
  }

  // Powerplay overs 0-5 segment only eligible before/at boundary (close when complete)
  if ((keyUpper.includes('OVERS_0_5') || keyUpper.includes('POWERPLAY')) && currentBalls >= 30) {
    return false;
  }

  // Overs 0-10 segment only eligible in first 60 balls
  if (keyUpper.includes('OVERS_0_10') && currentBalls >= 60) {
    return false;
  }

  // Overs 0-15 segment only eligible in first 90 balls
  if (keyUpper.includes('OVERS_0_15') && currentBalls >= 90) {
    return false;
  }

  // Overs 0-20 segment only eligible in first 120 balls
  if (keyUpper.includes('OVERS_0_20') && currentBalls >= 120) {
    return false;
  }

  // Innings-scoped overs / next-over / dismissal / wicket markets
  const scopedInn = keyUpper.match(/^I([12])_/);
  if (scopedInn) {
    const marketInn = Number(scopedInn[1]);
    if (marketInn !== currentInnings && currentInnings > 0) return false;
  }

  // Past dismissal markets must not stay bettable
  const dismissalHit = keyUpper.match(/TEAM_SCORE_AT_(\d+)_DISMISSAL/);
  if (dismissalHit) {
    const batting = state.battingTeamId === state.team1?.id ? state.team1 : state.team2;
    const wkts = Number(batting?.wickets) || 0;
    if (wkts >= Number(dismissalHit[1])) return false;
  }

  // Team / match totals — allow chase-innings markets with target capping (generators enforce bounds).
  // Legacy first-innings-only alt totals remain gated by market key elsewhere.
  if (
    currentInnings >= 2
    && (keyUpper.startsWith('TEAM_TOTAL_ALT_')
      || keyUpper === 'TEAM1_RUNS'
      || keyUpper === 'TEAM2_RUNS'
      || keyUpper.startsWith('MATCH_TOTAL_'))
    && keyUpper !== 'MATCH_TOTAL'
    && keyUpper !== 'TEAM_TOTAL'
  ) {
    return false;
  }

  return true;
}
