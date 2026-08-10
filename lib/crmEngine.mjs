/**
 * CRM & Customer Segmentation Engine
 * Generates dynamic customer segments and enforces communication consent preferences.
 */

class CrmEngine {
  constructor() {
    this.userPreferences = new Map(); // userId -> Preferences
  }

  setCommunicationPreferences(userId, { allowMarketing = false, allowTransactional = true, channel = 'IN_APP' } = {}) {
    const prefs = {
      userId,
      allowMarketing,
      allowTransactional,
      preferredChannel: channel,
      updatedAt: new Date().toISOString(),
    };

    this.userPreferences.set(userId, prefs);
    return prefs;
  }

  getCommunicationPreferences(userId) {
    return this.userPreferences.get(userId) || { allowMarketing: false, allowTransactional: true, preferredChannel: 'IN_APP' };
  }

  segmentUser({ totalBetsCount = 0, totalDepositAmount = 0, kycStatus = 'NOT_STARTED' }) {
    if (totalDepositAmount > 100000) return 'HIGH_VALUE_BETTOR';
    if (totalBetsCount > 20) return 'ACTIVE_BETTOR';
    if (kycStatus === 'VERIFIED') return 'VERIFIED_USER';
    return 'NEW_USER';
  }
}

export const crmEngine = new CrmEngine();
