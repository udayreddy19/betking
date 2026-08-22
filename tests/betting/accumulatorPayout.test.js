import { describe, it, expect } from 'vitest';
import { computeAccumulatorPayout } from '../../src/utils/accumulatorPayout.js';

describe('accumulator payout math', () => {
  it('multiplies leg odds then rounds payout to 2dp', () => {
    const { combinedOdds, potentialPayout } = computeAccumulatorPayout(1000, [1.5, 2.0, 3.0]);
    expect(combinedOdds).toBe(9);
    expect(potentialPayout).toBe(9000);
  });

  it('does not round combined odds before multiplying stake', () => {
    const legs = [12.5, 8.4, 7.2, 6.1, 5.5, 4.8, 3.9, 3.2, 2.1];
    const { combinedOdds, potentialPayout } = computeAccumulatorPayout(1000, legs);
    const raw = legs.reduce((a, o) => a * o, 1);
    expect(combinedOdds).toBe(Math.round(raw * 100) / 100);
    expect(potentialPayout).toBe(Math.round(1000 * raw * 100) / 100);
  });
});
