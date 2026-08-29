/**
 * Server-Authoritative Enterprise KYC Engine
 * Format validation (PAN / Aadhaar), duplicate identity detection, PostgreSQL persistence,
 * PII masking (XXXXXX1234), and Phase 2 account restriction integration.
 */

import { query } from '../db/pg.js';
import { generateRiskSignal } from './riskSignalEngine.mjs';
import {
  normalizePan,
  normalizeAadhaar,
  alreadyLinkedError,
  assertPanAvailable,
  assertAadhaarAvailable,
} from './userIdentity.mjs';
import { ageFromDob, MIN_LEGAL_AGE } from './kycAgeGate.mjs';

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
export const AADHAAR_REGEX = /^[0-9]{12}$/;

export function maskPan(pan) {
  if (!pan || pan.length < 10) return 'XXXXXX0000';
  return `XXXXXX${pan.slice(-4)}`;
}

export function maskAadhaar(aadhaar) {
  if (!aadhaar || aadhaar.length < 12) return 'XXXXXXXX0000';
  return `XXXXXXXX${aadhaar.slice(-4)}`;
}

export class KycEngine {
  /** Submit user KYC documents for verification */
  async submitKycVerification({ userId, documentType = 'PAN', documentNumber = '', documentUrls = [], dateOfBirth = null }) {
    if (!userId) throw new Error('User ID is required for KYC submission');
    if (!documentNumber) throw new Error('Document number is required');

    const type = documentType.toUpperCase();
    const isPan = type === 'PAN';
    const isAadhaar = type === 'AADHAAR';
    if (!isPan && !isAadhaar) {
      throw Object.assign(new Error('Submit a PAN or Aadhaar number.'), {
        code: 'INVALID_DOCUMENT_TYPE',
        status: 400,
      });
    }
    const panNum = isPan ? normalizePan(documentNumber) : null;
    const aadhaarNum = isAadhaar ? normalizeAadhaar(documentNumber) : null;

    if (isPan && !PAN_REGEX.test(panNum)) {
      throw Object.assign(new Error('PAN must be a 10-character code like ABCDE1234F.'), {
        code: 'INVALID_PAN_FORMAT',
        status: 400,
      });
    }
    if (isAadhaar && !AADHAAR_REGEX.test(aadhaarNum)) {
      throw Object.assign(new Error('Aadhaar must be a 12-digit number.'), {
        code: 'INVALID_AADHAAR_FORMAT',
        status: 400,
      });
    }

    const existingRes = await query(
      `SELECT case_id, pan_number, aadhaar_number, status
       FROM kyc_cases
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [userId],
    );
    const existing = existingRes.rows[0] || null;

    if (isPan) {
      const ownPan = existing?.pan_number ? normalizePan(existing.pan_number) : '';
      if (existing?.status === 'VERIFIED' && ownPan && ownPan !== panNum) {
        throw Object.assign(new Error('PAN is already verified on this account and cannot be changed.'), {
          code: 'PAN_LOCKED',
          status: 409,
        });
      }
      try {
        await assertPanAvailable(panNum, userId);
      } catch (err) {
        if (err.code === 'DUPLICATE_PAN') {
          await generateRiskSignal({
            userId,
            signalType: 'DUPLICATE_PAN',
            severity: 'HIGH',
            score: 35,
            source: 'KYC_ENGINE',
            evidence: { panMasked: maskPan(panNum) },
          });
        }
        throw err;
      }
    }

    if (isAadhaar) {
      const ownAadhaar = existing?.aadhaar_number ? normalizeAadhaar(existing.aadhaar_number) : '';
      if (existing?.status === 'VERIFIED' && ownAadhaar && ownAadhaar !== aadhaarNum) {
        throw Object.assign(new Error('Aadhaar is already verified on this account and cannot be changed.'), {
          code: 'AADHAAR_LOCKED',
          status: 409,
        });
      }
      try {
        await assertAadhaarAvailable(aadhaarNum, userId);
      } catch (err) {
        if (err.code === 'DUPLICATE_AADHAAR') {
          await generateRiskSignal({
            userId,
            signalType: 'DUPLICATE_AADHAAR',
            severity: 'HIGH',
            score: 35,
            source: 'KYC_ENGINE',
            evidence: { aadhaarMasked: maskAadhaar(aadhaarNum) },
          });
        }
        throw err;
      }
    }

    const caseId = existing?.case_id || `kyc_${userId}`;
    const keepVerified = existing?.status === 'VERIFIED'
      && ((isPan && normalizePan(existing.pan_number) === panNum)
        || (isAadhaar && normalizeAadhaar(existing.aadhaar_number) === aadhaarNum));
    const nextStatus = keepVerified ? 'VERIFIED' : 'UNDER_REVIEW';

    await query(`INSERT INTO users (user_id, email) VALUES ($1, $1) ON CONFLICT (user_id) DO NOTHING`, [userId]);

    try {
      if (existing) {
        await query(
          `UPDATE kyc_cases
           SET status = $2,
               pan_number = COALESCE($3, pan_number),
               aadhaar_number = COALESCE($4, aadhaar_number),
               updated_at = NOW()
           WHERE case_id = $1`,
          [caseId, nextStatus, panNum, aadhaarNum],
        );
      } else {
        await query(
          `INSERT INTO kyc_cases (case_id, user_id, status, pan_number, aadhaar_number, document_urls, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [caseId, userId, nextStatus, panNum, aadhaarNum, documentUrls],
        );
      }
    } catch (err) {
      if (err.code === '23505') {
        if (String(err.constraint || err.detail || '').toLowerCase().includes('aadhaar')) {
          throw alreadyLinkedError('aadhaar');
        }
        if (String(err.constraint || err.detail || '').toLowerCase().includes('pan')) {
          throw alreadyLinkedError('pan');
        }
        throw alreadyLinkedError('pan');
      }
      throw err;
    }

