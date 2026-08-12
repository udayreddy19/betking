/**
 * Server-Authoritative Enterprise KYC Engine
 * Format validation (PAN / Aadhaar), duplicate identity detection, PostgreSQL persistence,
 * PII masking (XXXXXX1234), and Phase 2 account restriction integration.
 */

import { query } from '../db/pg.js';
import { generateRiskSignal } from './riskSignalEngine.mjs';

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
  async submitKycVerification({ userId, documentType = 'PAN', documentNumber = '', documentUrls = [] }) {
    if (!userId) throw new Error('User ID is required for KYC submission');
    if (!documentNumber) throw new Error('Document number is required');

    const type = documentType.toUpperCase();
    let isPan = type === 'PAN';
    let isAadhaar = type === 'AADHAAR';

    // Format validation
    if (isPan && !PAN_REGEX.test(documentNumber)) {
      throw new Error('INVALID_PAN_FORMAT: PAN must be a 10-character alphanumeric string (e.g. ABCDE1234F)');
    }
    if (isAadhaar && !AADHAAR_REGEX.test(documentNumber)) {
      throw new Error('INVALID_AADHAAR_FORMAT: Aadhaar must be a 12-digit numeric string');
    }

    // Duplicate PAN Detection
    if (isPan) {
      const dupRes = await query(
        `SELECT user_id FROM kyc_cases WHERE pan_number = $1 AND user_id != $2 AND status = 'VERIFIED'`,
        [documentNumber, userId]
      );
      if (dupRes.rows.length > 0) {
        await generateRiskSignal({
          userId,
          signalType: 'DUPLICATE_PAN',
          severity: 'HIGH',
          score: 35,
          source: 'KYC_ENGINE',
          evidence: { panMasked: maskPan(documentNumber), duplicateUserCount: dupRes.rows.length },
        });
      }
    }

    const caseId = `kyc_${userId}_${Date.now()}`;
    const panNum = isPan ? documentNumber : null;
    const aadhaarNum = isAadhaar ? documentNumber : null;

    // Ensure user exists in users table
    await query(`INSERT INTO users (user_id, email) VALUES ($1, $1) ON CONFLICT (user_id) DO NOTHING`, [userId]);

    // Upsert kyc_cases in PostgreSQL
    await query(
      `INSERT INTO kyc_cases (case_id, user_id, status, pan_number, aadhaar_number, document_urls, updated_at)
       VALUES ($1, $2, 'UNDER_REVIEW', $3, $4, $5, NOW())
       ON CONFLICT (case_id) DO UPDATE
       SET status = 'UNDER_REVIEW', pan_number = EXCLUDED.pan_number, aadhaar_number = EXCLUDED.aadhaar_number, updated_at = NOW()`,
      [caseId, userId, panNum, aadhaarNum, documentUrls]
    );

    // Update user_profiles kyc_status
    await query(
      `INSERT INTO user_profiles (user_id, kyc_status, updated_at)
       VALUES ($1, 'UNDER_REVIEW', NOW())
       ON CONFLICT (user_id) DO UPDATE SET kyc_status = 'UNDER_REVIEW', updated_at = NOW()`,
      [userId]
    );

    return {
      success: true,
      caseId,
      userId,
      documentType: type,
      documentNumberMasked: isPan ? maskPan(documentNumber) : maskAadhaar(documentNumber),
      status: 'UNDER_REVIEW',
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

    return {
      success: true,
      caseId,
      userId,
      decision,
      reviewedBy: reviewerId,
    };
  }

  /** Retrieve user KYC status with PII masking */
  async getUserKycStatus(userId) {
    const caseRes = await query(
      `SELECT * FROM kyc_cases WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [userId]
    );

    if (caseRes.rows.length === 0) {
      return { userId, status: 'NOT_STARTED', panMasked: null, aadhaarMasked: null };
    }

    const row = caseRes.rows[0];
    return {
      caseId: row.case_id,
      userId: row.user_id,
      status: row.status,
      panMasked: row.pan_number ? maskPan(row.pan_number) : null,
      aadhaarMasked: row.aadhaar_number ? maskAadhaar(row.aadhaar_number) : null,
      updatedAt: row.updated_at,
    };
  }
}

export const kycEngine = new KycEngine();
export const submitKycVerification = (userId, data) => kycEngine.submitKycVerification({ userId, ...data });
