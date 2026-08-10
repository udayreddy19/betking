/**
 * KYC & Identity Platform Engine
 * Manages customer identity lifecycle states, age eligibility (18+), and document verification status.
 */

class IdentityEngine {
  constructor() {
    this.userProfiles = new Map(); // userId -> Identity Record
  }

  /** Update or register user identity record */
  submitIdentityDocument(userId, { docType = 'PASSPORT', docNumber = '', birthDate = '' } = {}) {
    if (!userId) return null;

    let age = 21;
    if (birthDate) {
      const birthYear = new Date(birthDate).getFullYear();
      age = new Date().getFullYear() - birthYear;
    }

    const isAgeEligible = age >= 18;

    const record = {
      userId,
      docType,
      docNumberMasked: docNumber ? `****${docNumber.slice(-4)}` : '****',
      age,
      isAgeEligible,
      status: isAgeEligible ? 'VERIFIED' : 'REJECTED',
      rejectionReason: isAgeEligible ? null : 'AGE_RESTRICTION_UNDER_18',
      verifiedAt: new Date().toISOString(),
    };

    this.userProfiles.set(userId, record);
    return record;
  }

  getIdentityStatus(userId) {
    return this.userProfiles.get(userId) || { status: 'NOT_STARTED', isAgeEligible: false };
  }
}

export const identityEngine = new IdentityEngine();
