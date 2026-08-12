import { describe, it, expect, beforeEach } from 'vitest';
import { generateRiskSignal, updateFraudCaseStatus } from '../../lib/riskSignalEngine.mjs';
import { query } from '../../db/pg.js';

describe('Phase 9 High-Risk Auto-Flagging & Fraud Case Lifecycle Tests', () => {
  const userId = 'usr_auto_flag_101';

  beforeEach(async () => {
    await query(`INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, 'hash') ON CONFLICT (user_id) DO NOTHING;`, [userId, `${userId}@example.com`]);
    await query(`DELETE FROM risk_signals WHERE user_id = $1;`, [userId]);
    await query(`DELETE FROM fraud_cases WHERE user_id = $1;`, [userId]);
  });

  it('CRITICAL: cumulative risk score >= 50 -> automatically creates fraud_cases entry & sets HIGH risk tier', async () => {
    // Generate Signal 1 (score 25)
    await generateRiskSignal({ userId, signalType: 'DEVICE_CLUSTER_DETECTED', score: 25 });
    // Generate Signal 2 (score 30) -> Total score = 55
    const res2 = await generateRiskSignal({ userId, signalType: 'RAPID_PAYMENT_CYCLE', score: 30 });

    expect(res2.totalScore).toBe(55);
    expect(res2.riskTier).toBe('HIGH');
    expect(res2.caseId).toBeDefined();

    // Verify Fraud Case created in PostgreSQL
    const dbCase = await query('SELECT * FROM fraud_cases WHERE id = $1', [res2.caseId]);
    expect(dbCase.rows.length).toBe(1);
    expect(dbCase.rows[0].status).toBe('OPEN');
    expect(dbCase.rows[0].risk_score).toBe(55);

    // Verify user_profiles risk_tier updated
    const dbProf = await query('SELECT risk_tier FROM user_profiles WHERE user_id = $1', [userId]);
    expect(dbProf.rows[0].risk_tier).toBe('HIGH');
  });

  it('should process fraud case status update by investigator', async () => {
    const res = await generateRiskSignal({ userId, signalType: 'DUPLICATE_PAN', score: 60 });
    const caseId = res.caseId;

    const updateRes = await updateFraudCaseStatus({
      caseId,
      status: 'INVESTIGATING',
      notes: 'Investigating shared PAN with account usr_102',
      investigatorId: 'admin_fraud_investigator',
    });

    expect(updateRes.success).toBe(true);
    expect(updateRes.status).toBe('INVESTIGATING');

    const dbCase = await query('SELECT status, assigned_investigator FROM fraud_cases WHERE id = $1', [caseId]);
    expect(dbCase.rows[0].status).toBe('INVESTIGATING');
    expect(dbCase.rows[0].assigned_investigator).toBe('admin_fraud_investigator');
  });
});