    // Update user_profiles kyc_status
    if (dateOfBirth) {
      await this.saveDateOfBirth(userId, dateOfBirth);
    }

    await query(
      `INSERT INTO user_profiles (user_id, kyc_status, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET kyc_status = EXCLUDED.kyc_status, updated_at = NOW()`,
      [userId, nextStatus]
    );

    if (nextStatus === 'VERIFIED') {
      try {
        const { bindPromoIdentityOnKycVerify } = await import('./signupPromoCodes.mjs');
        await bindPromoIdentityOnKycVerify(userId);
      } catch (ignored) {}
      try {
        const { tryQualifyReferralAfterVerification } = await import('./referralLoyaltyEngine.mjs');
        await tryQualifyReferralAfterVerification({ userId });
      } catch (ignored) {}
    }

    return {
      success: true,
      caseId,
      userId,
      documentType: type,
      documentNumberMasked: isPan ? maskPan(panNum) : maskAadhaar(aadhaarNum),
      status: nextStatus,
    };
  }

  /** Admin verification workflow */
  async verifyKycCase({ caseId, decision, reviewerId = 'admin', notes = '' }) {
    const validDecisions = ['VERIFIED', 'REJECTED', 'RESUBMISSION_REQUIRED'];
    if (!validDecisions.includes(decision)) {
      throw new Error(`Invalid decision '${decision}'. Must be one of: ${validDecisions.join(', ')}`);
    }

    const caseRes = await query(`SELECT * FROM kyc_cases WHERE case_id = $1`, [caseId]);
    if (caseRes.rows.length === 0) {
      throw new Error(`KYC case ${caseId} not found`);
    }

    const kycCase = caseRes.rows[0];
    const userId = kycCase.user_id;

    if (decision === 'VERIFIED') {
      if (kycCase.pan_number) {
        await assertPanAvailable(kycCase.pan_number, userId);
      }
      if (kycCase.aadhaar_number) {
        await assertAadhaarAvailable(kycCase.aadhaar_number, userId);
      }
    }

    // Update kyc_cases
    await query(
      `UPDATE kyc_cases
       SET status = $1, reviewed_by = $2, updated_at = NOW()
       WHERE case_id = $3`,
      [decision, reviewerId, caseId]
    );

    // Update user_profiles
    await query(
      `UPDATE user_profiles SET kyc_status = $1, updated_at = NOW() WHERE user_id = $2`,
      [decision, userId]
    );

    // Audit action with PII masking
    const maskedPan = kycCase.pan_number ? maskPan(kycCase.pan_number) : null;
    await query(
      `INSERT INTO audit_events (actor_id, target_id, action, details, created_at)
       VALUES ($1, $2, 'KYC_VERIFICATION_DECISION', $3, NOW())`,
      [reviewerId, userId, JSON.stringify({ caseId, decision, notes, panMasked: maskedPan })]
    );

    if (decision === 'VERIFIED') {
      try {
        const { bindPromoIdentityOnKycVerify } = await import('./signupPromoCodes.mjs');
        await bindPromoIdentityOnKycVerify(userId);
      } catch (ignored) {}
      try {
        const { tryQualifyReferralAfterVerification } = await import('./referralLoyaltyEngine.mjs');
        await tryQualifyReferralAfterVerification({ userId });
      } catch (ignored) {}
    }

    return {
      success: true,
      caseId,
      userId,
      decision,
      reviewedBy: reviewerId,
    };
  }

  async saveDateOfBirth(userId, dateOfBirth) {
    const age = ageFromDob(dateOfBirth);
    if (age == null) {
      throw Object.assign(new Error('Enter a valid date of birth.'), { code: 'INVALID_DOB', status: 400 });
    }
    if (age < MIN_LEGAL_AGE) {
      throw Object.assign(new Error('You must be 18 or older.'), { code: 'UNDERAGE', status: 403 });
    }
    const isoDay = String(dateOfBirth).slice(0, 10);
    await query(
      `INSERT INTO user_profiles (user_id, date_of_birth, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET date_of_birth = EXCLUDED.date_of_birth, updated_at = NOW()`,
      [userId, isoDay],
    );
    return { success: true, dateOfBirth: isoDay, age };
  }

  /** Retrieve user KYC status with PII masking */
  async getUserKycStatus(userId) {
    const caseRes = await query(
      `SELECT * FROM kyc_cases WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [userId]
    );

    let dob = null;
    try {
      const profile = await query(
        `SELECT kyc_status, date_of_birth FROM user_profiles WHERE user_id = $1`,
        [userId],
      );
      dob = profile.rows[0]?.date_of_birth || null;
      if (caseRes.rows.length === 0) {
        return {
          userId,
          status: profile.rows[0]?.kyc_status || 'NOT_STARTED',
          panMasked: null,
          aadhaarMasked: null,
          dateOfBirth: dob ? String(dob).slice(0, 10) : null,
          hasDateOfBirth: Boolean(dob),
          ageEligible: ageFromDob(dob) != null && ageFromDob(dob) >= MIN_LEGAL_AGE,
        };
      }
    } catch {
      if (caseRes.rows.length === 0) {
        return { userId, status: 'NOT_STARTED', panMasked: null, aadhaarMasked: null, hasDateOfBirth: false, ageEligible: false };
      }
    }

    const row = caseRes.rows[0];
    return {
      caseId: row.case_id,
      userId: row.user_id,
      status: row.status,
      panMasked: row.pan_number ? maskPan(row.pan_number) : null,
      aadhaarMasked: row.aadhaar_number ? maskAadhaar(row.aadhaar_number) : null,
      updatedAt: row.updated_at,
      dateOfBirth: dob ? String(dob).slice(0, 10) : null,
      hasDateOfBirth: Boolean(dob),
      ageEligible: ageFromDob(dob) != null && ageFromDob(dob) >= MIN_LEGAL_AGE,
    };
  }
}

export const kycEngine = new KycEngine();
export const submitKycVerification = (userId, data) => kycEngine.submitKycVerification({ userId, ...data });
