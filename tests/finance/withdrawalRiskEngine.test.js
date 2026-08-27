/**
 * Pure unit tests for withdrawal risk scoring helpers (no DB).
 */
import { describe, it, expect } from 'vitest';
import {
  levelFromScore,
  assertApprovalAllowedByRisk,
  WITHDRAWAL_RISK_LEVELS,
} from '../../lib/withdrawalRiskEngine.mjs';

describe('withdrawalRiskEngine — levelFromScore', () => {
  it('maps score bands to LOW / MEDIUM / HIGH / CRITICAL', () => {
    expect(levelFromScore(0)).toBe('LOW');
    expect(levelFromScore(29)).toBe('LOW');
    expect(levelFromScore(30)).toBe('MEDIUM');
    expect(levelFromScore(54)).toBe('MEDIUM');
    expect(levelFromScore(55)).toBe('HIGH');
    expect(levelFromScore(79)).toBe('HIGH');
    expect(levelFromScore(80)).toBe('CRITICAL');
    expect(levelFromScore(100)).toBe('CRITICAL');
  });

  it('exposes ordered risk levels', () => {
    expect(WITHDRAWAL_RISK_LEVELS).toEqual(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
  });
});

describe('withdrawalRiskEngine — assertApprovalAllowedByRisk', () => {
  it('allows LOW and MEDIUM without force', () => {
    expect(assertApprovalAllowedByRisk('LOW').allowed).toBe(true);
    expect(assertApprovalAllowedByRisk('MEDIUM').allowed).toBe(true);
    expect(assertApprovalAllowedByRisk(null).allowed).toBe(true);
  });

  it('blocks HIGH/CRITICAL on final stage unless forceApprove; maker/checker stages differ', () => {
    const high = assertApprovalAllowedByRisk('HIGH');
    expect(high.allowed).toBe(false);
    expect(high.code).toBe('RISK_REQUIRES_HOLD_OR_FORCE');

    const critical = assertApprovalAllowedByRisk('CRITICAL');
    expect(critical.allowed).toBe(false);
    expect(critical.code).toBe('RISK_BLOCK_AUTO_APPROVE');

    expect(assertApprovalAllowedByRisk('HIGH', { force: true }).allowed).toBe(true);
    expect(assertApprovalAllowedByRisk('CRITICAL', { force: true }).allowed).toBe(true);

    expect(assertApprovalAllowedByRisk('HIGH', { stage: 'maker' }).allowed).toBe(true);
    expect(assertApprovalAllowedByRisk('CRITICAL', { stage: 'maker' }).allowed).toBe(true);
    expect(assertApprovalAllowedByRisk('HIGH', { stage: 'checker' }).allowed).toBe(true);
    expect(assertApprovalAllowedByRisk('CRITICAL', { stage: 'checker' }).allowed).toBe(false);
    expect(assertApprovalAllowedByRisk('CRITICAL', { stage: 'checker', force: true }).allowed).toBe(true);
  });
});

describe('withdrawalRiskEngine — requiresWithdrawalDualControl', () => {
  it('requires dual control only for HIGH/CRITICAL', async () => {
    const { requiresWithdrawalDualControl } = await import('../../lib/withdrawalRiskEngine.mjs');
    expect(requiresWithdrawalDualControl('LOW')).toBe(false);
    expect(requiresWithdrawalDualControl('MEDIUM')).toBe(false);
    expect(requiresWithdrawalDualControl('HIGH')).toBe(true);
    expect(requiresWithdrawalDualControl('CRITICAL')).toBe(true);
  });
});
