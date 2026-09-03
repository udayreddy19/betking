/**
 * OddsEngineV3 — MarketEligibilityEngine
 * 
 * Dynamically filters markets based on match phase, innings, balls remaining, wickets, and data stream availability.
 */

import { getFormatRules } from '../format/CricketFormatRules.mjs';

/**
 * Balls completed at/after which a 0–N milestone stops being bettable.
 * Close once ~60% of the window is done so late ladders cannot keep printing:
 *   0–5  → from the 4th over  (after 3 overs)
 *   0–10 → from the 7th over  (after 6 overs)
 *   0–15 → from the 10th over (after 9 overs)
 *   0–20 → from the 13th over (after 12 overs)
 *
 * @param {number} targetOvers
 * @param {number} [ballsPerOver=6]
 * @returns {number}
 */
export function milestoneBetCutoffBalls(targetOvers, ballsPerOver = 6) {
  const bp = Math.max(1, Number(ballsPerOver) || 6);
  const target = Number(targetOvers);
  if (!Number.isFinite(target) || target <= 0) return Number.POSITIVE_INFINITY;
  const oversDoneAtCut = Math.max(1, Math.round(target * 0.6));
  return oversDoneAtCut * bp;
}

function ballsPerOverFromState(state) {
  const rules = getFormatRules(state?.format);
  if (rules?.ballsPerOver) return rules.ballsPerOver;
  const bpi = Number(state?.ballsPerInnings) || 0;
  if (bpi === 100) return 5; // The Hundred fallback
  return 6;
}

export function isMarketEligible(marketKey, state) {
  if (!state || state.status === 'COMPLETED' || state.status === 'DETERMINED') {
    return false;
  }

  // Pre-match vs Live
  const isLive = state.status === 'LIVE' || state.isLive;
  const currentBalls = state.ballsCompleted || 0;
  const currentInnings = state.currentInnings || 1;

  const keyUpper = (marketKey || '').toUpperCase();

  // Delivery markets require live match and at least 1 ball or innings in progress (hard blocked only when feed is known absent)
  if (keyUpper.includes('DELIVERY')) {
    if (!isLive || currentBalls < 0) return false;
    if (state.hasBallFeed === false) return false;
  }

  const milestoneHit = keyUpper.match(/OVERS_0_(\d+)/);
  if (milestoneHit) {
    const targetOvers = Number(milestoneHit[1]);
    const cutoff = milestoneBetCutoffBalls(targetOvers, ballsPerOverFromState(state));
    if (currentBalls >= cutoff) return false;
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
