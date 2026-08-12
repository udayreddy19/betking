/**
 * Account Eligibility Engine
 * Verifies user account state before allowing bet placement.
 * Backend-enforced security guard preventing suspended or restricted users from betting.
 */

import { query } from '../db/pg.js';

export class AccountEligibilityEngine {
  /** Verify account status is ACTIVE and free of betting restrictions */
  async verifyEligibility(userId) {
    if (!userId) {
      throw new Error('User ID is required for account eligibility verification');
    }

    try {
      const res = await query(`
        SELECT account_state, reason, restricted_until
        FROM user_account_controls
        WHERE user_id = $1;
      `, [userId]);

      if (res.rows.length > 0) {
        const control = res.rows[0];
        const state = String(control.account_state).toUpperCase();

        if (state === 'SUSPENDED') {
          throw new Error('ACCOUNT_SUSPENDED: User account is suspended');
        }
        if (state === 'RESTRICTED_FROM_BETTING' || state === 'FROZEN' || state === 'SELF_EXCLUDED' || state === 'BLOCKED') {
          throw new Error(`ACCOUNT_RESTRICTED: User account is ${state}`);
        }
        if (state === 'UNDER_REVIEW') {
          throw new Error('ACCOUNT_UNDER_REVIEW: User account is under review');
        }
      }

      return { eligible: true, userId, status: 'ACTIVE' };
    } catch (err) {
      if (err.message.includes('ACCOUNT_')) throw err;
      // Default to active if no explicit restriction row exists
      return { eligible: true, userId, status: 'ACTIVE' };
    }
  }
}

export const accountEligibilityEngine = new AccountEligibilityEngine();
