/**
 * OddsEngineV4 — cricket book with V3 catalog + resource MW + house protect (v4.9).
 *
 * Pipeline:
 *   CanonicalMatchState → validator → V3 generators + V4 extras/features
 *   → eligibility/settlement → integrity → chase caps → late-chase/event freeze
 *   → house tighten → volatility → circuit breaker
 */

import { createLogger } from '../logger.mjs';
const log = createLogger({ engine: 'OddsEngineV4' });

import { validateMatchState } from '../odds-v3/validation/MatchStateValidator.mjs';
import { validateMarket } from '../odds-v3/validation/MarketValidator.mjs';
import { createOddsSnapshot } from '../odds-v3/models/OddsSnapshot.mjs';
import { generateMatchWinnerMarketV4 } from './markets/MatchWinnerMarketV4.mjs';
import { generateTossFamilyMarketsV4 } from './markets/TossWinnerMarketV4.mjs';
import { generateTeamTotalMarket } from '../odds-v3/markets/TeamTotalMarket.mjs';
import { generateMatchTotalMarket } from '../odds-v3/markets/MatchTotalMarket.mjs';
import { generateExtendedMatchMarkets } from '../odds-v3/markets/matchWinner.mjs';
import { generateExtendedMatchTotals } from '../odds-v3/markets/matchTotals.mjs';
import { generateExtendedInningsTotals } from '../odds-v3/markets/inningsTotal.mjs';
import { generateExtendedOverMarkets } from '../odds-v3/markets/overTotal.mjs';
import { generateExtendedDeliveryMarkets } from '../odds-v3/markets/deliveryTotal.mjs';
import { generateExtendedWicketMarkets } from '../odds-v3/markets/wicketMarkets.mjs';
import { generateExtendedPlayerMarkets } from '../odds-v3/markets/playerRuns.mjs';
import { generateExtendedH2HMarkets } from '../odds-v3/markets/headToHead.mjs';
import { isMarketEligible } from '../odds-v3/eligibility/marketEligibility.mjs';
import { applyBookIntegrity } from '../odds-v3/bookIntegrity.mjs';
import { generateOtherSportsSnapshot, isCricketSport } from '../odds-v3/otherSportsOdds.mjs';
import { evaluateFeedCircuitBreaker, applyCircuitBreakerToMarkets } from '../odds-v3/circuitBreaker.mjs';
import { applyVolatilityProtection } from '../odds-v3/volatilityFilter.mjs';
import { auditSnapshotQuality } from '../odds-v3/monitoring/oddsQualityMonitor.mjs';
import { validateMarketSettlementCompatibility } from '../settlement/marketSettlementContract.mjs';
import { shouldSkipV4LiveMarket } from './marketCatalog.mjs';
import { generateV4ExtraMarkets } from './markets/v4ExtraMarkets.mjs';
import { generateV4FeatureMarkets } from './markets/v4FeatureMarkets.mjs';
import { V4_MARGIN_CONFIG, tightenV4Markets } from './v4HouseProtect.mjs';
import { applyV4ChaseTotalSanity } from './chaseTotalCaps.mjs';
import { applyLateChaseProtect } from './lateChaseProtect.mjs';
import { applyEventFreeze } from './eventFreeze.mjs';
import { computeMomentum } from './models/MomentumEngine.mjs';
import {
  guardV4Book,
  scoreV4Book,
  applyStabilityFallback,
} from './v4BookGuardian.mjs';

const V4_DEFAULT_MARGINS = V4_MARGIN_CONFIG;
export const V4_ENGINE_VERSION = '4.9.0';

function dedupeMarketsById(markets = []) {
  const seen = new Set();
  const out = [];
  for (const m of markets) {
    if (!m?.marketId || seen.has(m.marketId)) continue;
    seen.add(m.marketId);
    out.push(m);
  }
  return out;
}

function toV4Snapshot(snap, meta = null) {
  return Object.freeze({
    ...snap,
    engine: 'OddsEngineV4',
    engineVersion: V4_ENGINE_VERSION,
    ...(meta ? { v4Meta: meta } : {}),
  });
}

