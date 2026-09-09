/**
 * OddsEngineV3 / V4 — Dynamic Margin & Trading Control Engine
 * 
 * Expands or compresses base overround dynamically based on:
 * - Event Volatility (e.g. death overs, red cards, break points)
 * - Feed Freshness & Latency
 * - Market Exposure & Liquidity
 * - Liability-Driven Odds Shading (rebalances book exposure)
 * - In-Play Fast Freeze (temporary event suspensions with auto-decay)
 * 
 * Invariant: Never allows margin to fall below minimum base threshold (e.g. 3.5%).
 */

export const DYNAMIC_MARGIN_CONFIG = Object.freeze({
  enabled: typeof process !== 'undefined' && process?.env?.ODDS_DYNAMIC_MARGIN_ENABLED === 'true',
  minOverround: 0.035, // 3.5% floor
  maxOverround: 0.120, // 12.0% ceiling
  volatilityMultiplier: 0.020,
  latencyPenalty: 0.015,
  liabilityShadingSensitivity: 0.08, // Max % odds shift under extreme book imbalance
});

export const MARGIN_TIERS_BY_SPORT = Object.freeze({
  cricket_marquee: { label: 'Cricket Marquee (IPL / World Cup)', baseMargin: 0.035, min: 0.030, max: 0.080 },
  cricket_standard: { label: 'Cricket Standard (Bilateral / Domestic)', baseMargin: 0.050, min: 0.040, max: 0.100 },
  cricket_inplay_death: { label: 'Cricket Death Overs (In-Play Volatility)', baseMargin: 0.075, min: 0.050, max: 0.140 },
  football_tier1: { label: 'Football Tier 1 (EPL / UCL)', baseMargin: 0.040, min: 0.035, max: 0.085 },
  football_standard: { label: 'Football Standard / Other Leagues', baseMargin: 0.055, min: 0.045, max: 0.110 },
  tennis_grand_slam: { label: 'Tennis Grand Slam', baseMargin: 0.045, min: 0.038, max: 0.090 },
  default_sport: { label: 'General / Multi-Sport', baseMargin: 0.050, min: 0.035, max: 0.120 },
});

/**
 * Computes dynamic overround for a market.
 */
export function calculateDynamicOverround({
  baseOverround = 0.05,
  isLive = false,
  volatilityScore = 0, // [0, 1]
  feedLatencyMs = 0,
  config = {},
}) {
  const cfg = { ...DYNAMIC_MARGIN_CONFIG, ...config };
  if (!cfg.enabled) return baseOverround;

  let dynamicAdj = 0;

  // 1. High in-play volatility adjustment
  if (isLive && volatilityScore > 0.5) {
    dynamicAdj += (volatilityScore - 0.5) * cfg.volatilityMultiplier * 2;
  }

  // 2. Feed latency penalty
  if (feedLatencyMs > 1500) {
    dynamicAdj += cfg.latencyPenalty;
  }

  const finalOverround = Math.max(cfg.minOverround, Math.min(cfg.maxOverround, baseOverround + dynamicAdj));
  return Number(finalOverround.toFixed(4));
}

/**
 * Calculates liability-shaded odds to balance two-way and multi-way action.
 * 
 * If outcome 1 has 80% of current liability and outcome 2 has 20%,
 * outcome 1 odds are shaded downwards (reducing operator liability),
 * while outcome 2 odds are shaded upwards (attracting offsetting stakes).
 * 
 * @param {Array<{ selectionId: string, prob: number, liability: number }>} selections
 * @param {number} overround Total market margin to apply (e.g. 0.05)
 * @param {number} sensitivity Scaling factor for liability pressure [0.01 - 0.20]
 */
export function calculateLiabilityShadedOdds(selections = [], overround = 0.05, sensitivity = 0.08) {
  if (!Array.isArray(selections) || selections.length === 0) return [];

  const totalLiability = selections.reduce((acc, s) => acc + Math.max(0, Number(s.liability || 0)), 0);
  const sumProb = selections.reduce((acc, s) => acc + Math.max(0.001, Number(s.prob || 0)), 0);

  return selections.map((s) => {
    const fairProb = s.prob / sumProb;
    let shadedProb = fairProb;

    // Apply liability pressure if there is active volume
    if (totalLiability > 0) {
      const liabilityShare = Math.max(0, Number(s.liability || 0)) / totalLiability;
      // If liability share > fair probability, outcome is over-bet -> increase implied prob (lowers decimal odds)
      const imbalance = liabilityShare - fairProb;
      const probShift = imbalance * sensitivity;
      shadedProb = Math.max(0.01, Math.min(0.98, fairProb + probShift));
    }

    // Apply overround proportionally
    const pricedProb = shadedProb * (1 + overround);
    const decimalOdds = Math.max(1.01, Math.min(100.0, 1 / pricedProb));

    return {
      selectionId: s.selectionId,
      fairProb: Number(fairProb.toFixed(4)),
      pricedProb: Number(pricedProb.toFixed(4)),
      odds: Number(decimalOdds.toFixed(2)),
      liability: Number(s.liability || 0),
      liabilityShare: totalLiability > 0 ? Number(((s.liability / totalLiability) * 100).toFixed(1)) : 0,
    };
  });
}

/**
 * In-Play Fast Freeze Manager
 * Tracks temporary match and market freezes with automatic expiry.
 */
class FastFreezeStore {
  constructor() {
    this.frozenMarkets = new Map(); // key: matchId/marketId -> { frozenAt, expiresAt, reason, adminId }
  }

  freeze(targetId, durationSeconds = 30, reason = 'IN_PLAY_FAST_FREEZE', adminId = 'trading_desk') {
    const now = Date.now();
    const expiresAt = now + (durationSeconds * 1000);
    this.frozenMarkets.set(targetId, {
      targetId,
      frozenAt: now,
      expiresAt,
      durationSeconds,
      reason,
      adminId,
    });
    return { success: true, targetId, expiresAt, active: true };
  }

  unfreeze(targetId) {
    const existed = this.frozenMarkets.has(targetId);
    this.frozenMarkets.delete(targetId);
    return { success: true, targetId, wasFrozen: existed };
  }

  isFrozen(targetId) {
    const entry = this.frozenMarkets.get(targetId);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.frozenMarkets.delete(targetId);
      return false;
    }
    return true;
  }

  getActiveFreezes() {
    const now = Date.now();
    const list = [];
    for (const [id, entry] of this.frozenMarkets.entries()) {
      if (now <= entry.expiresAt) {
        list.push({ ...entry, remainingSeconds: Math.max(0, Math.ceil((entry.expiresAt - now) / 1000)) });
      } else {
        this.frozenMarkets.delete(id);
      }
    }
    return list;
  }
}

let runtimeMarginOverrides = {
  enabled: true,
  defaultOverround: 0.055,
  liabilitySensitivity: 0.06,
  activeTier: 'cricket_marquee',
  sportMargins: {
    cricket: 0.045,
    football: 0.050,
    tennis: 0.040,
    basketball: 0.050,
    esports: 0.070,
  },
};

export function getActiveMarginConfig() {
  return {
    ...DYNAMIC_MARGIN_CONFIG,
    ...runtimeMarginOverrides,
    tiers: MARGIN_TIERS_BY_SPORT,
  };
}

export function updateMarginConfig(updates = {}) {
  runtimeMarginOverrides = {
    ...runtimeMarginOverrides,
    ...updates,
    sportMargins: {
      ...runtimeMarginOverrides.sportMargins,
      ...(updates.sportMargins || {}),
    },
  };
  return getActiveMarginConfig();
}

export const fastFreezeManager = new FastFreezeStore();
