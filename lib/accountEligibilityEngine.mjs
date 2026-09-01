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

const BLOCKED_CONTROL_STATES = new Set([
  'SUSPENDED',
  'RESTRICTED_FROM_BETTING',
  'FROZEN',
  'SELF_EXCLUDED',
  'BLOCKED',
  'UNDER_REVIEW',
]);

function controlStillActive(restrictedUntil) {
  if (!restrictedUntil) return true;
  const until = new Date(restrictedUntil).getTime();
  if (!Number.isFinite(until)) return true;
  return until > Date.now();
}

export class AccountEligibilityEngine {
  /** Verify account status is ACTIVE and free of betting restrictions */
  async verifyEligibility(userId) {
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
      if (state && BLOCKED_CONTROL_STATES.has(state) && controlStillActive(row.restricted_until)) {
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
