import { describe, it, expect, beforeEach } from 'vitest';
import { accumulatorEngine } from '../../lib/accumulatorEngine.mjs';
import { marketSuspensionEngine } from '../../lib/marketSuspensionEngine.mjs';

describe('Phase 5 Accumulator (Multiple) Bet Validation Tests', () => {
  const match1 = 'm_acc_1';
  const market1 = 'mkt_acc_1';
  const sel1 = 'sel_acc_1';

  const match2 = 'm_acc_2';
  const market2 = 'mkt_acc_2';
  const sel2 = 'sel_acc_2';

  beforeEach(async () => {
    await marketSuspensionEngine.clearSuspensionCause(market1, 'MANUAL_ADMIN');
    await marketSuspensionEngine.clearSuspensionCause(market2, 'MANUAL_ADMIN');
  });

  it('should validate valid accumulator selections and compute combined odds', async () => {
    const selections = [
      { matchId: match1, marketId: market1, selectionId: sel1, name: 'India', odds: 1.50 },
      { matchId: match2, marketId: market2, selectionId: sel2, name: 'Arsenal', odds: 2.00 },
    ];

    const result = await accumulatorEngine.validateAccumulator(500.00, selections);
    expect(result.success).toBe(true);
    expect(result.betType).toBe('ACCUMULATOR');
    expect(result.selectionsCount).toBe(2);
    expect(result.combinedOdds).toBe(3.00);
    expect(result.potentialPayout).toBe(1500.00);
    expect(result.potentialProfit).toBe(1000.00);
  });

  it('CRITICAL: if ONE selection in an accumulator is suspended, the ENTIRE accumulator bet must be REJECTED', async () => {
    await marketSuspensionEngine.addSuspensionCause(market2, 'MANUAL_ADMIN', 'ADMIN', 'admin_1');

    const selections = [
      { matchId: match1, marketId: market1, selectionId: sel1, name: 'India', odds: 1.50 },
      { matchId: match2, marketId: market2, selectionId: sel2, name: 'Arsenal', odds: 2.00 },
    ];

    await expect(accumulatorEngine.validateAccumulator(500.00, selections)).rejects.toThrow('MARKET_SUSPENDED');
  });
});
