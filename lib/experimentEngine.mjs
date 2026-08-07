/**
 * Enterprise Experiment Engine — BetKing Sportsbook (lib/experimentEngine.mjs)
 * Manages A/B testing, feature flags, odds button UX variants, cashout threshold tests,
 * and promotion recommendation experiment buckets.
 */

const ACTIVE_EXPERIMENTS = new Map([
  ['odds_button_style', { name: 'Odds Button UI Test', variantA: 'BLUE', variantB: 'NEON', ratio: 0.5, enabled: true }],
  ['cashout_slider_ui', { name: 'Cashout Slider UX', variantA: 'SLIDER', variantB: 'PRESETS', ratio: 0.5, enabled: true }],
]);

export function getExperimentVariant(experimentId, userId = 'guest') {
  const exp = ACTIVE_EXPERIMENTS.get(experimentId);
  if (!exp || !exp.enabled) return 'CONTROL';

  const hash = String(userId).split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return (hash % 100) < (exp.ratio * 100) ? 'VARIANT_A' : 'VARIANT_B';
}
