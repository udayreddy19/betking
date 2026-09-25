/**
 * Hierarchical risk limits — child cannot loosen parent unless explicitly allowed.
 *
 * GLOBAL → SPORT → COMPETITION → EVENT → MARKET → USER
 */

export const RISK_REASON = Object.freeze({
  GLOBAL_EXPOSURE_LIMIT: 'GLOBAL_EXPOSURE_LIMIT',
  SPORT_EXPOSURE_LIMIT: 'SPORT_EXPOSURE_LIMIT',
  COMPETITION_EXPOSURE_LIMIT: 'COMPETITION_EXPOSURE_LIMIT',
  EVENT_EXPOSURE_LIMIT: 'EVENT_EXPOSURE_LIMIT',
  MARKET_EXPOSURE_LIMIT: 'MARKET_EXPOSURE_LIMIT',
  USER_LIMIT: 'USER_LIMIT',
  VELOCITY_LIMIT: 'VELOCITY_LIMIT',
  PAYOUT_LIMIT: 'PAYOUT_LIMIT',
  STAKE_BELOW_MIN: 'STAKE_BELOW_MIN',
});

/** Default house limits — env can tighten. */
export function getDefaultRiskHierarchy() {
  return {
    GLOBAL: {
      maxStake: Number(process.env.RISK_GLOBAL_MAX_STAKE) || 100_000,
      minStake: Number(process.env.RISK_GLOBAL_MIN_STAKE) || 10,
      maxPayout: Number(process.env.RISK_GLOBAL_MAX_PAYOUT) || 1_000_000,
      maxLiability: Number(process.env.RISK_GLOBAL_MAX_LIABILITY) || 5_000_000,
    },
    SPORT: {
      cricket: { maxStake: Number(process.env.RISK_CRICKET_MAX_STAKE) || 50_000 },
      soccer: { maxStake: Number(process.env.RISK_SOCCER_MAX_STAKE) || 40_000 },
      basketball: { maxStake: Number(process.env.RISK_BASKETBALL_MAX_STAKE) || 40_000 },
      tennis: { maxStake: Number(process.env.RISK_TENNIS_MAX_STAKE) || 30_000 },
    },
    COMPETITION: {},
    EVENT: {},
    MARKET: {
      match_winner: { maxStake: Number(process.env.RISK_MW_MAX_STAKE) || 25_000 },
    },
    USER: {
      defaultMaxStake: Number(process.env.RISK_USER_MAX_STAKE) || 25_000,
    },
  };
}

function minDefined(...vals) {
  const nums = vals.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (!nums.length) return null;
  return Math.min(...nums);
}

function maxDefined(...vals) {
  const nums = vals.map(Number).filter((n) => Number.isFinite(n) && n >= 0);
  if (!nums.length) return null;
  return Math.max(...nums);
}

/**
 * Resolve effective limits — always the tightest (min) of ancestor max* caps.
 */
export function resolveEffectiveRiskLimits({
  sport = null,
  competition = null,
  matchId = null,
  marketId = null,
  userId = null,
  userMaxStake = null,
  hierarchy = getDefaultRiskHierarchy(),
  eventMaxStake = null,
  eventMaxLiability = null,
} = {}) {
  const g = hierarchy.GLOBAL || {};
  const sportKey = String(sport || '').toLowerCase();
  const s = hierarchy.SPORT?.[sportKey] || {};
  const c = competition ? (hierarchy.COMPETITION?.[competition] || {}) : {};
  const e = matchId ? (hierarchy.EVENT?.[matchId] || {}) : {};
  const mKey = String(marketId || '').toLowerCase();
  const m = hierarchy.MARKET?.[mKey] || hierarchy.MARKET?.[marketId] || {};
  const u = hierarchy.USER || {};

  const maxStake = minDefined(
    g.maxStake,
    s.maxStake,
    c.maxStake,
    e.maxStake,
    eventMaxStake,
    m.maxStake,
    u.defaultMaxStake,
    userMaxStake,
  );

  const minStake = maxDefined(g.minStake, s.minStake, c.minStake, e.minStake, m.minStake) || 10;

  const maxPayout = minDefined(g.maxPayout, s.maxPayout, c.maxPayout, e.maxPayout, m.maxPayout);

  const maxLiability = minDefined(
    g.maxLiability,
    s.maxLiability,
    c.maxLiability,
    e.maxLiability,
    eventMaxLiability,
    m.maxLiability,
  );

  return {
    maxStake,
    minStake,
    maxPayout,
    maxLiability,
    layers: {
      GLOBAL: g,
      SPORT: s,
      COMPETITION: c,
      EVENT: { ...e, maxStake: eventMaxStake, maxLiability: eventMaxLiability },
      MARKET: m,
      USER: { maxStake: userMaxStake ?? u.defaultMaxStake },
    },
  };
}

/**
 * Assert stake/payout against hierarchy. Throws RISK_REJECTED with reasonCode.
 */
export function assertHierarchicalRiskLimits({
  stake,
  odds,
  sport,
  competition,
  matchId,
  marketId,
  userId,
  userMaxStake,
  eventMaxLiability,
  hierarchy,
} = {}) {
  const limits = resolveEffectiveRiskLimits({
    sport,
    competition,
    matchId,
    marketId,
    userId,
    userMaxStake,
    eventMaxLiability,
    hierarchy,
  });
  const s = Number(stake) || 0;
  const o = Number(odds) || 1;
  const payout = s * o;

  if (limits.minStake != null && s < limits.minStake) {
    throw Object.assign(new Error(`RISK_REJECTED: Stake below minimum ₹${limits.minStake}`), {
      code: 'STAKE_BELOW_MIN',
      reasonCode: RISK_REASON.STAKE_BELOW_MIN,
      limits,
    });
  }
  if (limits.maxStake != null && s > limits.maxStake) {
    throw Object.assign(new Error(`RISK_REJECTED: Stake exceeds limit ₹${limits.maxStake}`), {
      code: 'USER_LIMIT',
      reasonCode: RISK_REASON.USER_LIMIT,
      limits,
      userFacing: 'Stake exceeds the maximum allowed for this market.',
    });
  }
  if (limits.maxPayout != null && payout > limits.maxPayout) {
    throw Object.assign(new Error(`RISK_REJECTED: Potential payout exceeds limit ₹${limits.maxPayout}`), {
      code: 'PAYOUT_LIMIT',
      reasonCode: RISK_REASON.PAYOUT_LIMIT,
      limits,
      userFacing: 'Potential payout exceeds the maximum allowed.',
    });
  }

  return { ok: true, limits, potentialPayout: payout };
}
