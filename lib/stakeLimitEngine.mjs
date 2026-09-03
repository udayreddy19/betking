/**
 * Stake & Limits Validator Engine
 * Enforces minimum/maximum stake limits, decimal precision, and numeric sanity checks.
 */

import { getAdminConfigSummary } from './adminConfig.mjs';
import { HOUSE_LIMITS } from './houseProtectionEngine.mjs';

export class StakeLimitEngine {
  constructor(options = {}) {
    this.minStake = options.minStake || 10.00;
    this.maxStake = options.maxStake ?? null;
  }

  resolveMaxStake() {
    if (Number.isFinite(this.maxStake)) return this.maxStake;
    try {
      const cfg = getAdminConfigSummary();
      const fromCfg = Number(cfg?.globalMaxStake);
      if (Number.isFinite(fromCfg) && fromCfg > 0) return fromCfg;
    } catch {
      // fall through
    }
    return HOUSE_LIMITS.globalMaxStake;
  }

  /** Validate stake amount */
  validateStake(stake) {
    if (stake === undefined || stake === null || stake === '') {
      throw new Error('INVALID_STAKE: Stake amount is required');
    }

    const numeric = typeof stake === 'number' ? stake : parseFloat(stake);

    if (isNaN(numeric) || !isFinite(numeric)) {
      throw new Error('INVALID_STAKE: Stake must be a valid number');
    }

    if (numeric <= 0) {
      throw new Error(`INVALID_STAKE: Stake must be strictly greater than 0. Received: ${numeric}`);
    }

    const str = String(numeric);
    if (str.includes('.')) {
      const decimals = str.split('.')[1];
      if (decimals.length > 2) {
        throw new Error('INVALID_STAKE: Stake cannot exceed 2 decimal places');
      }
    }

    if (numeric < this.minStake) {
      throw new Error(`STAKE_LIMIT_EXCEEDED: Minimum stake required is ₹${this.minStake.toFixed(2)}`);
    }

    const maxStake = this.resolveMaxStake();
    if (Number.isFinite(maxStake) && numeric > maxStake) {
      throw new Error(`STAKE_LIMIT_EXCEEDED: Maximum stake allowed is ₹${maxStake.toFixed(2)}`);
    }

    return parseFloat(numeric.toFixed(2));
  }
}

export const stakeLimitEngine = new StakeLimitEngine();
