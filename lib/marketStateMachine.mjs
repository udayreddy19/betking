/**
 * Deterministic Market State Machine
 * Enforces valid market state transitions and rejects arbitrary or invalid state mutations.
 */

export const MARKET_STATES = {
  PRE_OPEN: 'PRE_OPEN',
  OPEN: 'OPEN',
  SUSPENDED: 'SUSPENDED',
  DETERMINED: 'DETERMINED',
  CLOSED: 'CLOSED',
  SETTLED: 'SETTLED',
  CANCELLED: 'CANCELLED',
};

const ALLOWED_TRANSITIONS = {
  [MARKET_STATES.PRE_OPEN]: [MARKET_STATES.OPEN, MARKET_STATES.CANCELLED],
  [MARKET_STATES.OPEN]: [MARKET_STATES.SUSPENDED, MARKET_STATES.DETERMINED, MARKET_STATES.CLOSED, MARKET_STATES.CANCELLED],
  [MARKET_STATES.SUSPENDED]: [MARKET_STATES.OPEN, MARKET_STATES.DETERMINED, MARKET_STATES.CLOSED, MARKET_STATES.CANCELLED],
  [MARKET_STATES.DETERMINED]: [MARKET_STATES.CLOSED, MARKET_STATES.SETTLED, MARKET_STATES.CANCELLED],
  [MARKET_STATES.CLOSED]: [MARKET_STATES.SETTLED, MARKET_STATES.CANCELLED],
  [MARKET_STATES.SETTLED]: [], // Terminal state
  [MARKET_STATES.CANCELLED]: [], // Terminal state
};

export class MarketStateMachine {
  /** Validate whether state transition from currentStatus to newStatus is valid */
  isValidTransition(currentStatus, newStatus) {
    if (!currentStatus || !newStatus) return false;
    if (currentStatus === newStatus) return true; // Idempotent no-op

    const allowed = ALLOWED_TRANSITIONS[currentStatus];
    if (!allowed) return false;

    return allowed.includes(newStatus);
  }

  /** Assert valid state transition or throw explicit error */
  assertValidTransition(currentStatus, newStatus) {
    if (!this.isValidTransition(currentStatus, newStatus)) {
      throw new Error(`Invalid market state transition: ${currentStatus} -> ${newStatus}. Transition rejected.`);
    }
  }
}

export const marketStateMachine = new MarketStateMachine();
