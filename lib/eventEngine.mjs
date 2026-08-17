/**
 * Enterprise Live Event Engine — BetKing Sportsbook (lib/eventEngine.mjs)
 * Automatically processes live match events (Goal, Boundary, Six, Four, Wicket,
 * Penalty, Red Card, VAR, Timeout, Rain Delay).
 * Triggers automated market suspensions, odds recalculations, exposure shifts,
 * risk re-evaluations, cashout adjustments, market resumptions, and WebSocket broadcasts.
 */

import { generate as generateV3 } from './odds-v3/OddsEngineV3.mjs';
import { buildCanonicalFromMatch } from './odds-v3/buildCanonicalFromMatch.mjs';
import { calculateMatchExposureMetrics } from './exposureEngine.mjs';
import { generateDynamicMatchMarkets } from './marketEngine.mjs';

// In-memory match event state and active suspension store
const LIVE_MATCH_EVENTS = new Map();
const SUSPENDED_MATCH_MARKETS = new Map();

/**
 * Register a live match event (Goal, Wicket, Boundary, Red Card, VAR, Rain Delay)
 */
export function processLiveMatchEvent(eventData = {}) {
  const matchId = eventData.matchId;
  if (!matchId) throw new Error('processLiveMatchEvent requires matchId');

  const type = (eventData.type || 'SCORE_UPDATE').toUpperCase(); // 'GOAL', 'WICKET', 'SIX', 'FOUR', 'RED_CARD', 'VAR', 'RAIN_DELAY', 'TIMEOUT'
  const team = eventData.team || 'home';
  const timestamp = Date.now();

  let matchHistory = LIVE_MATCH_EVENTS.get(matchId) || [];
  const eventRecord = {
    eventId: `evt_${timestamp}_${Math.floor(Math.random() * 1000)}`,
    matchId,
    type,
    team,
    detail: eventData.detail || '',
    timestamp,
    processed: true,
  };

  matchHistory.push(eventRecord);
  if (matchHistory.length > 100) matchHistory.shift();
  LIVE_MATCH_EVENTS.set(matchId, matchHistory);

  // 1. AUTOMATIC MARKET SUSPENSION
  const shouldSuspend = ['GOAL', 'WICKET', 'PENALTY', 'RED_CARD', 'VAR', 'RAIN_DELAY'].includes(type);
  if (shouldSuspend) {
    SUSPENDED_MATCH_MARKETS.set(matchId, {
      suspended: true,
      reason: `Live Event Triggered: ${type}`,
      suspendedAt: timestamp,
    });
  }

  // 2. RECALCULATE DYNAMIC ODDS VIA ODDS ENGINE V3
  const matchState = eventData.currentMatch || { id: matchId, isLive: true };
  const canonical = buildCanonicalFromMatch(matchState);
  const recalculatedOdds = generateV3(canonical, {
    margins: {
      liveMatchWinnerOverround: type === 'WICKET' || type === 'GOAL' ? 0.08 : 0.05,
    },
  });

  // 3. UPDATE EXPOSURE METRICS
  const exposureMetrics = calculateMatchExposureMetrics(matchId);

  // 4. REGENERATE DYNAMIC MARKETS
  const dynamicMarkets = generateDynamicMatchMarkets(matchState);

  // 5. AUTOMATIC MARKET RESUMPTION (Auto-resume after 5 seconds for goals/wickets)
  if (shouldSuspend && type !== 'RAIN_DELAY' && type !== 'VAR') {
    setTimeout(() => {
      SUSPENDED_MATCH_MARKETS.set(matchId, {
        suspended: false,
        reason: 'Market Resumed Post Event',
        resumedAt: Date.now(),
      });
    }, 5000);
  }

  return {
    eventRecord,
    suspensionState: SUSPENDED_MATCH_MARKETS.get(matchId),
    recalculatedOdds,
    exposureMetrics,
    totalActiveMarkets: dynamicMarkets.totalMarketsCount,
    broadcastPayload: {
      eventType: 'LIVE_MATCH_EVENT',
      matchId,
      event: eventRecord,
      odds: recalculatedOdds.odds,
      isSuspended: SUSPENDED_MATCH_MARKETS.get(matchId)?.suspended || false,
      timestamp,
    },
  };
}

/**
 * Get active suspension status for a match
 */
export function getMatchSuspensionStatus(matchId) {
  return SUSPENDED_MATCH_MARKETS.get(matchId) || { suspended: false };
}

/**
 * Get event history for a match
 */
export function getMatchEventHistory(matchId) {
  return LIVE_MATCH_EVENTS.get(matchId) || [];
}
