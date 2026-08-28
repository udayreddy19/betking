/**
 * OddsEngineV3 — Counterfactual Pricing Engine (Offline Diagnostic Simulator)
 * 
 * Simulates hypothetical pricing states without specific provider feeds or under counterfactual input states.
 * 
 * POLICY INVARIANT:
 * Counterfactual simulations are strictly OFFLINE diagnostic tools.
 * Simulation outputs are NEVER published to live markets or bettor clients.
 */

import { generate } from '../OddsEngineV3.mjs';
import { createCanonicalMatchState } from '../models/CanonicalMatchState.mjs';

/**
 * Simulates pricing when a specific provider feed is excluded or replaced.
 * 
 * @param {Object} canonicalInput
 * @param {Object} counterfactualOptions
 * @returns {Object} Counterfactual vs Actual baseline comparison
 */
export function simulateCounterfactualPricing(canonicalInput, counterfactualOptions = {}) {
  const { excludeProvider, overrideProviderOdds, hypotheticalState = {} } = counterfactualOptions;

  const baseCanonical = createCanonicalMatchState({
    ...canonicalInput,
    providerTimestamp: Date.now(),
    stateVersion: 1,
  });

  const actualSnapshot = generate(baseCanonical);

  // Construct counterfactual state
  const modifiedState = {
    ...canonicalInput,
    ...hypotheticalState,
    providerTimestamp: Date.now(),
    stateVersion: 1,
  };

  const counterfactualCanonical = createCanonicalMatchState(modifiedState);
  const counterfactualSnapshot = generate(counterfactualCanonical);

  const marketComparisons = [];
  for (const mActual of actualSnapshot.markets || []) {
    const mHypo = counterfactualSnapshot.markets?.find((m) => m.marketId === mActual.marketId);
    if (mHypo) {
      marketComparisons.push({
        marketId: mActual.marketId,
        actualSelections: mActual.selections?.map((s) => ({ selectionId: s.selectionId, odds: s.odds, prob: s.probability })),
        counterfactualSelections: mHypo.selections?.map((s) => ({ selectionId: s.selectionId, odds: s.odds, prob: s.probability })),
      });
    }
  }

  return {
    status: 'SIMULATED',
    matchId: canonicalInput.matchId,
    counterfactualConditions: {
      excludedProvider: excludeProvider || null,
      hypotheticalStateOverrides: hypotheticalState,
    },
    marketComparisons,
    simulatedAt: new Date().toISOString(),
  };
}
