/**
 * Book-wide bet placement velocity breaker.
 * Complements SRL-only circuit breakers with global / match / user windows.
 */

import { createLogger } from '../logger.mjs';

const log = createLogger({ engine: 'betVelocityBreaker' });

const windows = {
  global: [],
  byMatch: new Map(),
  byUser: new Map(),
};

export const VELOCITY_DEFAULTS = Object.freeze({
  windowMs: Number(process.env.BET_VELOCITY_WINDOW_MS) || 60_000,
  globalMaxStake: Number(process.env.BET_VELOCITY_GLOBAL_MAX) || 500_000,
  matchMaxStake: Number(process.env.BET_VELOCITY_MATCH_MAX) || 150_000,
  userMaxStake: Number(process.env.BET_VELOCITY_USER_MAX) || 50_000,
  userMaxBets: Number(process.env.BET_VELOCITY_USER_MAX_BETS) || 20,
});

function prune(list, cutoff) {
  while (list.length && list[0].at < cutoff) list.shift();
  return list;
}

function push(map, key, entry) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(entry);
}

/**
 * Assert velocity limits before accepting a bet.
 * @throws {Error} RISK_REJECTED with code BET_VELOCITY_*
 */
export function assertBetVelocity({
  userId,
  matchId,
  stake,
  now = Date.now(),
  config = VELOCITY_DEFAULTS,
} = {}) {
  const windowMs = Math.max(5_000, Number(config.windowMs) || VELOCITY_DEFAULTS.windowMs);
  const cutoff = now - windowMs;
  const amount = Number(stake) || 0;

  prune(windows.global, cutoff);
  const matchKey = String(matchId || '_none');
  const userKey = String(userId || '_anon');
  prune(windows.byMatch.get(matchKey) || [], cutoff);
  prune(windows.byUser.get(userKey) || [], cutoff);

  const globalStake = windows.global.reduce((s, e) => s + e.stake, 0);
  if (globalStake + amount > (Number(config.globalMaxStake) || VELOCITY_DEFAULTS.globalMaxStake)) {
    const err = new Error('RISK_REJECTED: Global bet velocity limit exceeded');
    err.code = 'BET_VELOCITY_GLOBAL';
    log.warn('velocity_trip', { code: err.code, globalStake, amount, windowMs });
    throw err;
  }

  const matchList = windows.byMatch.get(matchKey) || [];
  const matchStake = matchList.reduce((s, e) => s + e.stake, 0);
  if (matchStake + amount > (Number(config.matchMaxStake) || VELOCITY_DEFAULTS.matchMaxStake)) {
    const err = new Error('RISK_REJECTED: Match bet velocity limit exceeded');
    err.code = 'BET_VELOCITY_MATCH';
    log.warn('velocity_trip', { code: err.code, matchId: matchKey, matchStake, amount });
    throw err;
  }

  const userList = windows.byUser.get(userKey) || [];
  const userStake = userList.reduce((s, e) => s + e.stake, 0);
  if (userStake + amount > (Number(config.userMaxStake) || VELOCITY_DEFAULTS.userMaxStake)) {
    const err = new Error('RISK_REJECTED: User bet velocity stake limit exceeded');
    err.code = 'BET_VELOCITY_USER_STAKE';
    throw err;
  }
  if (userList.length + 1 > (Number(config.userMaxBets) || VELOCITY_DEFAULTS.userMaxBets)) {
    const err = new Error('RISK_REJECTED: User bet velocity count limit exceeded');
    err.code = 'BET_VELOCITY_USER_COUNT';
    throw err;
  }

  return { ok: true, windowMs };
}

/** Call only after bet is successfully accepted. */
export function recordAcceptedBetVelocity({ userId, matchId, stake, now = Date.now() } = {}) {
  const entry = { at: now, stake: Number(stake) || 0, userId, matchId };
  windows.global.push(entry);
  push(windows.byMatch, String(matchId || '_none'), entry);
  push(windows.byUser, String(userId || '_anon'), entry);
}

export function getBetVelocitySnapshot(config = VELOCITY_DEFAULTS) {
  const now = Date.now();
  const cutoff = now - (Number(config.windowMs) || VELOCITY_DEFAULTS.windowMs);
  prune(windows.global, cutoff);
  return {
    windowMs: config.windowMs || VELOCITY_DEFAULTS.windowMs,
    globalStake: windows.global.reduce((s, e) => s + e.stake, 0),
    globalBets: windows.global.length,
    limits: { ...VELOCITY_DEFAULTS, ...config },
    checkedAt: new Date().toISOString(),
  };
}

/** Test helper */
export function _resetBetVelocityBreakerForTests() {
  windows.global.length = 0;
  windows.byMatch.clear();
  windows.byUser.clear();
}
