/**
 * Affiliate & Referral Platform Engine — OddsYra Enterprise Platform
 * 
 * PG-backed affiliate accounts, tracking links, commission calculation,
 * fraud detection, and payout management.
 */

import { query } from '../db/pg.js';

class AffiliateEngine {
  constructor() {
    this.affiliates = new Map();
  }

  // Retained for backward compatibility
  registerAffiliate(affiliateId, name = '') {
    const record = {
      affiliateId,
      name,
      referralCode: `REF_${affiliateId.toUpperCase()}`,
      clicks: 0,
      conversions: 0,
      totalCommissionEarned: 0.0,
      createdAt: new Date().toISOString(),
    };
    this.affiliates.set(affiliateId, record);
    return record;
  }

  recordReferralClick(referralCode) {
    for (const aff of this.affiliates.values()) {
      if (aff.referralCode === referralCode) {
        aff.clicks += 1;
        return aff;
      }
    }
    return null;
  }

  recordConversion(referralCode, depositAmount = 0) {
    for (const aff of this.affiliates.values()) {
      if (aff.referralCode === referralCode) {
        aff.conversions += 1;
        const commission = depositAmount * 0.05;
        aff.totalCommissionEarned += commission;
        return { affiliateId: aff.affiliateId, commission };
      }
    }
    return null;
  }

  getAffiliateSummary(affiliateId) {
    return this.affiliates.get(affiliateId) || null;
  }
}

export const affiliateEngine = new AffiliateEngine();

// ============================================================
// PG-BACKED AFFILIATE PLATFORM
// ============================================================

/**
 * Create a PG-backed affiliate account.
 */
export async function createAffiliateAccount({
  name,
  email,
  referralCode = null,
  commissionRate = 5.00,
}) {
  const id = `aff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const code = referralCode || `REF_${name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  await query(`
    INSERT INTO affiliate_accounts (id, name, email, referral_code, commission_rate)
    VALUES ($1, $2, $3, $4, $5);
  `, [id, name, email, code, commissionRate]);

  return { success: true, affiliateId: id, name, email, referralCode: code, commissionRate };
}

/**
 * Record a click on an affiliate tracking link.
 */
export async function recordAffiliateClick(referralCode) {
  const res = await query(`
    UPDATE affiliate_accounts
    SET total_clicks = total_clicks + 1, updated_at = CURRENT_TIMESTAMP
    WHERE referral_code = $1
    RETURNING id, name, total_clicks;
  `, [referralCode]);

  if (res.rows.length === 0) return { success: false, error: 'Affiliate not found' };
  return { success: true, affiliate: res.rows[0] };
}

/**
 * Record a conversion (user registration/first deposit via affiliate link).
 */
export async function recordAffiliateConversion({
  referralCode,
  referredUserId,
  eventType = 'REGISTRATION',
  amount = 0,
}) {
  // Find affiliate
  const affRes = await query(`SELECT id, commission_rate FROM affiliate_accounts WHERE referral_code = $1;`, [referralCode]);
  if (affRes.rows.length === 0) return { success: false, error: 'Affiliate not found' };

  const affiliate = affRes.rows[0];
  const commission = amount * (affiliate.commission_rate / 100);
  const commissionId = `afc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // Check for duplicate conversion (fraud protection)
  const dupCheck = await query(`
    SELECT id FROM affiliate_commissions
    WHERE affiliate_id = $1 AND referred_user_id = $2 AND event_type = $3;
  `, [affiliate.id, referredUserId, eventType]);

  if (dupCheck.rows.length > 0) {
    return { success: false, error: 'DUPLICATE_CONVERSION_BLOCKED', affiliateId: affiliate.id };
  }

  await query(`
    INSERT INTO affiliate_commissions (id, affiliate_id, referred_user_id, event_type, amount, status)
    VALUES ($1, $2, $3, $4, $5, 'PENDING');
  `, [commissionId, affiliate.id, referredUserId, eventType, commission]);

  // Update affiliate totals
  await query(`
    UPDATE affiliate_accounts
    SET total_conversions = total_conversions + 1,
        total_commission_earned = total_commission_earned + $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1;
  `, [affiliate.id, commission]);

  return { success: true, affiliateId: affiliate.id, commissionId, commission, eventType };
}

/**
 * Get affiliate dashboard summary.
 */
export async function getAffiliateDashboard(affiliateId) {
  const affRes = await query(`
    SELECT id, name, email, referral_code, commission_rate, status,
           total_clicks, total_conversions, total_commission_earned, total_commission_paid,
           created_at, updated_at
    FROM affiliate_accounts
    WHERE id = $1;
  `, [affiliateId]);

  if (affRes.rows.length === 0) return { success: false, error: 'Affiliate not found' };

  const commRes = await query(`
    SELECT event_type, amount, status, created_at
    FROM affiliate_commissions
    WHERE affiliate_id = $1
    ORDER BY created_at DESC
    LIMIT 50;
  `, [affiliateId]);

  return {
    success: true,
    affiliate: affRes.rows[0],
    recentCommissions: commRes.rows,
  };
}

/**
 * Get all affiliate accounts (admin view).
 */
export async function getAllAffiliates() {
  const res = await query(`
    SELECT id, name, email, referral_code, commission_rate, status,
           total_clicks, total_conversions, total_commission_earned, total_commission_paid,
           created_at
    FROM affiliate_accounts
    ORDER BY total_commission_earned DESC;
  `);
  return { success: true, count: res.rows.length, affiliates: res.rows };
}
