/**
 * DEPRECATED STUB — DO NOT IMPORT.
 *
 * Real promotion flows live in:
 *   - lib/signupPromoCodes.mjs
 *   - lib/promotionsEngine.mjs
 *   - lib/referralLoyaltyEngine.mjs
 *
 * This in-memory Map would falsely validate promo codes if used in production.
 */
export function validateAndApplyPromoCode() {
  throw Object.assign(
    new Error('lib/promotionEngine.mjs is a deprecated stub. Use signupPromoCodes / promotionsEngine.'),
    { code: 'PROMO_ENGINE_DEPRECATED', status: 500 },
  );
}

export default { validateAndApplyPromoCode };
