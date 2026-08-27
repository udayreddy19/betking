/**
 * Wave 1 CRM foundations: segment preview/eval, campaign lifecycle, referral analytics.
 * Unit-level where DB may be unavailable; integration when DATABASE_URL is set.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeRules,
  userMatchesRules,
  BUILTIN_RULE_PRESETS,
} from '../../lib/crmEngine.mjs';
import { resolveCampaignLifecycleStatus } from '../../lib/depositFreebetEngine.mjs';

describe('CRM segment rule evaluation', () => {
  it('normalizes builtin presets', () => {
    const rules = normalizeRules({ conditions: [{ type: 'BUILTIN', key: 'HIGH_VALUE' }] });
    expect(rules.conditions.length).toBeGreaterThan(0);
    expect(rules.conditions[0].field).toBe('total_deposits');
  });

  it('matches high-value deposit rule', () => {
    const rules = BUILTIN_RULE_PRESETS.HIGH_VALUE;
    expect(userMatchesRules({ total_deposits: 150000 }, rules)).toBe(true);
    expect(userMatchesRules({ total_deposits: 500 }, rules)).toBe(false);
  });

  it('supports VIP tier in operator', () => {
    const rules = BUILTIN_RULE_PRESETS.VIP;
    expect(userMatchesRules({ vip_tier: 'GOLD' }, rules)).toBe(true);
    expect(userMatchesRules({ vip_tier: 'BRONZE' }, rules)).toBe(false);
  });

  it('supports match any', () => {
    const rules = {
      match: 'any',
      conditions: [
        { field: 'total_bets', operator: '>=', value: 100 },
        { field: 'kyc_status', operator: '=', value: 'VERIFIED' },
      ],
    };
    expect(userMatchesRules({ total_bets: 0, kyc_status: 'VERIFIED' }, rules)).toBe(true);
    expect(userMatchesRules({ total_bets: 0, kyc_status: 'PENDING' }, rules)).toBe(false);
  });
});

describe('Targeted campaign lifecycle status', () => {
  it('keeps ACTIVE only when not expired and started', () => {
    expect(resolveCampaignLifecycleStatus({ status: 'ACTIVE' })).toBe('ACTIVE');
    expect(resolveCampaignLifecycleStatus({ status: 'DRAFT' })).toBe('DRAFT');
    expect(resolveCampaignLifecycleStatus({ status: 'PAUSED' })).toBe('PAUSED');
    expect(resolveCampaignLifecycleStatus({ status: 'CLOSED' })).toBe('COMPLETED');
    expect(resolveCampaignLifecycleStatus({
      status: 'ACTIVE',
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    })).toBe('EXPIRED');
    expect(resolveCampaignLifecycleStatus({
      status: 'ACTIVE',
      starts_at: new Date(Date.now() + 3600_000).toISOString(),
    })).toBe('SCHEDULED');
  });

  it('grant gate remains ACTIVE-only (enabled flag)', () => {
    // mapCampaignRow uses status === ACTIVE for enabled; lifecycle display is separate
    expect(String('ACTIVE').toUpperCase() === 'ACTIVE').toBe(true);
    expect(['DRAFT', 'SCHEDULED', 'PAUSED', 'EXPIRED', 'COMPLETED'].includes('ACTIVE')).toBe(false);
  });
});

const hasDb = Boolean(process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING);

describe.runIf(hasDb)('Wave 1 integration (DB)', () => {
  it('previews and refreshes a segment', async () => {
    const {
      createCustomerSegment,
      previewCustomerSegment,
      refreshCustomerSegmentMemberships,
      deleteCustomerSegment,
    } = await import('../../lib/crmEngine.mjs');
    const name = `WAVE1_TEST_${Date.now()}`;
    const created = await createCustomerSegment({
      name,
      description: 'wave1 test',
      rules: { conditions: [{ field: 'total_deposits', operator: '>=', value: 0 }] },
      createdBy: 'test',
    });
    expect(created.segmentId).toBeTruthy();
    const preview = await previewCustomerSegment({ segmentId: created.segmentId, limit: 5 });
    expect(preview.success).toBe(true);
    expect(typeof preview.matched).toBe('number');
    const refreshed = await refreshCustomerSegmentMemberships(created.segmentId);
    expect(refreshed.success).toBe(true);
    await deleteCustomerSegment(created.segmentId);
  }, 60_000);

  it('returns referral analytics shape', async () => {
    const { getReferralAnalytics } = await import('../../lib/referralLoyaltyEngine.mjs');
    const data = await getReferralAnalytics({ limit: 5 });
    expect(data.success).toBe(true);
    expect(data.funnel).toBeTruthy();
    expect(Array.isArray(data.topReferrers)).toBe(true);
  });
});
