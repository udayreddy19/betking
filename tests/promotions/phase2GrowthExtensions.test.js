/**
 * Phase 2 Growth extensions: exclude segments, multi-condition presets, dashboard, ROI honesty.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeRules,
  userMatchesRules,
  BUILTIN_RULE_PRESETS,
} from '../../lib/crmEngine.mjs';

describe('Phase 2 CRM segment presets', () => {
  it('HIGH_DEPOSIT_INACTIVE matches AND rules', () => {
    const rules = BUILTIN_RULE_PRESETS.HIGH_DEPOSIT_INACTIVE;
    expect(userMatchesRules({
      total_deposits: 15000,
      days_since_login: 10,
      kyc_status: 'VERIFIED',
    }, rules)).toBe(true);
    expect(userMatchesRules({
      total_deposits: 15000,
      days_since_login: 1,
      kyc_status: 'VERIFIED',
    }, rules)).toBe(false);
  });

  it('DEPOSITED_NEVER_BET / NEVER_DEPOSITED', () => {
    expect(userMatchesRules({ total_deposits: 500, total_bets: 0 }, BUILTIN_RULE_PRESETS.DEPOSITED_NEVER_BET)).toBe(true);
    expect(userMatchesRules({ total_deposits: 0 }, BUILTIN_RULE_PRESETS.NEVER_DEPOSITED)).toBe(true);
  });

  it('normalizes multi-condition match any', () => {
    const rules = normalizeRules({
      match: 'any',
      conditions: [
        { field: 'total_deposits', operator: '>=', value: 100000 },
        { field: 'vip_tier', operator: 'in', value: ['DIAMOND'] },
      ],
    });
    expect(rules.match).toBe('any');
    expect(userMatchesRules({ total_deposits: 0, vip_tier: 'DIAMOND' }, rules)).toBe(true);
  });
});

const hasDb = Boolean(process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING);

describe.runIf(hasDb)('Phase 2 Growth integration (DB)', () => {
  let query;

  beforeEach(async () => {
    ({ query } = await import('../../db/pg.js'));
    await query(`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS audience_exclude_segment_ids JSONB NOT NULL DEFAULT '[]'::jsonb`).catch(() => null);
  });

  it('preview audience excludes high-risk segment members', async () => {
    const {
      createCustomerSegment,
      refreshCustomerSegmentMemberships,
      deleteCustomerSegment,
    } = await import('../../lib/crmEngine.mjs');
    const { previewTargetedDepositFreebetAudience } = await import('../../lib/depositFreebetEngine.mjs');

    const includeName = `P2_INC_${Date.now()}`;
    const excludeName = `P2_EX_${Date.now()}`;
    const userA = `usr_p2_a_${Date.now()}`;
    const userB = `usr_p2_b_${Date.now()}`;

    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1,$2,'h'),($3,$4,'h') ON CONFLICT DO NOTHING`, [
      userA, `${userA}@t.com`, userB, `${userB}@t.com`,
    ]);

    const inc = await createCustomerSegment({
      name: includeName,
      rules: { match: 'any', conditions: [{ field: 'total_deposits', operator: '>=', value: 0 }] },
      autoEvaluate: true,
    });
    const ex = await createCustomerSegment({
      name: excludeName,
      // Threshold no one meets on refresh — membership for B is manual only
      rules: { match: 'all', conditions: [{ field: 'total_deposits', operator: '>=', value: 999999999 }] },
      autoEvaluate: true,
    });

    await query(
      `INSERT INTO user_segment_memberships (user_id, segment_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [userB, ex.segmentId],
    );

    const preview = await previewTargetedDepositFreebetAudience({
      userIds: [userA, userB],
      excludeSegmentIds: [ex.segmentId],
      limit: 10,
    });
    expect(preview.count).toBe(1);
    expect(preview.sample.some((s) => s.userId === userA)).toBe(true);
    expect(preview.sample.some((s) => s.userId === userB)).toBe(false);
    expect(preview.excludedApplied).toBe(true);

    await deleteCustomerSegment(inc.segmentId).catch(() => null);
    await deleteCustomerSegment(ex.segmentId).catch(() => null);
  });

  it('growth dashboard returns real KPI keys without fabricating GGR', async () => {
    const { getGrowthDashboard } = await import('../../lib/growthDashboard.mjs');
    const dash = await getGrowthDashboard();
    expect(dash.success).toBe(true);
    expect(dash.kpis).toBeTruthy();
    expect(typeof dash.kpis.activeCampaigns).toBe('number');
    expect(typeof dash.kpis.freebetIssued).toBe('number');
    expect(dash.notes.some((n) => /GGR|NGR|N\/A/i.test(n))).toBe(true);
  });

  it('promo ROI marks GGR/NGR as null (N/A)', async () => {
    const { getPromoRoiAnalytics } = await import('../../lib/promoRoiAnalytics.mjs');
    const roi = await getPromoRoiAnalytics({ limit: 5 });
    expect(roi.success).toBe(true);
    for (const row of roi.rows || []) {
      expect(row.grossGamingRevenue).toBeNull();
      expect(row.netRevenue).toBeNull();
    }
  });

  it('updateCustomerSegment patches rules', async () => {
    const {
      createCustomerSegment,
      updateCustomerSegment,
      getCustomerSegment,
      deleteCustomerSegment,
    } = await import('../../lib/crmEngine.mjs');
    const name = `P2_UPD_${Date.now()}`;
    const created = await createCustomerSegment({
      name,
      rules: { match: 'all', conditions: [{ field: 'total_bets', operator: '>=', value: 1 }] },
    });
    const updated = await updateCustomerSegment(created.segmentId, {
      description: 'updated',
      rules: { match: 'any', conditions: [{ field: 'total_deposits', operator: '>=', value: 1 }] },
    });
    expect(updated.segment.description).toBe('updated');
    const got = await getCustomerSegment(created.segmentId);
    const rules = typeof got.rules === 'string' ? JSON.parse(got.rules) : got.rules;
    expect(rules.match).toBe('any');
    await deleteCustomerSegment(created.segmentId);
  });
});

describe.runIf(!hasDb)('Phase 2 Growth (skipped)', () => {
  it('skips without DATABASE_URL', () => {
    expect(hasDb).toBe(false);
  });
});
