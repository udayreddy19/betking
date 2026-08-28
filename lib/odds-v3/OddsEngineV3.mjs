/**
 * OddsEngineV3 — Master Live Cricket Market Engine
 * 
 * Pipeline:
 *   CanonicalMatchState
 *     → MatchStateValidator
 *     → Market Eligibility Engine
 *     → 30+ Market Generators Across 8 Groups
 *     → MarketValidator
 *     → OddsSnapshot
 */

import { validateMatchState } from './validation/MatchStateValidator.mjs';
import { validateMarket } from './validation/MarketValidator.mjs';
import { createOddsSnapshot } from './models/OddsSnapshot.mjs';
import { DEFAULT_MARGIN_CONFIG } from './pricing/MarginCalculator.mjs';
import { generateMatchWinnerMarket } from './markets/MatchWinnerMarket.mjs';
import { generateTeamTotalMarket } from './markets/TeamTotalMarket.mjs';
import { generateMatchTotalMarket } from './markets/MatchTotalMarket.mjs';
import { generateExtendedMatchMarkets } from './markets/matchWinner.mjs';
import { generateExtendedMatchTotals } from './markets/matchTotals.mjs';
import { generateExtendedInningsTotals } from './markets/inningsTotal.mjs';
import { generateExtendedOverMarkets } from './markets/overTotal.mjs';
import { generateExtendedDeliveryMarkets } from './markets/deliveryTotal.mjs';
import { generateExtendedWicketMarkets } from './markets/wicketMarkets.mjs';
import { generateExtendedPlayerMarkets } from './markets/playerRuns.mjs';
import { generateExtendedH2HMarkets } from './markets/headToHead.mjs';
import { isMarketEligible } from './eligibility/marketEligibility.mjs';
import { applyBookIntegrity, shouldSkipCompactLiveMarket } from './bookIntegrity.mjs';
import { generateOtherSportsSnapshot, isCricketSport } from './otherSportsOdds.mjs';
import { evaluateFeedCircuitBreaker, applyCircuitBreakerToMarkets } from './circuitBreaker.mjs';
import { applyVolatilityProtection } from './volatilityFilter.mjs';