export function generate(matchState, config = {}) {
  const momentum = (matchState?.status === 'LIVE' || matchState?.isLive)
    ? computeMomentum(matchState)
    : null;
  const marginConfig = {
    ...V4_DEFAULT_MARGINS,
    ...(config.margins || {}),
    liveMatchWinnerOverround:
      (config.margins?.liveMatchWinnerOverround ?? V4_DEFAULT_MARGINS.liveMatchWinnerOverround)
      + (momentum?.marginBump || 0),
    liveTeamTotalOverround:
      (config.margins?.liveTeamTotalOverround ?? V4_DEFAULT_MARGINS.liveTeamTotalOverround)
      + (momentum?.marginBump || 0),
    v4Momentum: momentum,
  };
  const debug = config.debug || false;
  const v4MetaBase = {
    features: [
      'momentum',
      'provider_blend',
      'chase_caps',
      'late_chase',
      'event_freeze',
      'feature_markets',
      'book_guardian',
      'stability_fallback',
      'favorite_cap',
      'min_book_mass',
      'core_only_lock',
      'soft_leak_suspend',
      'house_v486',
      'house_v487',
      'house_v49',
      'chase_side_integrity',
      'odd_even_parity_fix',
      'post_vol_reteighten',
      'finite_fairp_over_cap',
    ],
    ...(momentum
      ? {
        phase: momentum.phase,
        momentumFactor: momentum.factor,
        marginBump: momentum.marginBump,
      }
      : {}),
  };

  if (!isCricketSport(matchState?.sport)) {
    const other = generateOtherSportsSnapshot(matchState, {
      ...config,
      margins: marginConfig,
    });
    const protectedMarkets = tightenV4Markets(other?.markets || [], marginConfig);
    const hasOpen = protectedMarkets.some((m) => m?.status === 'OPEN');
    return toV4Snapshot({
      ...other,
      markets: protectedMarkets,
      status: hasOpen ? (other?.status || 'OK') : (other?.status || 'NO_OPEN_MARKETS'),
    }, {
      ...v4MetaBase,
      features: [...(v4MetaBase.features || []), 'other_sports_house_wrap'],
    });
  }

  const status = String(matchState?.status || '').toUpperCase();
  if (status === 'COMPLETED' || status === 'FINISHED' || status === 'POST') {
    try {
      const completedValidation = validateMatchState(matchState);
      if (completedValidation.valid && completedValidation.determined) {
        const winnerMarket = generateMatchWinnerMarketV4(matchState, completedValidation, marginConfig);
        return toV4Snapshot(createOddsSnapshot({
          matchId: matchState.matchId || matchState?.id || 'unknown',
          stateVersion: matchState.stateVersion || 0,
          status: 'DETERMINED',
          markets: [winnerMarket],
        }), v4MetaBase);
      }
    } catch (err) {
      log.warn('completed-match pricing failed, falling through', { matchId: matchState?.matchId, err });
    }
    return toV4Snapshot(createOddsSnapshot({
      matchId: matchState?.matchId || matchState?.id || 'unknown',
      stateVersion: matchState?.stateVersion || 0,
      status: 'DETERMINED',
      markets: [],
    }), v4MetaBase);
  }

  const validation = validateMatchState(matchState);

  if (!validation.valid) {
    return toV4Snapshot(createOddsSnapshot({
      matchId: matchState?.matchId || 'unknown',
      stateVersion: matchState?.stateVersion || 0,
      status: 'INVALID_STATE',
      markets: [],
    }), v4MetaBase);
  }

  if (validation.determined) {
    const winnerMarket = generateMatchWinnerMarketV4(matchState, validation, marginConfig);
    return toV4Snapshot(createOddsSnapshot({
      matchId: matchState.matchId,
      stateVersion: matchState.stateVersion,
      status: 'DETERMINED',
      markets: [winnerMarket],
    }), v4MetaBase);
  }

  if (config.winnerOnly) {
    const winner = generateMatchWinnerMarketV4(matchState, validation, marginConfig);
    let protectedMarkets = tightenV4Markets(
      applyLateChaseProtect(
        applyBookIntegrity(winner?.marketId ? [winner] : [], matchState),
        matchState,
        marginConfig,
        momentum,
      ),
      marginConfig,
    );
    try {
      const breakerStatus = evaluateFeedCircuitBreaker(matchState.matchId, {
        timestamp: matchState.timestamp || matchState.lastUpdated,
        stateVersion: matchState.stateVersion,
      }, config.circuitBreaker);
      protectedMarkets = applyCircuitBreakerToMarkets(
        protectedMarkets,
        breakerStatus.isTripped,
        breakerStatus.reason,
      );
    } catch (err) { log.warn('winnerOnly circuit breaker failed', { matchId: matchState.matchId, err }); }
    try {
      const guarded = guardV4Book(protectedMarkets, matchState, marginConfig);
      protectedMarkets = applyStabilityFallback(guarded.markets, scoreV4Book({
        markets: guarded.markets,
        state: matchState,
        momentum,
        issues: guarded.issues,
        engineVersion: V4_ENGINE_VERSION,
      }));
    } catch (err) { log.warn('winnerOnly book guarding failed', { matchId: matchState.matchId, err }); }
    try {
      protectedMarkets = applyEventFreeze(protectedMarkets, matchState);
    } catch (err) { log.warn('winnerOnly event freeze failed', { matchId: matchState.matchId, err }); }
    return toV4Snapshot(createOddsSnapshot({
      matchId: matchState.matchId,
      stateVersion: matchState.stateVersion,
      status: protectedMarkets[0]?.status === 'OPEN' ? 'OK' : (protectedMarkets[0]?.status || 'OK'),
      markets: protectedMarkets,
    }), { ...v4MetaBase, features: [...(v4MetaBase.features || []), 'winner_only_guard'] });
  }

  const rawMarkets = [];

  try {
    const winner = generateMatchWinnerMarketV4(matchState, validation, marginConfig);
    if (winner.status === 'OPEN') rawMarkets.push(winner);
    rawMarkets.push(...generateTossFamilyMarketsV4(matchState, validation, marginConfig));
    const extMatch = generateExtendedMatchMarkets(matchState, validation, marginConfig);
    rawMarkets.push(...extMatch);
  } catch (err) {
    log.warn('match markets generation failed', { matchId: matchState?.matchId, err });
  }

  try {
    const mt = generateMatchTotalMarket(matchState, validation, marginConfig);
    if (mt.status === 'OPEN') rawMarkets.push(mt);
    const extMt = generateExtendedMatchTotals(matchState, validation, marginConfig);
    rawMarkets.push(...extMt);
  } catch (err) {
    log.warn('match totals generation failed', { matchId: matchState?.matchId, err });
  }

  try {
    const tt = generateTeamTotalMarket(matchState, validation, marginConfig);
    if (tt.status === 'OPEN') rawMarkets.push(tt);
    const extTt = generateExtendedInningsTotals(matchState, validation, marginConfig);
    rawMarkets.push(...extTt);
  } catch (err) {
    log.warn('innings totals generation failed', { matchId: matchState?.matchId, err });
  }

  try {
    rawMarkets.push(...generateExtendedOverMarkets(matchState, validation, marginConfig));
  } catch (err) {
    log.warn('over markets generation failed', { matchId: matchState?.matchId, err });
  }

  try {
    rawMarkets.push(...generateExtendedDeliveryMarkets(matchState, validation, marginConfig));
  } catch (err) {
    log.warn('delivery markets generation failed', { matchId: matchState?.matchId, err });
  }

  try {
    rawMarkets.push(...generateExtendedWicketMarkets(matchState, validation, marginConfig));
  } catch (err) {
    log.warn('wicket markets generation failed', { matchId: matchState?.matchId, err });
  }

  try {
    rawMarkets.push(...generateExtendedPlayerMarkets(matchState, validation, marginConfig));
  } catch (err) {
    log.warn('player markets generation failed', { matchId: matchState?.matchId, err });
  }

  try {
    rawMarkets.push(...generateExtendedH2HMarkets(matchState, validation, marginConfig));
  } catch (err) {
    log.warn('h2h markets generation failed', { matchId: matchState?.matchId, err });
  }

  // V4 extras — additional delivery lines + ladders
  try {
    rawMarkets.push(...generateV4ExtraMarkets(matchState, validation, marginConfig));
  } catch (err) {
    log.warn('extra markets generation failed', { matchId: matchState?.matchId, err });
  }

  // V4 feature markets — dismissal+1, forward milestones, OE, death wickets
  try {
    const existingIds = new Set(rawMarkets.map((m) => m?.marketId).filter(Boolean));
    rawMarkets.push(...generateV4FeatureMarkets(matchState, marginConfig, momentum, existingIds));
  } catch (err) {
    log.warn('feature markets generation failed', { matchId: matchState?.matchId, err });
  }

  const validMarkets = dedupeMarketsById(rawMarkets).filter((m) => {
    if (!m || !m.marketId) return false;
    if (shouldSkipV4LiveMarket(m.marketId)) return false;
    if (!isMarketEligible(m.marketId, matchState)) return false;
    const compat = validateMarketSettlementCompatibility(m);
    if (!compat.compatible) {
      log.info('suppressed orphan market', { matchId: matchState?.matchId, marketId: m.marketId, reason: compat.reason });
      return false;
    }
    if (m.status === 'SETTLED') return true;
    if (m.status && m.status !== 'OPEN') return false;
    const totalsBook =
      /^(?:i\d+_)?(?:team_total|match_total|overs_0_|next_over_)/i.test(m.marketId || '')
      || /(?:TEAM_TOTAL|MATCH_TOTAL|OVERS_0_|NEXT_OVER_TOTAL)/i.test(m.marketType || '');
    const totalsOverround = (marginConfig.liveTeamTotalOverround ?? 0.16)
      + (marginConfig.liveTotalsOverExtraOverround ?? 0.06);
    const effectiveOverround = Number.isFinite(m.overround)
      ? m.overround
      : (totalsBook ? totalsOverround : (marginConfig.liveMatchWinnerOverround || 0.12));
    return validateMarket(m, effectiveOverround).valid;
  });

  const integrityMarkets = applyBookIntegrity(validMarkets, matchState);
  const chaseSaneMarkets = applyV4ChaseTotalSanity(integrityMarkets, matchState, marginConfig);
  const lateProtectMarkets = applyLateChaseProtect(chaseSaneMarkets, matchState, marginConfig, momentum);
  const frozenMarkets = applyEventFreeze(lateProtectMarkets, matchState);
  const houseTightMarkets = tightenV4Markets(frozenMarkets, marginConfig);
  const guarded = guardV4Book(houseTightMarkets, matchState, marginConfig);
  const quality = scoreV4Book({
    markets: guarded.markets,
    state: matchState,
    momentum,
    issues: guarded.issues,
    engineVersion: V4_ENGINE_VERSION,
  });
  const stableMarkets = applyStabilityFallback(guarded.markets, quality);
  // Volatility can re-open soft prices from history — re-tighten then re-guard.
  const volatileProtectedMarkets = applyVolatilityProtection(stableMarkets, matchState.matchId, {
    eventType: matchState.lastBallEvent || matchState.event,
    isLive: status === 'LIVE' || status === 'IN_PLAY',
  });
  const postVolTight = tightenV4Markets(volatileProtectedMarkets, marginConfig);
  const postVolGuarded = guardV4Book(postVolTight, matchState, marginConfig);
  const finalStable = applyStabilityFallback(postVolGuarded.markets, {
    ...quality,
    issueCount: (quality.issueCount || 0) + postVolGuarded.issues.length,
  });

  const breakerStatus = evaluateFeedCircuitBreaker(matchState.matchId, {
    timestamp: matchState.timestamp || matchState.lastUpdated,
    stateVersion: matchState.stateVersion,
  }, config.circuitBreaker);

  const finalMarkets = applyCircuitBreakerToMarkets(
    finalStable,
    breakerStatus.isTripped,
    breakerStatus.reason,
  );

  const snapshot = toV4Snapshot(createOddsSnapshot({
    matchId: matchState.matchId,
    stateVersion: matchState.stateVersion,
    status: breakerStatus.isTripped
      ? 'SUSPENDED'
      : (finalMarkets.some((m) => m?.status === 'OPEN') ? 'OK' : 'SUSPENDED'),
    markets: finalMarkets,
    suspensionReason: breakerStatus.isTripped
      ? breakerStatus.reason
      : (finalMarkets.some((m) => m?.status === 'OPEN') ? null : 'NO_OPEN_MARKETS'),
  }), {
    ...v4MetaBase,
    openMarkets: finalMarkets.filter((m) => m?.status === 'OPEN').length,
    qualityScore: quality.qualityScore,
    // Derived from measured book quality — never a vanity constant.
    operatorMark: Number((Number(quality.qualityScore || 0) / 10).toFixed(1)),
    qualityBreakdown: quality.breakdown,
    guardianIssues: [...guarded.issues, ...postVolGuarded.issues].slice(0, 12),
    enginePipelineTrace: [
      'validate', 'generate', 'eligibility', 'settlement_compat',
      'integrity', 'chase_caps', 'late_chase_protect', 'event_freeze',
      'house_tighten', 'guardian_pass1', 'quality_score', 'stability_fallback',
      'volatility_protect', 'house_retighten', 'guardian_pass2',
      'stability_refallback', 'circuit_breaker',
    ],
  });

  const qualityAudit = auditSnapshotQuality(snapshot);
  if (!qualityAudit.healthy) {
    log.warn('quality anomalies detected', { matchId: matchState?.matchId, anomalies: qualityAudit.anomalies });
  }

  return snapshot;
}
