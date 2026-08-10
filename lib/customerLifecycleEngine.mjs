/**
 * Customer Account Lifecycle Engine
 * Manages customer account state transitions, access controls, and security restrictions.
 */

export const LIFECYCLE_STATES = [
  'REGISTERED',
  'EMAIL_PENDING',
  'KYC_PENDING',
  'KYC_VERIFIED',
  'ACTIVE',
  'RESTRICTED',
  'SUSPENDED',
  'SELF_EXCLUDED',
  'COOLING_OFF',
  'CLOSED',
];

class CustomerLifecycleEngine {
  constructor() {
    this.userLifecycleState = new Map(); // userId -> State
  }

  setLifecycleState(userId, nextState, reason = 'System Update') {
    if (!LIFECYCLE_STATES.includes(nextState)) {
      throw new Error(`Invalid lifecycle state: ${nextState}`);
    }

    const previous = this.userLifecycleState.get(userId) || 'REGISTERED';
    const record = {
      userId,
      previousState: previous,
      currentState: nextState,
      reason,
      updatedAt: new Date().toISOString(),
    };

    this.userLifecycleState.set(userId, nextState);
    return record;
  }

  getLifecycleState(userId) {
    return this.userLifecycleState.get(userId) || 'REGISTERED';
  }

  isBettableState(userId) {
    const state = this.getLifecycleState(userId);
    return state === 'ACTIVE' || state === 'KYC_VERIFIED';
  }
}

export const customerLifecycleEngine = new CustomerLifecycleEngine();
