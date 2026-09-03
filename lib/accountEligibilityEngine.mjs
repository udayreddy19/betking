/**
 * Account Eligibility Engine
 * Fail-closed: DB errors, missing users, and non-ACTIVE statuses block money actions.
 */

import { query } from '../db/pg.js';

const BLOCKED_USER_STATUSES = new Set([
  'SUSPENDED',
  'CLOSED',
  'BANNED',
  'DISABLED',
  'DELETED',
  'INACTIVE',
]);

/** Blocks deposits, withdrawals, and betting */
const BLOCKED_CONTROL_STATES = new Set([
  'SUSPENDED',
  'RESTRICTED_FROM_BETTING',
  'FROZEN',
  'SELF_EXCLUDED',
  'BLOCKED',
  'UNDER_REVIEW',
]);

/** Blocks betting only — deposits/withdrawals still allowed */
const BETTING_HOLD_STATES = new Set([
  'BETTING_HOLD',
  'ON_HOLD',
]);

function controlStillActive(restrictedUntil) {
  if (!restrictedUntil) return true;
  const until = new Date(restrictedUntil).getTime();
  if (!Number.isFinite(until)) return true;
  return until > Date.now();
}

export class AccountEligibilityEngine {
  /**
   * Verify account may perform money actions.
   * @param {string} userId
   * @param {{ forBetting?: boolean }} [opts] When forBetting, also reject BETTING_HOLD.
   */
  async verifyEligibility(userId, opts = {}) {
    const forBetting = Boolean(opts.forBetting);
    if (!userId) {
      throw new Error('User ID is required for account eligibility verification');
    }

    let res;
    try {
      res = await query(
        `
        SELECT u.user_id, u.status AS user_status,
               c.account_state, c.reason, c.restricted_until
        FROM users u
        LEFT JOIN user_account_controls c ON c.user_id = u.user_id
        WHERE u.user_id = $1
        `,
        [userId],
      );
    } catch (err) {
      const wrapped = new Error(
        `ACCOUNT_ELIGIBILITY_UNAVAILABLE: ${err?.message || 'lookup failed'}`,
      );
      wrapped.cause = err;
      throw wrapped;
    }

    if (!res.rows.length) {
      throw new Error('ACCOUNT_NOT_FOUND: User account was not found');
    }

    const userStatus = String(res.rows[0].user_status || 'ACTIVE').toUpperCase();
    if (BLOCKED_USER_STATUSES.has(userStatus)) {
      throw new Error(`ACCOUNT_SUSPENDED: User account is ${userStatus}`);
    }

    for (const row of res.rows) {
      const state = row.account_state ? String(row.account_state).toUpperCase() : '';
      if (!state || !controlStillActive(row.restricted_until)) continue;

      if (forBetting && BETTING_HOLD_STATES.has(state)) {
        const err = new Error(
          `ACCOUNT_ON_HOLD: Betting is on hold${row.reason ? ` — ${row.reason}` : ''}. Contact support or wait for admin release.`,
        );
        err.code = 'ACCOUNT_ON_HOLD';
        err.status = 403;
        throw err;
      }

      if (BLOCKED_CONTROL_STATES.has(state)) {
        if (state === 'SUSPENDED') {
          throw new Error('ACCOUNT_SUSPENDED: User account is suspended');
        }
        if (state === 'UNDER_REVIEW') {
          throw new Error('ACCOUNT_UNDER_REVIEW: User account is under review');
        }
        throw new Error(`ACCOUNT_RESTRICTED: User account is ${state}`);
      }
    }

    return { eligible: true, userId, status: userStatus || 'ACTIVE' };
  }
}

export const accountEligibilityEngine = new AccountEligibilityEngine();
export { BETTING_HOLD_STATES, BLOCKED_CONTROL_STATES };
