/**
 * Authoritative placement-time odds validation.
 * Separates ODDS_CHANGED (user must accept) from STALE_ODDS (excessive drift).
 */

import { MIN_DECIMAL_ODDS } from './odds-v3/pricing/MarginCalculator.mjs';
import {
  detectOddsChange,
  formatOddsForClient,
  isStaleOddsDrift,
  oddsPricesEqual,
} from './oddsComparison.mjs';
import { logOddsChangeRejection } from './oddsChangeAudit.mjs';

const DEFAULT_MAX_QUOTE_AGE_MS = Number(process.env.MAX_ODDS_QUOTE_AGE_MS ?? 120_000);

export function assertServerOddsBettable(serverOdds) {
  const server = Number(serverOdds);
  if (!Number.isFinite(server) || server < MIN_DECIMAL_ODDS) {
    const err = new Error(`ODDS_LOCKED: selection is not bettable at ${serverOdds}`);
    err.code = 'ODDS_LOCKED';
    throw err;
  }
  return server;
}

export function assertClientOddsPresent(clientOdds) {
  const client = Number(clientOdds);
  if (!Number.isFinite(client) || client < MIN_DECIMAL_ODDS) {
    const err = new Error(`ODDS_EXPIRED: client odds ${clientOdds} are not bettable`);
    err.code = 'ODDS_EXPIRED';
    throw err;
  }
  return client;
}

export function assertQuoteNotExpired(quoteMeta = {}) {
  const generatedAt = quoteMeta.generatedAt || quoteMeta.timestamp;
  if (!generatedAt) return;
  const ageMs = Date.now() - new Date(generatedAt).getTime();
  if (Number.isFinite(ageMs) && ageMs > DEFAULT_MAX_QUOTE_AGE_MS) {
    const err = new Error('ODDS_EXPIRED: Quote is older than the permitted lifetime');
    err.code = 'ODDS_EXPIRED';
    throw err;
  }
  if (quoteMeta.expiresAt) {
    const expires = new Date(quoteMeta.expiresAt).getTime();
    if (Number.isFinite(expires) && Date.now() > expires) {
      const err = new Error('ODDS_EXPIRED: Quote has expired');
      err.code = 'ODDS_EXPIRED';
      throw err;
    }
  }
}

/**
 * Validate client odds against server quote for placement.
 * @throws Error with code ODDS_CHANGED | STALE_ODDS and .data payload
 */
export function validatePlacementOdds({
  serverOdds,
  clientOdds,
  matchId,
  marketId,
  selectionId,
  selectionName = null,
  oddsVersion = null,
  quoteTimestamp = null,
  userId = null,
  correlationId = null,
  betType = 'SINGLE',
}) {
  const server = assertServerOddsBettable(serverOdds);
  assertClientOddsPresent(clientOdds);

  if (isStaleOddsDrift(server, clientOdds)) {
    const err = new Error(
      `STALE_ODDS: Requested odds ${clientOdds} differ from server ${server} beyond permitted drift`,
    );
    err.code = 'STALE_ODDS';
    err.httpStatus = 409;
    err.data = buildOddsErrorData({
      matchId,
      marketId,
      selectionId,
      selectionName,
      oldOdds: clientOdds,
      newOdds: server,
      oddsVersion,
      quoteTimestamp,
      requiresAcceptance: true,
    });
    logOddsChangeRejection({
      userId,
      matchId,
      marketId,
      selectionId,
      previousOdds: clientOdds,
      currentOdds: server,
      oddsVersion,
      betType,
      code: 'STALE_ODDS',
      correlationId,
    });
    throw err;
  }

  if (!oddsPricesEqual(server, clientOdds)) {
    const change = detectOddsChange(server, clientOdds);
    const err = new Error('ODDS_CHANGED: The odds have changed.');
    err.code = 'ODDS_CHANGED';
    err.httpStatus = 409;
    err.data = buildOddsErrorData({
      matchId,
      marketId,
      selectionId,
      selectionName,
      oldOdds: change.oldOdds,
      newOdds: change.newOdds,
      oddsVersion,
      quoteTimestamp,
      requiresAcceptance: true,
    });
    err.oddsUpdates = [err.data];
    logOddsChangeRejection({
      userId,
      matchId,
      marketId,
      selectionId,
      previousOdds: change.oldOdds,
      currentOdds: change.newOdds,
      oddsVersion,
      betType,
      code: 'ODDS_CHANGED',
      correlationId,
    });
    throw err;
  }

  return server;
}

export function buildOddsErrorData({
  matchId,
  marketId,
  selectionId,
  selectionName = null,
  oldOdds,
  newOdds,
  oddsVersion = null,
  quoteTimestamp = null,
  requiresAcceptance = true,
}) {
  return {
    matchId,
    marketId,
    selectionId,
    selectionName,
    oldOdds: formatOddsForClient(oldOdds),
    newOdds: formatOddsForClient(newOdds),
    oddsChanged: true,
    oddsVersion: oddsVersion != null ? String(oddsVersion) : null,
    quoteTimestamp: quoteTimestamp || new Date().toISOString(),
    requiresAcceptance,
  };
}

export function mergeOddsChangedErrors(updates = []) {
  if (!updates.length) return null;
  const err = new Error('ODDS_CHANGED: The odds have changed.');
  err.code = 'ODDS_CHANGED';
  err.httpStatus = 409;
  err.data = updates.length === 1 ? updates[0] : { selections: updates, requiresAcceptance: true };
  err.oddsUpdates = updates;
  return err;
}
