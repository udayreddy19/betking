import { describe, it, expect } from 'vitest';
import { createSelectionPrice } from '../../lib/odds-shared/models/SelectionPrice.mjs';
import { getEngineProductionTenStatus } from '../../lib/odds-v5/engineProductionTen.mjs';
import { hasUsableLiveModelInputs } from '../../lib/other-sports-v5/liveModelInputs.mjs';

describe('engine production ten', () => {
  it('stamps fairProbability on SelectionPrice', () => {
    const sel = createSelectionPrice({
      selectionId: '1',
      name: 'Home',
      probability: 0.42,
      fairOdds: 1 / 0.42,
      margin: 0.05,
      finalProbability: 0.441,
      odds: 2.27,
    });
    expect(sel.fairProbability).toBe(0.42);
    expect(sel.probability).toBe(0.42);
  });

  it('detects usable live model inputs', () => {
    expect(hasUsableLiveModelInputs({
      isLive: true,
      matchState: 'IN',
      liveDetails: { score1: 0, score2: 0, minute: 12 },
    }, 'soccer')).toBe(true);
    expect(hasUsableLiveModelInputs({
      isLive: false,
      matchState: 'PRE',
      liveDetails: { score1: 0, score2: 0 },
    }, 'soccer')).toBe(false);
  });

  it('reports production-ten status with separated calibration', () => {
    const status = getEngineProductionTenStatus();
    expect(status.oddsEngineV5.target).toBe(10);
    expect(status.otherSportsEngineV5.target).toBe(10);
    expect(status.calibration.separateFromEngineMark).toBe(true);
    expect(status.oddsEngineV5.gates.fairProbabilityOnSelections).toBe(true);
    expect(status.otherSportsEngineV5.gates.liveScoreModelWithoutProvider).toBe(true);
  });
});
