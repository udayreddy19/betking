/**
 * Affiliate & Referral Platform Engine
 * Tracks referral links, clicks, user conversions, commission calculation, and payout statements.
 */

class AffiliateEngine {
  constructor() {
    this.affiliates = new Map(); // affiliateId -> Record
  }

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
        const commission = depositAmount * 0.05; // 5% revenue share
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
