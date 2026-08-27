import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  normalizeNameForMatch,
  compareBeneficiaryToKycName,
  evaluateBeneficiaryKycMatch,
  assertBeneficiaryKycNameMatchForWithdrawal,
  BENEFICIARY_KYC_MATCH_CODES,
  isBeneficiaryKycMatchEnforced,
} from '../../lib/beneficiaryKycNameMatch.mjs';
import { withdrawalEngine } from '../../lib/withdrawalEngine.mjs';
import { query } from '../../db/pg.js';

describe('beneficiaryKycNameMatch', () => {
  it('normalizes case, spaces, and punctuation without inventing tokens', () => {
    expect(normalizeNameForMatch('  Uday   Kumar.Reddy ')).toBe('UDAY KUMAR REDDY');
    expect(normalizeNameForMatch('uday-kumar reddy')).toBe('UDAY KUMAR REDDY');
  });

  it('matches exact normalized names', () => {
    const r = compareBeneficiaryToKycName('UDAY KUMAR REDDY', 'uday kumar reddy');
    expect(r.outcome).toBe('MATCHED');
    expect(r.code).toBe(BENEFICIARY_KYC_MATCH_CODES.MATCHED);
  });

  it('mismatches clearly different names', () => {
    const r = compareBeneficiaryToKycName('UDAY KUMAR REDDY', 'RAHUL KUMAR');
    expect(r.outcome).toBe('MISMATCH');
    expect(r.code).toBe(BENEFICIARY_KYC_MATCH_CODES.MISMATCH);
  });

  it('marks name-order variants as ambiguous (no auto-approve)', () => {
    const r = compareBeneficiaryToKycName('UDAY KUMAR REDDY', 'REDDY UDAY KUMAR');
    expect(r.outcome).toBe('AMBIGUOUS');
    expect(r.code).toBe(BENEFICIARY_KYC_MATCH_CODES.AMBIGUOUS);
  });

  it('extracts declared account-holder name from bank transfer details string', async () => {
    const { extractDeclaredAccountHolderFromBankDetails, maskBankDetailsForAdmin } = await import('../../lib/beneficiaryKycNameMatch.mjs');
    expect(extractDeclaredAccountHolderFromBankDetails({
      method: 'BANK_TRANSFER',
      details: 'Bank: HDFC | A/C: 5010023456789 | IFSC: HDFC0001234 | Name: Uday Kumar Reddy',
    })).toBe('Uday Kumar Reddy');
    expect(extractDeclaredAccountHolderFromBankDetails({ method: 'UPI', details: 'UPI ID: user@upi' })).toBe(null);
    expect(maskBankDetailsForAdmin('Bank: HDFC | A/C: 5010023456789 | Name: X')).toContain('•••••••••6789');
  });
});

