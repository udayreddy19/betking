import { describe, it, expect, beforeEach } from 'vitest';
import { kycEngine } from '../../lib/kycEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 9 KYC Security & Authorization Tests', () => {
  const userId = 'usr_sec_kyc_101';

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userId, `${userId}@example.com`]);
    await query(`DELETE FROM kyc_cases WHERE user_id = $1;`, [userId]);
  });

  it('CRITICAL: invalid review decision must be REJECTED server-side', async () => {
    const subRes = await kycEngine.submitKycVerification({
      userId,
      documentType: 'PAN',
      documentNumber: 'SECKY1234F',
    });

    await expect(kycEngine.verifyKycCase({
      caseId: subRes.caseId,
      decision: 'INVALID_DECISION_TYPE',
    })).rejects.toThrow('Invalid decision');
  });
});
