/**
 * OddsEngineV3 — Event-First Odds Reaction & Noise Suppression Engine
 * 
 * Prioritizes instantaneous response to verified canonical match events
 * while filtering out spurious single-feed noise and micro-reversal jitter.
 * 
 * SHADOW / CANDIDATE ONLY.
 */

export const VERIFIED_EVENT_TYPES = Object.freeze({
  CRICKET: ['WICKET', 'FOUR', 'SIX', 'EXTRA', 'INNINGS_BREAK', 'SUPER_OVER', 'MAIDEN'],
  SOCCER: ['GOAL', 'RED_CARD', 'PENALTY', 'SUBSTITUTION', 'HALF_TIME', 'VAR_DECISION'],
  TENNIS: ['BREAK_POINT_WON', 'SET_WON', 'TIE_BREAK_POINT', 'MATCH_POINT'],
  BASKETBALL: ['RUN_10_0', 'TECHNICAL_FOUL', 'TIMEOUT', 'QUARTER_END', 'BUZZER_BEATER'],
});

/**
 * Evaluates match event authenticity and calculates candidate odds transition.
 */
export function processEventOddsTransition({
  sport = 'cricket',
  previousProbability = 0.50,
  rawCandidateProbability = 0.50,
  matchStateEvent = null,
  providerDivergence = 0.02,
  feedLatencyMs = 85,
} = {}) {
  const normSport = String(sport).toUpperCase();
  const validSportEvents = VERIFIED_EVENT_TYPES[normSport] || [];
  const isVerifiedEvent = Boolean(matchStateEvent && validSportEvents.includes(String(matchStateEvent).toUpperCase()));

  const delta = Math.abs(rawCandidateProbability - previousProbability);
  let adjustedProbability = rawCandidateProbability;
  let classification = 'INFORMATIONAL';
  let noiseFiltered = false;

  if (isVerifiedEvent) {
    // Fast path: Allow immediate 100% reaction to verified real-world events
    classification = 'EVENT_RESPONSE';
    adjustedProbability = rawCandidateProbability;
  } else if (delta > 0.08 && providerDivergence > 0.12) {
    // Noise path: Large probability shift without match event and high provider disagreement -> Dampen
    classification = 'NOISE_SUPPRESSED';
    const dampingFactor = Math.max(0.25, 1 - providerDivergence);
    adjustedProbability = previousProbability + (rawCandidateProbability - previousProbability) * dampingFactor;
    noiseFiltered = true;
  } else if (delta > 0.15 && !matchStateEvent) {
    // Single provider spike without game state event
    classification = 'PROVIDER_SPIKE_SUPPRESSED';
    adjustedProbability = previousProbability + (rawCandidateProbability - previousProbability) * 0.40;
    noiseFiltered = true;
  }

  const finalP = Math.max(0.001, Math.min(0.999, Number(adjustedProbability.toFixed(4))));

  return {
    isVerifiedEvent,
    event: matchStateEvent,
    classification,
    previousProbability,
    rawCandidateProbability,
    adjustedProbability: finalP,
    fairOdds: Number((1 / finalP).toFixed(4)),
    delta: Number(delta.toFixed(4)),
    noiseFiltered,
    reactionLatencyMs: isVerifiedEvent ? Math.min(45, feedLatencyMs) : feedLatencyMs,
    processedAt: new Date().toISOString(),
  };
}
