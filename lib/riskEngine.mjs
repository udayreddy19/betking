/**
 * Enterprise Risk Engine — BetKing Sportsbook (lib/riskEngine.mjs)
 * Evaluates pre-bet placement risk, enforces liability & stake limits,
 * detects sharp bettors, arbitrage opportunities, duplicate bets, and fraud.
 * Feeds risk recommendations back to Odds Engine (lib/oddsEngine.mjs).
 */

import { calculateMatchExposureMetrics } from './exposureEngine.mjs';

// Default Risk Limits & Threshold Configurations
const DEFAULT_RISK_LIMITS = {
  maxStakeDefault: 50000.0,
  maxWinDefault: 200000.0,
  maxMatchLiability: 500000.0,
  vipMaxStakeMultiplier: 5.0,
  sharpBettorWinRateThreshold: 0.68, // > 68% win rate flags sharp bettor
  duplicateBetTimeWindowMs: 60000,   // 60 seconds
  arbingMarginThresholdPct: -0.5,   // Negative margin indicates arbitrage opportunity
};

// In-memory user risk profiles & recent bet history logs
const USER_RISK_PROFILES = new Map();
const RECENT_BETS_LOG = [];

/**
 * Register or update user risk tier profile (VIP, Sharp, Standard, Restricted)
 */
export function setUserRiskProfile(userId, profile = {}) {
  const existing = USER_RISK_PROFILES.get(userId) || {
    userId,
    tier: 'STANDARD', // 'VIP', 'SHARP', 'STANDARD', 'RESTRICTED'
    totalBets: 0,
    winningBets: 0,
    winRate: 0.0,
    flaggedArbitrageCount: 0,
    flaggedBonusAbuse: false,
  };

  const updated = { ...existing, ...profile };
  if (updated.totalBets > 10) {
    updated.winRate = updated.winningBets / updated.totalBets;
    if (updated.winRate >= DEFAULT_RISK_LIMITS.sharpBettorWinRateThreshold) {
      updated.tier = 'SHARP';
    }
  }

  USER_RISK_PROFILES.set(userId, updated);
  return updated;
}

/**
 * Validate a proposed bet against all risk rules before placement
 */
export function validateBetRisk(bet = {}) {
  const userId = bet.userId || 'guest';
  const matchId = bet.matchId || 'global';
  const marketId = bet.marketId || 'winner';
  const selectionId = bet.selectionId || 'home';
  const stake = Number(bet.stake) || 0;
  const odds = Number(bet.odds) || 1.0;
  const potentialWin = stake * (odds - 1.0);

  const userProfile = USER_RISK_PROFILES.get(userId) || setUserRiskProfile(userId);
  const flags = [];
  let isApproved = true;
  let maxAllowedStake = DEFAULT_RISK_LIMITS.maxStakeDefault;
  let riskMultiplier = 1.0;

  // 1. VIP / Restricted Tier Max Stake Adjustment
  if (userProfile.tier === 'VIP') {
    maxAllowedStake *= DEFAULT_RISK_LIMITS.vipMaxStakeMultiplier;
  } else if (userProfile.tier === 'RESTRICTED') {
    maxAllowedStake = 1000.0;
  } else if (userProfile.tier === 'SHARP') {
    maxAllowedStake = 5000.0;
    riskMultiplier = 1.15; // Shift odds faster against sharp bettors
    flags.push('SHARP_BETTOR_DETECTED');
  }

  // 2. Maximum Stake Check
  if (stake > maxAllowedStake) {
    isApproved = false;
    flags.push(`STAKE_EXCEEDS_MAX_LIMIT ($${maxAllowedStake.toFixed(2)})`);
  }

  // 3. Maximum Win Check
  if (potentialWin > DEFAULT_RISK_LIMITS.maxWinDefault) {
    isApproved = false;
    flags.push(`POTENTIAL_WIN_EXCEEDS_MAX_LIMIT ($${DEFAULT_RISK_LIMITS.maxWinDefault.toFixed(2)})`);
  }

  // 4. Match Exposure & Liability Limit Check
  const currentExposure = calculateMatchExposureMetrics(matchId);
  if ((currentExposure.worstCaseLoss + potentialWin) > DEFAULT_RISK_LIMITS.maxMatchLiability) {
    isApproved = false;
    flags.push(`MATCH_LIABILITY_EXCEEDED ($${DEFAULT_RISK_LIMITS.maxMatchLiability.toFixed(2)})`);
  }

  // 5. Duplicate Bet Detection
  const now = Date.now();
  const duplicateBet = RECENT_BETS_LOG.find(
    (b) => b.userId === userId
      && b.matchId === matchId
      && b.selectionId === selectionId
      && (now - b.timestamp) < DEFAULT_RISK_LIMITS.duplicateBetTimeWindowMs
  );

  if (duplicateBet) {
    flags.push('DUPLICATE_BET_DETECTED');
    if (stake > 10000) {
      isApproved = false;
    }
  }

  // 6. Arbitrage Detection (Implied margin < 0)
  if (bet.marketOverroundPct != null && bet.marketOverroundPct < DEFAULT_RISK_LIMITS.arbingMarginThresholdPct) {
    flags.push('ARBITRAGE_BETTING_DETECTED');
    userProfile.flaggedArbitrageCount += 1;
  }

  // Log bet in recent buffer
  RECENT_BETS_LOG.push({ userId, matchId, selectionId, stake, odds, timestamp: now });
  if (RECENT_BETS_LOG.length > 500) RECENT_BETS_LOG.shift();

  return {
    isApproved,
    userId,
    matchId,
    stake,
    odds,
    maxAllowedStake,
    riskMultiplier,
    flags,
    recommendationsToOddsEngine: {
      matchId,
      selectionId,
      riskMultiplier,
      shouldShortenOdds: flags.includes('SHARP_BETTOR_DETECTED') || flags.includes('DUPLICATE_BET_DETECTED'),
    },
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Get active risk assessment summary for a user
 */
export function getUserRiskSummary(userId) {
  const profile = USER_RISK_PROFILES.get(userId) || { userId, tier: 'STANDARD', winRate: 0.0 };
  return {
    userId,
    profile,
    recentBetsCount: RECENT_BETS_LOG.filter((b) => b.userId === userId).length,
    timestamp: Date.now(),
  };
}
