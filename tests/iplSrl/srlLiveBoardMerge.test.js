import { describe, it, expect } from 'vitest';
import {
  overlaySrlFromServer,
  isSrlDeskDriven,
  srlInningsRuns,
} from '../../src/utils/srlLiveBoardMerge.js';

const client = {
  id: 'srl_ipl_1',
  source: 'srl',
  liveDetails: {
    phase: 'first',
    inningsId: 1,
    firstRuns: 79,
    firstWickets: 2,
    firstOvers: '12.3',
    runs: 79,
    wickets: 2,
    overs: '12.3',
  },
};

describe('srlLiveBoardMerge', () => {
  it('detects desk-driven boards and prefers server score over client natural sim', () => {
    const serverDesk = {
      id: 'srl_ipl_1',
      source: 'srl',
      operator: { started: true, scoreAnchors: [{ innings: 1, runs: 88 }] },
      liveDetails: {
        phase: 'first',
        inningsId: 1,
        firstRuns: 88,
        firstWickets: 1,
        firstOvers: '13.5',
        runs: 88,
        wickets: 1,
        overs: '13.5',
        currentOverBalls: ['.', '6', '.', '.', '1'],
      },
    };

    expect(isSrlDeskDriven(serverDesk)).toBe(true);
    expect(srlInningsRuns(serverDesk.liveDetails)).toBe(88);

    const merged = overlaySrlFromServer(client, serverDesk);
    expect(merged.liveDetails.firstRuns).toBe(88);
    expect(merged.liveDetails.firstWickets).toBe(1);
    expect(merged.liveDetails.firstOvers).toBe('13.5');
  });

  it('keeps client board when natural boards are in sync', () => {
    const serverNatural = {
      ...client,
      operator: { started: false, scoreAnchors: [] },
      liveDetails: { ...client.liveDetails },
    };
    const merged = overlaySrlFromServer(client, serverNatural);
    expect(merged.liveDetails.firstRuns).toBe(79);
  });

  it('prefers server when boards diverge even without desk flags', () => {
    const serverAhead = {
      id: 'srl_ipl_1',
      operator: {},
      liveDetails: {
        ...client.liveDetails,
        firstRuns: 88,
        firstOvers: '13.5',
        runs: 88,
        overs: '13.5',
      },
    };
    const merged = overlaySrlFromServer(client, serverAhead);
    expect(merged.liveDetails.firstRuns).toBe(88);
  });
});
