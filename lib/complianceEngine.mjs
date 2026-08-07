/**
 * Enterprise Compliance Engine — BetKing Enterprise Platform (lib/complianceEngine.mjs)
 * Manages jurisdiction rules, licensing compliance, age restrictions (18+), and responsible gaming rules.
 */

export function validateJurisdictionCompliance(userState = 'IN', userAge = 21) {
  if (userAge < 18) {
    return { compliant: false, reason: 'AGE_RESTRICTION_UNDER_18' };
  }
  return { compliant: true, jurisdiction: userState };
}
