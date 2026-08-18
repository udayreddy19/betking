/** Server-side promo / bonus wagering rules. Keep in sync with src/utils/wageringRules.js */

/** Bonus funds may only be staked on selections at this decimal odds or higher. */
export const BONUS_MIN_BET_ODDS = 1.75;

/** Bonus must be turned over this many times before winnings can be withdrawn. */
export const BONUS_WAGERING_MULTIPLIER = 5;

export function bonusOddsQualify(odds) {
  return Number(odds) >= BONUS_MIN_BET_ODDS;
}

export function everyLegMeetsBonusOdds(oddsList) {
  if (!Array.isArray(oddsList) || oddsList.length === 0) return false;
  return oddsList.every((odds) => bonusOddsQualify(odds));
}
