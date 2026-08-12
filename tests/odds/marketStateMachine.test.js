import { describe, it, expect } from 'vitest';
import { marketStateMachine, MARKET_STATES } from '../../lib/marketStateMachine.mjs';

describe('Phase 4 Market State Machine Tests', () => {
  it('should allow valid market state transitions', () => {
    expect(marketStateMachine.isValidTransition(MARKET_STATES.PRE_OPEN, MARKET_STATES.OPEN)).toBe(true);
    expect(marketStateMachine.isValidTransition(MARKET_STATES.OPEN, MARKET_STATES.SUSPENDED)).toBe(true);
    expect(marketStateMachine.isValidTransition(MARKET_STATES.SUSPENDED, MARKET_STATES.OPEN)).toBe(true);
    expect(marketStateMachine.isValidTransition(MARKET_STATES.OPEN, MARKET_STATES.CLOSED)).toBe(true);
    expect(marketStateMachine.isValidTransition(MARKET_STATES.CLOSED, MARKET_STATES.SETTLED)).toBe(true);
  });

  it('CRITICAL: should reject invalid market state transitions', () => {
    // Cannot skip CLOSED state to go directly from OPEN to SETTLED
    expect(marketStateMachine.isValidTransition(MARKET_STATES.OPEN, MARKET_STATES.SETTLED)).toBe(false);

    // Cannot reopen SETTLED terminal state
    expect(marketStateMachine.isValidTransition(MARKET_STATES.SETTLED, MARKET_STATES.OPEN)).toBe(false);
    expect(marketStateMachine.isValidTransition(MARKET_STATES.SETTLED, MARKET_STATES.SUSPENDED)).toBe(false);

    // Cannot reopen CANCELLED terminal state
    expect(marketStateMachine.isValidTransition(MARKET_STATES.CANCELLED, MARKET_STATES.OPEN)).toBe(false);
  });

  it('should throw an explicit error on assertValidTransition for invalid transition', () => {
    expect(() => {
      marketStateMachine.assertValidTransition(MARKET_STATES.SETTLED, MARKET_STATES.OPEN);
    }).toThrow('Invalid market state transition');
  });
});