export function generate(matchState, config = {}) {
  const marginConfig = { ...DEFAULT_MARGIN_CONFIG, ...(config.margins || {}) };
  const debug = config.debug || false;

  if (!isCricketSport(matchState?.sport)) {
    return generateOtherSportsSnapshot(matchState, config);
  }

  const status = String(matchState?.status || '').toUpperCase();
  if (status === 'COMPLETED' || status === 'FINISHED' || status === 'POST') {
    // Still settle match winner (incl. ties as PUSH) when canonical scores are present.
    try {
      const completedValidation = validateMatchState(matchState);
      if (completedValidation.valid && completedValidation.determined) {
        const winnerMarket = generateMatchWinnerMarket(matchState, completedValidation, marginConfig);
        return createOddsSnapshot({
          matchId: matchState.matchId || matchState?.id || 'unknown',
          stateVersion: matchState.stateVersion || 0,
          status: 'DETERMINED',
          markets: [winnerMarket],
        });
      }
    } catch {
      // fall through to empty determined snapshot
    }
    return createOddsSnapshot({
      matchId: matchState?.matchId || matchState?.id || 'unknown',
      stateVersion: matchState?.stateVersion || 0,
      status: 'DETERMINED',
      markets: [],
    });
  }

  const validation = validateMatchState(matchState);

  if (!validation.valid) {
    return createOddsSnapshot({
      matchId: matchState?.matchId || 'unknown',
      stateVersion: matchState?.stateVersion || 0,
      status: 'INVALID_STATE',
      markets: [],
    });
  }

  // Step 2: If determined, produce settled snapshot
  if (validation.determined) {
    const winnerMarket = generateMatchWinnerMarket(matchState, validation, marginConfig);
    return createOddsSnapshot({
      matchId: matchState.matchId,
      stateVersion: matchState.stateVersion,
      status: 'DETERMINED',
      markets: [winnerMarket],
    });
  }

  // List-card / aggregator path: winner market only (full book is generated per-match).
  if (config.winnerOnly) {
    const winner = generateMatchWinnerMarket(matchState, validation, marginConfig);
    const protectedMarkets = applyBookIntegrity(winner?.marketId ? [winner] : []);
    return createOddsSnapshot({
      matchId: matchState.matchId,
      stateVersion: matchState.stateVersion,
      status: protectedMarkets[0]?.status === 'OPEN' ? 'OK' : (protectedMarkets[0]?.status || 'OK'),
      markets: protectedMarkets,
    });
  }

  // Step 3: Generate markets from all 8 groups
  const rawMarkets = [];

  // Group 1 — Core Match Markets
  try {
    const winner = generateMatchWinnerMarket(matchState, validation, marginConfig);
    if (winner.status === 'OPEN') rawMarkets.push(winner);
    const extMatch = generateExtendedMatchMarkets(matchState, validation, marginConfig);
    rawMarkets.push(...extMatch);
  } catch (err) {
    if (debug) console.warn('[OddsEngineV3] Match markets error:', err);
  }

  // Group 2 — Match Totals
  try {
    const mt = generateMatchTotalMarket(matchState, validation, marginConfig);
    if (mt.status === 'OPEN') rawMarkets.push(mt);
    const extMt = generateExtendedMatchTotals(matchState, validation, marginConfig);
    rawMarkets.push(...extMt);
  } catch (err) {
    if (debug) console.warn('[OddsEngineV3] Match totals error:', err);
  }

  // Group 3 — Innings Totals
  try {
    const tt = generateTeamTotalMarket(matchState, validation, marginConfig);
    if (tt.status === 'OPEN') rawMarkets.push(tt);
    const extTt = generateExtendedInningsTotals(matchState, validation, marginConfig);
    rawMarkets.push(...extTt);
  } catch (err) {
    if (debug) console.warn('[OddsEngineV3] Innings totals error:', err);
  }

  // Group 4 — Over Markets
  try {
    const extOv = generateExtendedOverMarkets(matchState, validation, marginConfig);
    rawMarkets.push(...extOv);
  } catch (err) {
    if (debug) console.warn('[OddsEngineV3] Over markets error:', err);
  }

  // Group 5 — Delivery Markets
  try {
    const extDel = generateExtendedDeliveryMarkets(matchState, validation, marginConfig);
    rawMarkets.push(...extDel);
  } catch (err) {
    if (debug) console.warn('[OddsEngineV3] Delivery markets error:', err);
  }

  // Group 6 — Wicket Markets
  try {
    const extWkt = generateExtendedWicketMarkets(matchState, validation, marginConfig);
    rawMarkets.push(...extWkt);
  } catch (err) {
    if (debug) console.warn('[OddsEngineV3] Wicket markets error:', err);
  }

  // Group 7 — Player Markets
  try {
    const extPlayer = generateExtendedPlayerMarkets(matchState, validation, marginConfig);
    rawMarkets.push(...extPlayer);
  } catch (err) {
    if (debug) console.warn('[OddsEngineV3] Player markets error:', err);
  }

  // Group 8 — Head-To-Head Markets
  try {
    const extH2h = generateExtendedH2HMarkets(matchState, validation, marginConfig);
    rawMarkets.push(...extH2h);
  } catch (err) {
    if (debug) console.warn('[OddsEngineV3] H2H markets error:', err);
  }

  // Step 4: Validate and filter eligible markets
  const validMarkets = rawMarkets.filter((m) => {
    if (!m || !m.marketId) return false;
    if (shouldSkipCompactLiveMarket(m.marketId)) return false;
    if (!isMarketEligible(m.marketId, matchState)) return false;
    if (m.status === 'SETTLED') return true;
    if (m.status && m.status !== 'OPEN') return false;
    const effectiveOverround = m.overround || marginConfig.liveMatchWinnerOverround || 0.05;
    return validateMarket(m, effectiveOverround).valid;
  });

  // Apply Book Integrity & Volatility Spike Filters
  const integrityMarkets = applyBookIntegrity(validMarkets);
  const volatileProtectedMarkets = applyVolatilityProtection(integrityMarkets, matchState.matchId, {
    eventType: matchState.lastBallEvent || matchState.event,
    isLive: status === 'LIVE' || status === 'IN_PLAY',
  });

  // Evaluate Latency Circuit Breaker
  const breakerStatus = evaluateFeedCircuitBreaker(matchState.matchId, {
    timestamp: matchState.timestamp || matchState.lastUpdated,
    stateVersion: matchState.stateVersion,
  }, config.circuitBreaker);

  const finalMarkets = applyCircuitBreakerToMarkets(volatileProtectedMarkets, breakerStatus.isTripped, breakerStatus.reason);

  return createOddsSnapshot({
    matchId: matchState.matchId,
    stateVersion: matchState.stateVersion,
    status: breakerStatus.isTripped ? 'SUSPENDED' : 'OK',
    markets: finalMarkets,
  });
}
