/**
 * Growth E2E (DB): segment → exclude high-risk → create targeted campaign →
 * abuse gate → grant path for eligible only.
 * Uses synthetic users/deposits — no Razorpay.
 */
import { describe, it, expect, beforeEach } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING);

describe.runIf(hasDb)('Growth E2E: campaign → segment exclude → grant', () => {
  let query;
  const stamp = Date.now();
  const eligible = `usr_g2e_ok_${stamp}`;
  const excluded = `usr_g2e_bad_${stamp}`;
  const depositOk = `dep_g2e_ok_${stamp}`;
  const depositBad = `dep_g2e_bad_${stamp}`;

  beforeEach(async () => {
    ({ query } = await import('../../db/pg.js'));
    await query(`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS audience_exclude_segment_ids JSONB NOT NULL DEFAULT '[]'::jsonb`).catch(() => null);
    await query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS freebet_balance NUMERIC(14,2) DEFAULT 0`).catch(() => null);

    for (const uid of [eligible, excluded]) {
      await query(`INSERT INTO users (user_id, email, password_hash, status) VALUES ($1,$2,'h','ACTIVE') ON CONFLICT (user_id) DO UPDATE SET status='ACTIVE'`, [
        uid, `${uid}@example.com`,
      ]);
      await query(
        `INSERT INTO wallets (wallet_id, user_id, balance, freebet_balance, currency)
         VALUES ($1,$2,0,0,'INR')
         ON CONFLICT (user_id) DO UPDATE SET freebet_balance = 0, balance = 0`,
        [`wal_${uid}`, uid],
      );
      await query(
        `INSERT INTO user_profiles (user_id, account_status, kyc_status, risk_tier)
         VALUES ($1,'ACTIVE','VERIFIED',$2)
         ON CONFLICT (user_id) DO UPDATE SET kyc_status='VERIFIED', account_status='ACTIVE', risk_tier=EXCLUDED.risk_tier`,
        [uid, uid === excluded ? 'HIGH_RISK' : 'LOW_RISK'],
      );
    }
  });

  it('excluded user cannot receive targeted freebet; eligible can', async () => {
    const {
      createCustomerSegment,
      deleteCustomerSegment,
    } = await import('../../lib/crmEngine.mjs');
    const {
      createTargetedDepositFreebetCampaign,
      setTargetedDepositFreebetStatus,
      tryGrantDepositFreebet,
      deleteTargetedDepositFreebetCampaign,
    } = await import('../../lib/depositFreebetEngine.mjs');

    const riskSeg = await createCustomerSegment({
      name: `G2E_RISK_${stamp}`,
      rules: { match: 'all', conditions: [{ field: 'risk_tier', operator: 'in', value: ['HIGH', 'HIGH_RISK', 'CRITICAL'] }] },
      autoEvaluate: true,
    });
    await query(
      `INSERT INTO user_segment_memberships (user_id, segment_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [excluded, riskSeg.segmentId],
    );

    const campaign = await createTargetedDepositFreebetCampaign({
      name: 'G2E 100% Freebet',
      minDeposit: 10000,
      matchPercent: 100,
      maxFreeBet: 10000,
      onePerUser: true,
      emailOnGrant: false,
      freebetExpiryDays: 7,
      userIds: [eligible, excluded],
      excludeSegmentIds: [riskSeg.segmentId],
    }, { adminId: 'admin_g2e' });

    // Isolate from leftover non-targeted ALL freebet campaigns (e.g. DEPOSIT_MATCH_FREEBET).
    // Exclude-segment rules apply to this targeted campaign; global ALL offers are separate.
    const pausedOthers = await query(
      `UPDATE promotions
       SET status = 'PAUSED'
       WHERE COALESCE(reward_bucket, 'bonus') = 'freebet'
         AND COALESCE(auto_grant_on_deposit, false) = true
         AND UPPER(COALESCE(status, '')) = 'ACTIVE'
         AND id <> $1
       RETURNING id`,
      [campaign.id],
    );
    const pausedIds = pausedOthers.rows.map((r) => r.id);

    try {
      await setTargetedDepositFreebetStatus(campaign.id, 'ACTIVE');

      const assigned = await query(
        `SELECT user_id FROM deposit_freebet_campaign_users WHERE promotion_id = $1 ORDER BY user_id`,
        [campaign.id],
      );
      expect(assigned.rows.map((r) => r.user_id)).toEqual([eligible]);
      expect(assigned.rows.map((r) => r.user_id)).not.toContain(excluded);

      // Seed deposits
      for (const [uid, depId] of [[eligible, depositOk], [excluded, depositBad]]) {
        await query(
          `INSERT INTO deposits (id, deposit_id, user_id, order_id, amount, currency, status, created_at)
           VALUES ($1,$1,$2,$3,10000,'INR','CAPTURED',NOW())
           ON CONFLICT (id) DO UPDATE SET status='CAPTURED', amount=10000`,
          [depId, uid, `ord_${depId}`],
        );
      }

      const grantOk = await tryGrantDepositFreebet({
        userId: eligible,
        depositId: depositOk,
        amount: 10000,
        autoEmail: false,
      });
      expect(grantOk.granted).toBe(true);
      expect(grantOk.promotionId).toBe(campaign.id);

      const grantBad = await tryGrantDepositFreebet({
        userId: excluded,
        depositId: depositBad,
        amount: 10000,
        autoEmail: false,
      });
      // Not in targeted campaign audience → cannot claim this offer
      expect(grantBad.granted).toBe(false);
      expect(grantBad.promotionId === campaign.id).toBeFalsy();
    } finally {
      if (pausedIds.length) {
        await query(
          `UPDATE promotions SET status = 'ACTIVE' WHERE id = ANY($1::text[])`,
          [pausedIds],
        ).catch(() => null);
      }
      await deleteTargetedDepositFreebetCampaign(campaign.id, { adminId: 'admin_g2e' }).catch(() => null);
      await deleteCustomerSegment(riskSeg.segmentId).catch(() => null);
    }
  });
});

describe.runIf(!hasDb)('Growth E2E (skipped)', () => {
  it('skips without DATABASE_URL', () => {
    expect(hasDb).toBe(false);
  });
});
