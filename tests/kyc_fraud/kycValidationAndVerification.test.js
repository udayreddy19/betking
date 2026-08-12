import { describe, it, expect, beforeEach } from 'vitest';
import { kycEngine, maskPan, maskAadhaar } from '../../lib/kycEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 9 KYC Validation, State Machine & Verification Tests', () => {
  const user1 = 'usr_kyc_101';
  const user2 = 'usr_kyc_102';

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [user1, `${user1}@example.com`]);
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [user2, `${user2}@example.com`]);
    await query(`DELETE FROM kyc_cases WHERE user_id IN ($1, $2);`, [user1, user2]);
    await query(`DELETE FROM risk_signals WHERE user_id IN ($1, $2);`, [user1, user2]);
  });

  it('should validate PAN format correctly and reject invalid PAN formats', async () => {
    await expect(kycEngine.submitKycVerification({
      userId: user1,
      documentType: 'PAN',
      documentNumber: 'INVALID_PAN_123',
    })).rejects.toThrow('INVALID_PAN_FORMAT');

    const res = await kycEngine.submitKycVerification({
      userId: user1,
      documentType: 'PAN',
      documentNumber: 'ABCDE1234F',
    });

    expect(res.success).toBe(true);
    expect(res.status).toBe('UNDER_REVIEW');
    expect(res.documentNumberMasked).toBe('XXXXXX234F');
  });

  it('CRITICAL: PII masking test -> getUserKycStatus returns masked PAN and Aadhaar', async () => {
    await kycEngine.submitKycVerification({
      userId: user1,
      documentType: 'PAN',
      documentNumber: 'ABCDE1234F',
    });

    const kycStatus = await kycEngine.getUserKycStatus(user1);
    expect(kycStatus.status).toBe('UNDER_REVIEW');
    expect(kycStatus.panMasked).toBe('XXXXXX234F');

    expect(maskPan('ABCDE1234F')).toBe('XXXXXX234F');
    expect(maskAadhaar('123456789012')).toBe('XXXXXXXX9012');
  });

  it('should process admin verification decision and update kyc_cases & user_profiles', async () => {
    const subRes = await kycEngine.submitKycVerification({
      userId: user1,
      documentType: 'PAN',
      documentNumber: 'ABCDE1234F',
    });

    const verifyRes = await kycEngine.verifyKycCase({
      caseId: subRes.caseId,
      decision: 'VERIFIED',
      reviewerId: 'admin_kyc_agent',
      notes: 'PAN verified against tax authority portal',
    });

    expect(verifyRes.success).toBe(true);
    expect(verifyRes.decision).toBe('VERIFIED');

    const dbCase = await query('SELECT status FROM kyc_cases WHERE case_id = $1', [subRes.caseId]);
    expect(dbCase.rows[0].status).toBe('VERIFIED');

    const dbProf = await query('SELECT kyc_status FROM user_profiles WHERE user_id = $1', [user1]);
    expect(dbProf.rows[0].kyc_status).toBe('VERIFIED');
  });

  it('CRITICAL: duplicate PAN detection -> generates DUPLICATE_PAN risk signal', async () => {
    // User 1 gets verified with PAN
    const sub1 = await kycEngine.submitKycVerification({ userId: user1, documentType: 'PAN', documentNumber: 'DUPAN1234F' });
    await kycEngine.verifyKycCase({ caseId: sub1.caseId, decision: 'VERIFIED' });

    // User 2 attempts submitting same PAN
    await kycEngine.submitKycVerification({ userId: user2, documentType: 'PAN', documentNumber: 'DUPAN1234F' });

    // Check risk signals for User 2
    const sigRes = await query('SELECT * FROM risk_signals WHERE user_id = $1 AND signal_type = \'DUPLICATE_PAN\'', [user2]);
    expect(sigRes.rows.length).toBe(1);
    expect(sigRes.rows[0].severity).toBe('HIGH');
  });
});
