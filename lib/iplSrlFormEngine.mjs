/**
 * Module D: IPLSRL Player Form Engine
 * Dynamic player form rating calculations integrated with Feature Store and Probability Engine.
 */

import { getIPLSRLPlayerById } from './iplSrlPlayerEngine.mjs';

/**
 * Calculate dynamic player form ratings based on recent performance metrics and match contextual factors.
 */
export function calculateIPLSRLPlayerForm(playerId, context = {}) {
  const player = getIPLSRLPlayerById(playerId);
  if (!player) {
    return { currentFormRating: 75, battingForm: 75, bowlingForm: 75, fieldingForm: 75 };
  }

  const {
    recentRuns = player.stats.runs / Math.max(1, player.stats.matches),
    recentWickets = player.stats.wickets / Math.max(1, player.stats.matches),
    recentStrikeRate = player.stats.balls > 0 ? (player.stats.runs / player.stats.balls) * 100 : 120,
    recentEconomy = player.stats.wickets > 0 ? 8.0 : 8.5,
    venueMultiplier = 1.0,
    fitnessMultiplier = (player.fitness || 90) / 100,
    consistency = (player.consistency || 80) / 100,
  } = context;

  // Batting form rating (0-100 scale)
  const baseBatting = player.battingRating || 75;
  const srBonus = Math.max(-10, Math.min(15, (recentStrikeRate - 130) / 5));
  const runBonus = Math.max(-10, Math.min(15, (recentRuns - 30) / 2));
  const battingForm = Math.round(
    Math.max(40, Math.min(99, (baseBatting * 0.5 + (baseBatting + srBonus + runBonus) * 0.5) * fitnessMultiplier * venueMultiplier))
  );

  // Bowling form rating (0-100 scale)
  const baseBowling = player.bowlingRating || 75;
  const wicketBonus = Math.max(-10, Math.min(15, (recentWickets - 1.2) * 10));
  const econBonus = Math.max(-10, Math.min(15, (8.0 - recentEconomy) * 8));
  const bowlingForm = Math.round(
    Math.max(40, Math.min(99, (baseBowling * 0.5 + (baseBowling + wicketBonus + econBonus) * 0.5) * fitnessMultiplier))
  );

  // Fielding form rating
  const fieldingForm = Math.round(Math.max(50, Math.min(99, (player.fieldingRating || 80) * fitnessMultiplier)));

  // Weighted overall current form rating
  const overall = Math.round(
    battingForm * 0.45 + bowlingForm * 0.45 + fieldingForm * 0.1
  );

  return {
    currentFormRating: overall,
    battingForm,
    bowlingForm,
    fieldingForm,
    consistencyScore: Math.round(consistency * 100),
  };
}
