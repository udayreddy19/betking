import { describe, it, expect, vi } from 'vitest';

vi.mock('../../db/pg.js', () => ({
  query: vi.fn(async (sql) => {
    if (String(sql).includes('product_configuration')) {
      return {
        rows: [{
          betting_enabled: false,
          software_platform_enabled: true,
          wallet_enabled: true,
          pg_review_mode: false,
        }],
      };
    }
    if (String(sql).includes('reconciliation_cases')) return { rows: [{ c: 0 }] };
    if (String(sql).includes('settlement_jobs')) return { rows: [{ c: 0 }] };
    if (String(sql).includes('ops_alert_webhooks')) return { rows: [{ c: 1 }] };
    return { rows: [] };
  }),
}));

vi.mock('../../lib/knownTestFundingExclusions.mjs', () => ({
  inspectKnownTestFundingAccounts: async () => ({ pendingCount: 0 }),
}));

describe('architecture production ten', () => {
  it('scores intentional SP mode without SPORTSBOOK_OFF deduction', async () => {
    process.env.ADMIN_MFA_REQUIRED = '1';
    process.env.OPS_ALERT_WEBHOOK_URL = 'https://example.test/hooks/ops';
    const { getProductionScorecard } = await import('../../lib/productionScorecard.mjs');
    const card = await getProductionScorecard();
    expect(card.productPosture).toBe('SP_MODE');
    expect(card.intentionalSpMode).toBe(true);
    expect(card.deductions.some((d) => d.code === 'SPORTSBOOK_OFF')).toBe(false);
    expect(card.score).toBe(100);
  });

  it('reports architecture systems with calibration wiring separate from sample N', async () => {
    process.env.ADMIN_MFA_REQUIRED = '1';
    process.env.OPS_ALERT_WEBHOOK_URL = 'https://example.test/hooks/ops';
    const { getArchitectureProductionTenStatus } = await import('../../lib/architectureProductionTen.mjs');
    const status = await getArchitectureProductionTenStatus();
    expect(status.systems.length).toBeGreaterThanOrEqual(19);
    expect(status.systems.every((s) => s.target === 10)).toBe(true);
    const cal = status.systems.find((s) => s.name === 'ModelCalibration');
    expect(cal.score).toBe(10);
    expect(status.calibrationSample.separateFromEngineMark).toBe(true);
  });
});
