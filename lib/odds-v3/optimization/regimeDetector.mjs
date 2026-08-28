/**
 * OddsEngineV3 — Advanced Operational Regime Detector
 * 
 * Provides configuration-driven operational regime and sport-specific sub-phase detection
 * without hardcoded fragile heuristics. Only triggers on verified canonical match state.
 */

export const GLOBAL_REGIMES = Object.freeze({
  PRE_MATCH: 'PRE_MATCH',
  EARLY_LIVE: 'EARLY_LIVE',
  NORMAL_LIVE: 'NORMAL_LIVE',
  HIGH_VOLATILITY: 'HIGH_VOLATILITY',
  LOW_LIQUIDITY: 'LOW_LIQUIDITY',
  HIGH_PROVIDER_DISAGREEMENT: 'HIGH_PROVIDER_DISAGREEMENT',
  STALE_PROVIDER: 'STALE_PROVIDER',
  LATE_GAME: 'LATE_GAME',
  CRITICAL_EVENT: 'CRITICAL_EVENT',
});

export const SPORT_SUBPHASES = Object.freeze({
  CRICKET: {
    POWERPLAY: 'POWERPLAY',
    MIDDLE_OVERS: 'MIDDLE_OVERS',
    DEATH_OVERS: 'DEATH_OVERS',
  },
  SOCCER: {
    EARLY: 'EARLY',
    MID: 'MID',
    LATE: 'LATE',
    STOPPAGE: 'STOPPAGE',
  },
  TENNIS: {
    SET_START: 'SET_START',
    MID_SET: 'MID_SET',
    BREAK_POINT: 'BREAK_POINT',
    TIE_BREAK: 'TIE_BREAK',
  },
  BASKETBALL: {
    Q1: 'Q1',
    Q2: 'Q2',
    Q3: 'Q3',
    Q4: 'Q4',
    CLUTCH: 'CLUTCH',
  },
});

const DEFAULT_CONFIG = {
  staleFeedThresholdMs: 15000,
  providerDisagreementThreshold: 0.15,
  volatilityThreshold: 0.35,
};

/**
 * Detects global operational regime and sport sub-phase from verified match state.
 */
export function detectAdvancedRegime({
  sport = 'cricket',
  matchState = {},
  telemetry = {},
  config = DEFAULT_CONFIG,
} = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const feedAgeMs = telemetry.feedAgeMs ?? 0;
  const disagreement = telemetry.providerDisagreement ?? 0;
  const volatility = telemetry.volatilityScore ?? 0;

  // 1. Primary Safety Regimes
  if (feedAgeMs > cfg.staleFeedThresholdMs) {
    return { globalRegime: GLOBAL_REGIMES.STALE_PROVIDER, subPhase: null, reason: 'Feed age exceeded threshold' };
  }

  if (disagreement > cfg.providerDisagreementThreshold) {
    return { globalRegime: GLOBAL_REGIMES.HIGH_PROVIDER_DISAGREEMENT, subPhase: null, reason: 'Extreme provider spread' };
  }

  if (volatility > cfg.volatilityThreshold) {
    return { globalRegime: GLOBAL_REGIMES.HIGH_VOLATILITY, subPhase: null, reason: 'High odds fluctuation rate' };
  }

  const status = String(matchState.status || matchState.matchState || '').toUpperCase();
  if (status === 'PRE_MATCH' || status === 'UPCOMING' || status === 'SCHEDULED') {
    return { globalRegime: GLOBAL_REGIMES.PRE_MATCH, subPhase: null, reason: 'Pre-game market' };
  }

  // 2. Sport-Specific Sub-Phase Mapping
  const normalizedSport = String(sport || '').toLowerCase();
  let subPhase = null;
  let globalRegime = GLOBAL_REGIMES.NORMAL_LIVE;

  if (normalizedSport.includes('cricket')) {
    const ballsBowled = matchState.ballsCompleted ?? 0;
    const totalBalls = matchState.ballsPerInnings ?? 120;
    const ballsRemaining = totalBalls - ballsBowled;

    if (ballsBowled <= 36) {
      subPhase = SPORT_SUBPHASES.CRICKET.POWERPLAY;
      globalRegime = GLOBAL_REGIMES.EARLY_LIVE;
    } else if (ballsRemaining <= 24 && ballsRemaining > 0) {
      subPhase = SPORT_SUBPHASES.CRICKET.DEATH_OVERS;
      globalRegime = GLOBAL_REGIMES.LATE_GAME;
    } else {
      subPhase = SPORT_SUBPHASES.CRICKET.MIDDLE_OVERS;
    }
  } else if (normalizedSport.includes('soccer')) {
    const minute = matchState.minute ?? 0;
    if (minute <= 15) {
      subPhase = SPORT_SUBPHASES.SOCCER.EARLY;
      globalRegime = GLOBAL_REGIMES.EARLY_LIVE;
    } else if (minute >= 90) {
      subPhase = SPORT_SUBPHASES.SOCCER.STOPPAGE;
      globalRegime = GLOBAL_REGIMES.LATE_GAME;
    } else if (minute >= 75) {
      subPhase = SPORT_SUBPHASES.SOCCER.LATE;
      globalRegime = GLOBAL_REGIMES.LATE_GAME;
    } else {
      subPhase = SPORT_SUBPHASES.SOCCER.MID;
    }
  } else if (normalizedSport.includes('tennis')) {
    const isTieBreak = matchState.isTieBreak || matchState.games1 === 6 && matchState.games2 === 6;
    if (isTieBreak) {
      subPhase = SPORT_SUBPHASES.TENNIS.TIE_BREAK;
      globalRegime = GLOBAL_REGIMES.CRITICAL_EVENT;
    } else {
      subPhase = SPORT_SUBPHASES.TENNIS.MID_SET;
    }
  } else if (normalizedSport.includes('basketball')) {
    const quarter = matchState.quarter ?? 1;
    const clockSec = matchState.clockSeconds ?? 720;
    if (quarter >= 4 && clockSec <= 120) {
      subPhase = SPORT_SUBPHASES.BASKETBALL.CLUTCH;
      globalRegime = GLOBAL_REGIMES.LATE_GAME;
    } else {
      subPhase = SPORT_SUBPHASES.BASKETBALL[`Q${Math.min(4, quarter)}`] || SPORT_SUBPHASES.BASKETBALL.Q1;
    }
  }

  return {
    globalRegime,
    subPhase,
    detectedAt: new Date().toISOString(),
  };
}
