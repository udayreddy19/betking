/**
 * Map internal bet/odds errors to safe, brand-neutral user messages.
 * Never leak match ids, selection ids, or feed provider names.
 */

import { scrubProviderBranding } from './matchIdPublic.mjs';

const CODE_MESSAGES = {
  ODDS_UNAVAILABLE: 'Odds are temporarily unavailable for this market. Please refresh and try again.',
  ODDS_CHANGED: 'Odds have been updated. Tap Place again to continue.',
  ODDS_LOCKED: 'This selection is not currently available.',
  MARKET_ALREADY_DETERMINED: 'This market is closed.',
  MARKET_SUSPENDED: 'This market is temporarily suspended.',
  INVALID_BET: 'Invalid bet details. Please refresh and try again.',
  CASHOUT_NOT_AVAILABLE: 'Cash out is not available for this bet right now.',
  STALE_PRICE: 'Cash out price changed. Please accept the updated value.',
  BET_NOT_FOUND: 'Bet not found.',
  INSUFFICIENT_BALANCE: 'Insufficient balance.',
};

export function userFacingBetError(errOrMessage) {
  const raw = typeof errOrMessage === 'string'
    ? errOrMessage
    : (errOrMessage?.message || errOrMessage?.error || 'Something went wrong');
  const code = String(raw).split(':')[0].trim().toUpperCase();
  if (CODE_MESSAGES[code]) return CODE_MESSAGES[code];

  // Strip technical payloads / match ids / provider names
  let msg = scrubProviderBranding(raw)
    .replace(/Match\s+'[^']+'/gi, 'this match')
    .replace(/Selection\s+'[^']+'/gi, 'this selection')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '')
    .replace(/\boy_[a-z0-9-]+/gi, '')
    .replace(/^[A-Z_]+:\s*/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!msg || msg.length < 3 || /not in the live book/i.test(raw)) {
    return CODE_MESSAGES.ODDS_UNAVAILABLE;
  }
  return msg.length > 160 ? `${msg.slice(0, 157)}…` : msg;
}
