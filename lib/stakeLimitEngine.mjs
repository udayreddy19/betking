/**
 * Stake & Limits Validator Engine
 * Enforces minimum/maximum stake limits, decimal precision, and numeric sanity checks.
 */

export class StakeLimitEngine {
  constructor(options = {}) {
    this.minStake = options.minStake || 10.00; // Min ₹10.00
    this.maxStake = options.maxStake ?? Infinity;
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

    // Check decimal precision (max 2 places)
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

    if (Number.isFinite(this.maxStake) && numeric > this.maxStake) {
      throw new Error(`STAKE_LIMIT_EXCEEDED: Maximum stake allowed is ₹${this.maxStake.toFixed(2)}`);
    }

    return parseFloat(numeric.toFixed(2));
  }
}

export const stakeLimitEngine = new StakeLimitEngine();