describe('beneficiaryKycNameMatch withdrawal gate', () => {
  const userId = 'usr_bnm_match_1';
  const walletId = 'w_bnm_match_1';
  const prevFlag = process.env.WITHDRAWAL_REQUIRE_BENEFICIARY_KYC_MATCH;

  beforeEach(async () => {
    process.env.WITHDRAWAL_REQUIRE_BENEFICIARY_KYC_MATCH = '0';
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userId, `${userId}@example.com`]);
    await query(`
      INSERT INTO user_profiles (user_id, account_status, kyc_status, date_of_birth)
      VALUES ($1, 'ACTIVE', 'VERIFIED', '1990-01-01')
      ON CONFLICT (user_id) DO UPDATE SET kyc_status = 'VERIFIED', account_status = 'ACTIVE', date_of_birth = '1990-01-01';
    `, [userId]);
    await query(`DELETE FROM kyc_cases WHERE user_id = $1;`, [userId]);
    await query(`
      INSERT INTO kyc_cases (case_id, user_id, status, pan_number, aadhaar_number, updated_at)
      VALUES ($1, $2, 'VERIFIED', 'BNMTC1234A', '911122223333', NOW())
      ON CONFLICT (case_id) DO UPDATE SET status = 'VERIFIED', pan_number = EXCLUDED.pan_number, aadhaar_number = EXCLUDED.aadhaar_number;
    `, [`kyc_${userId}`, userId]);
    await query(`DELETE FROM ledger_entries WHERE wallet_id IN (SELECT wallet_id FROM wallets WHERE user_id = $1);`, [userId]);
    await query(`DELETE FROM withdrawals WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM transactions WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM wallets WHERE user_id = $1;`, [userId]);
    await query(`INSERT INTO wallets (wallet_id, user_id, balance, reserved_balance, winnings_balance, currency) VALUES ($1, $2, 5000.00, 0.00, 5000.00, 'INR');`, [walletId, userId]);
  });

  afterEach(() => {
    if (prevFlag === undefined) delete process.env.WITHDRAWAL_REQUIRE_BENEFICIARY_KYC_MATCH;
    else process.env.WITHDRAWAL_REQUIRE_BENEFICIARY_KYC_MATCH = prevFlag;
  });

  it('reports missing verified sources without fabricating names (CASE C)', async () => {
    const evaluation = await evaluateBeneficiaryKycMatch(userId);
    expect(evaluation.kycVerified).toBe(true);
    expect(evaluation.kycNameAvailable).toBe(false);
    expect(evaluation.beneficiaryNameAvailable).toBe(false);
    expect(evaluation.dependency).toBeTruthy();
    expect([
      BENEFICIARY_KYC_MATCH_CODES.KYC_NAME_MISSING,
      BENEFICIARY_KYC_MATCH_CODES.BENEFICIARY_NOT_VERIFIED,
    ]).toContain(evaluation.code);
  });

  it('does not block existing withdrawals when enforcement flag is off', async () => {
    expect(isBeneficiaryKycMatchEnforced()).toBe(false);
    await expect(assertBeneficiaryKycNameMatchForWithdrawal(userId)).resolves.toBeTruthy();
    const res = await withdrawalEngine.requestWithdrawal({
      userId,
      amount: 1000,
      bankDetails: { method: 'UPI', details: 'Name: Someone Else' },
    });
    expect(res.success).toBe(true);
  });

  it('blocks request when enforcement is on and verified beneficiary source is missing', async () => {
    process.env.WITHDRAWAL_REQUIRE_BENEFICIARY_KYC_MATCH = '1';
    expect(isBeneficiaryKycMatchEnforced()).toBe(true);
    await expect(
      withdrawalEngine.requestWithdrawal({ userId, amount: 1000, bankDetails: {} }),
    ).rejects.toMatchObject({
      code: expect.stringMatching(/KYC_IDENTITY_NAME_NOT_AVAILABLE|BENEFICIARY_NOT_VERIFIED|BENEFICIARY_NAME_MISSING/),
    });

    const wRes = await query('SELECT balance, reserved_balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(wRes.rows[0].balance)).toBe(5000);
    expect(parseFloat(wRes.rows[0].reserved_balance)).toBe(0);
  });

  it('blocks approval when enforcement is on even if request was created while gate was off', async () => {
    process.env.WITHDRAWAL_REQUIRE_BENEFICIARY_KYC_MATCH = '0';
    const req = await withdrawalEngine.requestWithdrawal({ userId, amount: 1000, bankDetails: {} });
    process.env.WITHDRAWAL_REQUIRE_BENEFICIARY_KYC_MATCH = '1';

    await expect(
      withdrawalEngine.reviewWithdrawal({
        withdrawalId: req.withdrawalId,
        adminId: 'admin_test',
        decision: 'APPROVE',
      }),
    ).rejects.toMatchObject({
      code: expect.stringMatching(/KYC_IDENTITY_NAME_NOT_AVAILABLE|BENEFICIARY_NOT_VERIFIED|BENEFICIARY_NAME_MISSING/),
    });

    const statusRes = await query('SELECT status FROM withdrawals WHERE withdrawal_id = $1', [req.withdrawalId]);
    expect(String(statusRes.rows[0].status).toUpperCase()).toBe('PENDING_REVIEW');
    const wRes = await query('SELECT balance, reserved_balance FROM wallets WHERE wallet_id = $1', [walletId]);
    expect(parseFloat(wRes.rows[0].reserved_balance)).toBe(1000);
  });
});
