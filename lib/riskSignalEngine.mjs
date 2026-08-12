import { query, withTransaction } from '../db/pg.js';

/**
 * Centralized Risk Signal & Scoring Engine
 * Distinguishes Risk Signal !== Fraud Confirmation
 */

export async function generateRiskSignal({
  userId,
  signalType,
  severity = 'MEDIUM',
  score = 15,
  source = 'RISK_ENGINE',
  evidence = {},
}) {
  const signalId = `sig_${signalType.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;

  return await withTransaction(async (client) => {
    // 1. Insert Risk Signal
    await client.query(`
      INSERT INTO risk_signals (id, user_id, signal_type, severity, score, source, evidence, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'NEW');
    `, [signalId, userId, signalType, severity, score, source, JSON.stringify(evidence)]);

    // 2. Calculate Total Cumulative Risk Score for User
    const scoreRes = await client.query(`
      SELECT COALESCE(SUM(score), 0) AS total_score
      FROM risk_signals
      WHERE user_id = $1 AND status != 'DISMISSED';
    `, [userId]);

    const totalScore = parseInt(scoreRes.rows[0].total_score, 10);

    // 3. Update Risk Tier in user_profiles
    let riskTier = 'LOW';
    if (totalScore >= 75) riskTier = 'CRITICAL';
    else if (totalScore >= 50) riskTier = 'HIGH';
    else if (totalScore >= 25) riskTier = 'MEDIUM';

    await client.query(`
      INSERT INTO user_profiles (user_id, risk_tier, updated_at)
      VALUES ($2, $1, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO UPDATE
      SET risk_tier = EXCLUDED.risk_tier, updated_at = CURRENT_TIMESTAMP;
    `, [riskTier, userId]);

    // 4. Auto-Create Fraud Case if Cumulative Risk Score >= 50
    let caseId = null;
    if (totalScore >= 50) {
      const existingCase = await client.query(`
        SELECT id FROM fraud_cases WHERE user_id = $1 AND status IN ('OPEN', 'INVESTIGATING');
      `, [userId]);

      if (existingCase.rows.length === 0) {
        caseId = `case_frd_${userId}_${Date.now()}`;
        await client.query(`
          INSERT INTO fraud_cases (id, user_id, risk_score, status, notes)
          VALUES ($1, $2, $3, 'OPEN', $4);
        `, [caseId, userId, totalScore, `Auto-generated case for cumulative risk score ${totalScore} (${signalType})`]);
      } else {
        caseId = existingCase.rows[0].id;
        await client.query(`
          UPDATE fraud_cases SET risk_score = $1 WHERE id = $2;
        `, [totalScore, caseId]);
      }
    }

    return { success: true, signalId, userId, signalType, score, totalScore, riskTier, caseId };
  });
}

/**
 * Fraud Case Management
 */
export async function updateFraudCaseStatus({
  caseId,
  status, // OPEN | INVESTIGATING | ESCALATED | CONFIRMED | DISMISSED | RESOLVED
  notes = '',
  resolution = '',
  investigatorId = 'ADMIN',
}) {
  const isResolved = ['RESOLVED', 'DISMISSED', 'CONFIRMED'].includes(status);
  await query(`
    UPDATE fraud_cases
    SET status = $1, notes = $2, resolution = $3, assigned_investigator = $4,
        resolved_at = CASE WHEN $5 = true THEN CURRENT_TIMESTAMP ELSE resolved_at END
    WHERE id = $6;
  `, [status, notes, resolution, investigatorId, isResolved, caseId]);

  return { success: true, caseId, status, investigatorId };
}

/**
 * Rapid Payment Cycle Detector (Deposit -> Immediate Withdrawal)
 */
export async function detectRapidPaymentCycle(userId) {
  const txRes = await query(`
    SELECT type, amount, created_at
    FROM transactions
    WHERE user_id = $1 AND status = 'COMPLETED'
    ORDER BY created_at DESC
    LIMIT 5;
  `, [userId]);

  const rows = txRes.rows;
  if (rows.length >= 2) {
    const latest = rows[0];
    const prev = rows[1];

    if (latest.type === 'WITHDRAWAL' && prev.type === 'DEPOSIT') {
      const timeDiffMs = new Date(latest.created_at) - new Date(prev.created_at);
      if (timeDiffMs < 10 * 60 * 1000) { // Under 10 mins
        return await generateRiskSignal({
          userId,
          signalType: 'RAPID_PAYMENT_CYCLE',
          severity: 'HIGH',
          score: 30,
          source: 'PAYMENT_AUDITOR',
          evidence: { depositAmount: prev.amount, withdrawalAmount: latest.amount, timeDiffSeconds: Math.round(timeDiffMs / 1000) },
        });
      }
    }
  }
  return { detected: false };
}
